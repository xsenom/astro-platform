import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

type SegmentKey =
    | "admins_test"
    | "paid"
    | "no_paid"
    | "calculations"
    | "inactive_30d"
    | "all"
    | "manual_list"
    | "zodiac_aries"
    | "zodiac_taurus"
    | "zodiac_gemini"
    | "zodiac_cancer"
    | "zodiac_leo"
    | "zodiac_virgo"
    | "zodiac_libra"
    | "zodiac_scorpio"
    | "zodiac_sagittarius"
    | "zodiac_capricorn"
    | "zodiac_aquarius"
    | "zodiac_pisces";

type CampaignRecipient = {
    id: string;
    email: string;
    full_name: string | null;
    updated_at?: string | null;
    zodiac_sign?: string | null;
    profile_id?: string | null;
};

function sanitizeRecipient(recipient: CampaignRecipient): CampaignRecipient {
    return { id: recipient.id, email: recipient.email, full_name: recipient.full_name, profile_id: recipient.profile_id ?? recipient.id };
}

const LIVE_SEGMENTS: Array<{ key: Exclude<SegmentKey, "admins_test">; label: string }> = [
    { key: "manual_list", label: "Ручной список контактов" },
    { key: "paid", label: "С оплатой" },
    { key: "no_paid", label: "Без оплат" },
    { key: "calculations", label: "С расчётами" },
    { key: "inactive_30d", label: "Неактивные 30 дней" },
    { key: "all", label: "Вся база" },
    { key: "zodiac_aries", label: "Овен" },
    { key: "zodiac_taurus", label: "Телец" },
    { key: "zodiac_gemini", label: "Близнецы" },
    { key: "zodiac_cancer", label: "Рак" },
    { key: "zodiac_leo", label: "Лев" },
    { key: "zodiac_virgo", label: "Дева" },
    { key: "zodiac_libra", label: "Весы" },
    { key: "zodiac_scorpio", label: "Скорпион" },
    { key: "zodiac_sagittarius", label: "Стрелец" },
    { key: "zodiac_capricorn", label: "Козерог" },
    { key: "zodiac_aquarius", label: "Водолей" },
    { key: "zodiac_pisces", label: "Рыбы" },
];

function getEnv(name: string): string | null {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : null;
}

