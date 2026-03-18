import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

type SegmentKey = "all" | "paid" | "no_paid" | "calculations" | "inactive_30d";

type CampaignRecipient = {
    id: string;
    email: string;
    full_name: string | null;
    updated_at?: string | null;
};

function sanitizeRecipient(recipient: CampaignRecipient): CampaignRecipient {
    return { id: recipient.id, email: recipient.email, full_name: recipient.full_name };
}

const SEGMENTS: Array<{ key: SegmentKey; label: string }> = [
    { key: "all", label: "Вся база" },
    { key: "paid", label: "С оплатой" },
    { key: "no_paid", label: "Без оплат" },
    { key: "calculations", label: "С расчётами" },
    { key: "inactive_30d", label: "Неактивные 30 дней" },
];

function getEnv(name: string): string | null {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : null;
}

async function getRecipients(segment: SegmentKey): Promise<CampaignRecipient[]> {
    const { data: profiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("id, email, full_name, updated_at")
        .not("email", "is", null);

    if (profilesError) throw new Error(profilesError.message);

    const recipients = (profiles ?? [])
        .filter((profile) => typeof profile.email === "string" && profile.email.trim())
        .map((profile) => ({
            id: profile.id,
            email: String(profile.email).trim(),
            full_name: profile.full_name,
            updated_at: profile.updated_at as string | null,
        }));

    if (segment === "all") {
        return recipients.map(sanitizeRecipient);
    }

    if (segment === "inactive_30d") {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return recipients
            .filter((recipient) => !recipient.updated_at || new Date(recipient.updated_at).getTime() < cutoff)
            .map(sanitizeRecipient);
    }

    if (segment === "paid" || segment === "no_paid") {
        const { data: orders, error } = await getAdminClient().from("orders").select("user_id").eq("status", "paid");
        if (error) throw new Error(error.message);
        const paidIds = new Set((orders ?? []).map((row) => row.user_id).filter(Boolean));
        return recipients
            .filter((recipient) => (segment === "paid" ? paidIds.has(recipient.id) : !paidIds.has(recipient.id)))
            .map(sanitizeRecipient);
    }

    const { data: calculations, error } = await getAdminClient().from("calculations").select("user_id");
    if (error) throw new Error(error.message);
    const calcIds = new Set((calculations ?? []).map((row) => row.user_id).filter(Boolean));

    return recipients
        .filter((recipient) => calcIds.has(recipient.id))
        .map(sanitizeRecipient);
}

function getSmtpConfig() {
    const host = getEnv("SMTP_HOST");
    const port = Number(getEnv("SMTP_PORT") || 587);
    const username = getEnv("SMTP_USER");
    const password = getEnv("SMTP_PASS");
    const secure = String(getEnv("SMTP_SECURE") || "false").toLowerCase() === "true";

    if (!host || !username || !password) {
        throw new Error("SMTP не настроен. Укажите SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и SMTP_FROM.");
    }

    return { host, port, username, password, secure };
}

export async function POST(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const segmentKey = String(body.segment_key || "all") as SegmentKey;
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const text = String(body.text || "").trim();

    if (!SEGMENTS.some((segment) => segment.key === segmentKey)) {
        return NextResponse.json({ ok: false, error: "Unknown segment" }, { status: 400 });
    }

    if (!subject) return NextResponse.json({ ok: false, error: "Укажите тему письма." }, { status: 400 });
    if (!html && !text) return NextResponse.json({ ok: false, error: "Добавьте HTML или текст письма." }, { status: 400 });

    const recipients = await getRecipients(segmentKey);
    if (!recipients.length) {
        return NextResponse.json({ ok: false, error: "В выбранном сегменте нет получателей." }, { status: 400 });
    }

    const from = getEnv("SMTP_FROM");
    if (!from) return NextResponse.json({ ok: false, error: "Не задан SMTP_FROM." }, { status: 500 });

    const campaignInsert = await getAdminClient()
        .from("email_campaigns")
        .insert({
            created_by: admin.userId,
            segment_key: segmentKey,
            subject,
            html_body: html || null,
            text_body: text || null,
            status: "sending",
            recipients_count: recipients.length,
        })
        .select("id")
        .single();

    if (campaignInsert.error) {
        return NextResponse.json({ ok: false, error: campaignInsert.error.message }, { status: 500 });
    }

    const campaignId = campaignInsert.data.id as string;
    const smtp = getSmtpConfig();

    let sent = 0;
    let failed = 0;
    const recipientLogs: Array<Record<string, string | null>> = [];

    for (const recipient of recipients) {
        try {
            await sendSmtpMail({
                ...smtp,
                from,
                to: recipient.email,
                subject,
                text: text || undefined,
                html: html || undefined,
            });
            sent += 1;
            recipientLogs.push({ campaign_id: campaignId, profile_id: recipient.id, email: recipient.email, status: "sent", error_message: null });
        } catch (error) {
            failed += 1;
            recipientLogs.push({
                campaign_id: campaignId,
                profile_id: recipient.id,
                email: recipient.email,
                status: "failed",
                error_message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (recipientLogs.length) {
        await getAdminClient().from("email_campaign_recipients").insert(recipientLogs);
    }

    const status = failed > 0 ? (sent > 0 ? "partial" : "failed") : "sent";

    await getAdminClient()
        .from("email_campaigns")
        .update({ status, sent_count: sent, failed_count: failed, sent_at: new Date().toISOString() })
        .eq("id", campaignId);

    return NextResponse.json({
        ok: true,
        campaign_id: campaignId,
        status,
        sent_count: sent,
        failed_count: failed,
        recipients_count: recipients.length,
    });
}