async function getAdminRecipients(): Promise<CampaignRecipient[]> {
    const { data: admins, error: adminsError } = await getAdminClient().from("admin_users").select("user_id");
    if (adminsError) throw new Error(adminsError.message);

    const adminIds = (admins ?? []).map((row) => row.user_id).filter(Boolean);
    if (!adminIds.length) return [];

    const { data: profiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("id, email, full_name")
        .in("id", adminIds)
        .not("email", "is", null);

    if (profilesError) throw new Error(profilesError.message);

    return (profiles ?? [])
        .filter((profile) => typeof profile.email === "string" && profile.email.trim())
        .map((profile) => ({
            id: profile.id,
            email: String(profile.email).trim(),
            full_name: profile.full_name,
            profile_id: profile.id,
        }));
}

async function getRecipients(segment: Exclude<SegmentKey, "admins_test">, manualEmails: string[] = []): Promise<CampaignRecipient[]> {
    const { data: profiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("id, email, full_name, updated_at, zodiac_sign, marketing_email_opt_in, is_blocked")
        .not("email", "is", null);

    if (profilesError) throw new Error(profilesError.message);

    const recipients = (profiles ?? [])
        .filter((profile) => typeof profile.email === "string" && profile.email.trim())
        .filter((profile) => profile.marketing_email_opt_in !== false)
        .filter((profile) => profile.is_blocked !== true)
        .map((profile) => ({
            id: profile.id,
            email: String(profile.email).trim(),
            full_name: profile.full_name,
            updated_at: profile.updated_at as string | null,
            zodiac_sign: profile.zodiac_sign as string | null,
            profile_id: profile.id,
        }));

    if (segment === "manual_list") {
        const normalized = new Set(manualEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
        const known = recipients.filter((recipient) => normalized.has(recipient.email.toLowerCase())).map(sanitizeRecipient);
        const knownSet = new Set(known.map((item) => item.email.toLowerCase()));
        const missingEmails = [...normalized].filter((email) => !knownSet.has(email));

        if (!missingEmails.length) return known;

        const { data: contacts } = await getAdminClient()
            .from("marketing_contacts")
            .select("id, email, full_name")
            .in("email", missingEmails);

        const fromContacts = (contacts ?? []).map((contact) => ({
            id: String(contact.id),
            email: String(contact.email).trim(),
            full_name: (contact.full_name as string | null) ?? null,
            profile_id: null,
        }));

        return [...known, ...fromContacts];
    }

    if (segment.startsWith("zodiac_")) {
        const zodiacKey = segment.replace("zodiac_", "");
        return recipients.filter((recipient) => recipient.zodiac_sign === zodiacKey).map(sanitizeRecipient);
    }

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
    const isTest = body.test_mode === true;
    const resolvedSegmentKey: SegmentKey = isTest ? "admins_test" : segmentKey;
    const subject = String(body.subject || "").trim();
    const html = String(body.html || "").trim();
    const text = String(body.text || "").trim();
    const manualEmails: string[] = Array.isArray(body.manual_emails)
        ? body.manual_emails.map((item: unknown) => String(item || "").trim().toLowerCase()).filter(Boolean)
        : [];

    const sendingToAdmins = isTest || segmentKey === "admins_test";

    if (!sendingToAdmins && !LIVE_SEGMENTS.some((segment) => segment.key === segmentKey)) {
        return NextResponse.json({ ok: false, error: "Unknown segment" }, { status: 400 });
    }

    if (!subject) return NextResponse.json({ ok: false, error: "Укажите тему письма." }, { status: 400 });
    if (!html && !text) return NextResponse.json({ ok: false, error: "Добавьте HTML или текст письма." }, { status: 400 });

    const recipients = sendingToAdmins
        ? await getAdminRecipients()
        : await getRecipients(segmentKey as Exclude<SegmentKey, "admins_test">, manualEmails);
    if (!recipients.length) {
        return NextResponse.json({ ok: false, error: "В выбранном сегменте нет получателей." }, { status: 400 });
    }

    const from = getEnv("SMTP_FROM");
    const replyTo = getEnv("SMTP_REPLY_TO") || from;
    if (!from) return NextResponse.json({ ok: false, error: "Не задан SMTP_FROM." }, { status: 500 });

    let campaignId: string | null = null;
    let auditWarning: string | null = null;

    if (segmentKey === "manual_list" && manualEmails.length) {
        const normalized = [...new Set<string>(manualEmails.map((email: string) => email.trim().toLowerCase()).filter(Boolean))];
        const { data: existingProfiles } = await getAdminClient().from("profiles").select("email").in("email", normalized);
        const existingProfileSet = new Set((existingProfiles ?? []).map((row) => String(row.email || "").toLowerCase()).filter(Boolean));
        const missingForContacts = normalized.filter((email) => !existingProfileSet.has(email));
        if (missingForContacts.length) {
            await getAdminClient()
                .from("marketing_contacts")
                .upsert(
                    missingForContacts.map((email) => ({
                        email,
                        full_name: null,
                        source: "manual_campaign",
                        marketing_email_opt_in: true,
                        created_by: admin.userId,
                    })),
                    { onConflict: "email" }
                );
        }
    }

    const campaignInsert = await getAdminClient()
        .from("email_campaigns")
        .insert({
            created_by: admin.userId,
            segment_key: resolvedSegmentKey,
            subject,
            html_body: html || null,
            text_body: text || null,
            status: isTest ? "sending_test" : "sending",
            recipients_count: recipients.length,
        })
        .select("id")
        .single();

    if (campaignInsert.error) {
        const message = campaignInsert.error.message || "Не удалось сохранить кампанию.";
        if (!message.toLowerCase().includes("stack depth limit exceeded")) {
            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }
        auditWarning = "Логи рассылки не сохранились: вероятна рекурсия в БД (stack depth limit exceeded) для email_campaigns.";
    } else {
        campaignId = campaignInsert.data.id as string;
    }
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
                replyTo: replyTo || undefined,
            });
            sent += 1;
            recipientLogs.push({ campaign_id: campaignId, profile_id: recipient.profile_id ?? null, email: recipient.email, status: "sent", error_message: null });
        } catch (error) {
            failed += 1;
            recipientLogs.push({
                campaign_id: campaignId,
                profile_id: recipient.profile_id ?? null,
                email: recipient.email,
                status: "failed",
                error_message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    if (campaignId && recipientLogs.length) {
        const recipientsInsert = await getAdminClient().from("email_campaign_recipients").insert(recipientLogs);
        if (recipientsInsert.error && recipientsInsert.error.message.toLowerCase().includes("stack depth limit exceeded")) {
            auditWarning = auditWarning || "Логи получателей не сохранились: вероятна рекурсия в БД (stack depth limit exceeded).";
        }
    }

    const status = failed > 0 ? (sent > 0 ? (isTest ? "partial_test" : "partial") : (isTest ? "failed_test" : "failed")) : (isTest ? "sent_test" : "sent");

    if (campaignId) {
        const campaignUpdate = await getAdminClient()
            .from("email_campaigns")
            .update({ status, sent_count: sent, failed_count: failed, sent_at: new Date().toISOString() })
            .eq("id", campaignId);
        if (campaignUpdate.error && campaignUpdate.error.message.toLowerCase().includes("stack depth limit exceeded")) {
            auditWarning = auditWarning || "Статус кампании не обновился: вероятна рекурсия в БД (stack depth limit exceeded).";
        }
    }

    return NextResponse.json({
        ok: true,
        campaign_id: campaignId,
        status,
        sent_count: sent,
        failed_count: failed,
        recipients_count: recipients.length,
        reply_to: replyTo,
        test_mode: isTest,
        warning: auditWarning,
    });
}
