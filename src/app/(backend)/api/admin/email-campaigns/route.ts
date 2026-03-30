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
    return {
        id: recipient.id,
        email: recipient.email,
        full_name: recipient.full_name,
        updated_at: recipient.updated_at ?? null,
        zodiac_sign: recipient.zodiac_sign ?? null,
        profile_id: recipient.profile_id ?? null,
    };
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

function uniqueEmails(values: string[]): string[] {
    return [...new Set(values.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))];
}

async function getAdminRecipients(): Promise<CampaignRecipient[]> {
    console.log("[email-campaigns] getAdminRecipients: start");

    const { data: admins, error: adminsError } = await getAdminClient()
        .from("admin_users")
        .select("user_id");

    if (adminsError) {
        console.error("[email-campaigns] getAdminRecipients: admin_users error", adminsError);
        throw new Error(adminsError.message);
    }

    const adminIds = (admins ?? []).map((row) => row.user_id).filter(Boolean);

    console.log("[email-campaigns] getAdminRecipients: adminIds", adminIds);

    if (!adminIds.length) {
        console.log("[email-campaigns] getAdminRecipients: no admin ids");
        return [];
    }

    const { data: profiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("id, email, full_name, updated_at")
        .in("id", adminIds)
        .not("email", "is", null);

    if (profilesError) {
        console.error("[email-campaigns] getAdminRecipients: profiles error", profilesError);
        throw new Error(profilesError.message);
    }

    const result = (profiles ?? [])
        .map((row) => ({
            id: String(row.id),
            email: String(row.email || "").trim().toLowerCase(),
            full_name: row.full_name ?? null,
            updated_at: row.updated_at ?? null,
            profile_id: String(row.id),
        }))
        .filter((row) => row.email)
        .map(sanitizeRecipient);

    console.log("[email-campaigns] getAdminRecipients: result count", result.length);

    return result;
}

async function getBaseRecipients(): Promise<CampaignRecipient[]> {
    console.log("[email-campaigns] getBaseRecipients: start");

    const { data: profiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("id, email, full_name, updated_at, zodiac_sign, marketing_email_opt_in, is_blocked")
        .not("email", "is", null)
        .eq("marketing_email_opt_in", true)
        .eq("is_blocked", false);

    if (profilesError) {
        console.error("[email-campaigns] getBaseRecipients: profiles error", profilesError);
        throw new Error(profilesError.message);
    }

    const profileRecipients: CampaignRecipient[] = (profiles ?? [])
        .map((row) => ({
            id: String(row.id),
            email: String(row.email || "").trim().toLowerCase(),
            full_name: row.full_name ?? null,
            updated_at: row.updated_at ?? null,
            zodiac_sign: row.zodiac_sign ?? null,
            profile_id: String(row.id),
        }))
        .filter((row) => row.email);

    console.log("[email-campaigns] getBaseRecipients: profiles count", profileRecipients.length);

    const profileEmailSet = new Set(profileRecipients.map((row) => row.email));

    const { data: contacts, error: contactsError } = await getAdminClient()
        .from("marketing_contacts")
        .select("id, email, full_name, updated_at, zodiac_sign, marketing_email_opt_in")
        .not("email", "is", null)
        .eq("marketing_email_opt_in", true);

    if (contactsError) {
        console.error("[email-campaigns] getBaseRecipients: marketing_contacts error", contactsError);
        throw new Error(contactsError.message);
    }

    const contactRecipients: CampaignRecipient[] = (contacts ?? [])
        .map((row) => ({
            id: String(row.id),
            email: String(row.email || "").trim().toLowerCase(),
            full_name: row.full_name ?? null,
            updated_at: row.updated_at ?? null,
            zodiac_sign: row.zodiac_sign ?? null,
            profile_id: null,
        }))
        .filter((row) => row.email && !profileEmailSet.has(row.email));

    console.log("[email-campaigns] getBaseRecipients: contacts count", contactRecipients.length);

    const result = [...profileRecipients, ...contactRecipients].map(sanitizeRecipient);

    console.log("[email-campaigns] getBaseRecipients: total count", result.length);

    return result;
}

async function getRecipients(
    segmentKey: Exclude<SegmentKey, "admins_test">,
    manualEmails: string[] = []
): Promise<CampaignRecipient[]> {
    console.log("[email-campaigns] getRecipients: start", { segmentKey, manualEmailsCount: manualEmails.length });

    if (segmentKey === "manual_list") {
        const normalized = uniqueEmails(manualEmails);

        console.log("[email-campaigns] getRecipients: manual_list normalized", normalized);

        if (!normalized.length) return [];

        const { data: profiles, error: profilesError } = await getAdminClient()
            .from("profiles")
            .select("id, email, full_name, updated_at")
            .in("email", normalized);

        if (profilesError) {
            console.error("[email-campaigns] getRecipients: manual profiles error", profilesError);
            throw new Error(profilesError.message);
        }

        const profileRecipients: CampaignRecipient[] = (profiles ?? [])
            .map((row) => ({
                id: String(row.id),
                email: String(row.email || "").trim().toLowerCase(),
                full_name: row.full_name ?? null,
                updated_at: row.updated_at ?? null,
                profile_id: String(row.id),
            }))
            .filter((row) => row.email);

        const { data: contacts, error: contactsError } = await getAdminClient()
            .from("marketing_contacts")
            .select("id, email, full_name, updated_at")
            .in("email", normalized);

        if (contactsError) {
            console.error("[email-campaigns] getRecipients: manual contacts error", contactsError);
            throw new Error(contactsError.message);
        }

        const contactRecipients: CampaignRecipient[] = (contacts ?? [])
            .map((row) => ({
                id: String(row.id),
                email: String(row.email || "").trim().toLowerCase(),
                full_name: row.full_name ?? null,
                updated_at: row.updated_at ?? null,
                profile_id: null,
            }))
            .filter((row) => row.email);

        const mergedByEmail = new Map<string, CampaignRecipient>();

        for (const recipient of [...profileRecipients, ...contactRecipients]) {
            if (!mergedByEmail.has(recipient.email)) {
                mergedByEmail.set(recipient.email, sanitizeRecipient(recipient));
            }
        }

        const manualResult = Array.from(mergedByEmail.values());

        console.log("[email-campaigns] getRecipients: manual result count", manualResult.length);

        return manualResult;
    }

    const recipients = await getBaseRecipients();

    if (segmentKey.startsWith("zodiac_")) {
        const zodiac = segmentKey.replace("zodiac_", "");
        const filtered = recipients.filter(
            (recipient) => String(recipient.zodiac_sign || "").toLowerCase() === zodiac
        );
        console.log("[email-campaigns] getRecipients: zodiac filtered count", filtered.length);
        return filtered;
    }

    if (segmentKey === "all") {
        console.log("[email-campaigns] getRecipients: all count", recipients.length);
        return recipients;
    }

    if (segmentKey === "inactive_30d") {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 30);

        const filtered = recipients.filter((recipient) => {
            if (!recipient.updated_at) return true;
            return new Date(recipient.updated_at) < threshold;
        });

        console.log("[email-campaigns] getRecipients: inactive_30d count", filtered.length);
        return filtered;
    }

    if (segmentKey === "paid" || segmentKey === "no_paid") {
        const { data: orders, error } = await getAdminClient()
            .from("orders")
            .select("user_id, status");

        if (error) {
            console.error("[email-campaigns] getRecipients: orders error", error);
            throw new Error(error.message);
        }

        const paidIds = new Set(
            (orders ?? [])
                .filter((row) => ["paid", "succeeded", "success"].includes(String(row.status || "").toLowerCase()))
                .map((row) => row.user_id)
                .filter(Boolean)
        );

        const filtered = recipients.filter((recipient) =>
            segmentKey === "paid" ? paidIds.has(recipient.id) : !paidIds.has(recipient.id)
        );

        console.log("[email-campaigns] getRecipients: paid/no_paid count", filtered.length);

        return filtered.map(sanitizeRecipient);
    }

    if (segmentKey === "calculations") {
        const { data: calculations, error } = await getAdminClient()
            .from("calculations")
            .select("user_id");

        if (error) {
            console.error("[email-campaigns] getRecipients: calculations error", error);
            throw new Error(error.message);
        }

        const calcIds = new Set((calculations ?? []).map((row) => row.user_id).filter(Boolean));

        const filtered = recipients.filter((recipient) => calcIds.has(recipient.id));

        console.log("[email-campaigns] getRecipients: calculations count", filtered.length);

        return filtered.map(sanitizeRecipient);
    }

    console.log("[email-campaigns] getRecipients: fallback count", recipients.length);

    return recipients.map(sanitizeRecipient);
}

function getSmtpConfig() {
    const host = getEnv("SMTP_HOST");
    const port = Number(getEnv("SMTP_PORT") || 587);
    const username = getEnv("SMTP_USER");
    const password = getEnv("SMTP_PASS");
    const secure = String(getEnv("SMTP_SECURE") || "false").toLowerCase() === "true";

    console.log("[email-campaigns] SMTP env check", {
        hasHost: Boolean(host),
        port,
        hasUsername: Boolean(username),
        hasPassword: Boolean(password),
        secure,
    });

    if (!host || !username || !password) {
        throw new Error("SMTP не настроен. Укажите SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и SMTP_FROM.");
    }

    return { host, port, username, password, secure };
}

async function ensureManualContacts(adminUserId: string, manualEmails: string[]) {
    const normalized = uniqueEmails(manualEmails);
    if (!normalized.length) return;

    console.log("[email-campaigns] ensureManualContacts: normalized", normalized);

    const { data: existingProfiles, error: profilesError } = await getAdminClient()
        .from("profiles")
        .select("email")
        .in("email", normalized);

    if (profilesError) {
        console.error("[email-campaigns] ensureManualContacts: profiles error", profilesError);
        throw new Error(profilesError.message);
    }

    const existingProfileSet = new Set(
        (existingProfiles ?? [])
            .map((row) => String(row.email || "").trim().toLowerCase())
            .filter(Boolean)
    );

    const missingForContacts = normalized.filter((email) => !existingProfileSet.has(email));

    console.log("[email-campaigns] ensureManualContacts: missingForContacts", missingForContacts);

    if (!missingForContacts.length) return;

    const { error: upsertError } = await getAdminClient()
        .from("marketing_contacts")
        .upsert(
            missingForContacts.map((email) => ({
                email,
                full_name: null,
                source: "manual_campaign",
                marketing_email_opt_in: true,
                created_by: adminUserId,
            })),
            { onConflict: "email" }
        );

    if (upsertError) {
        console.error("[email-campaigns] ensureManualContacts: upsert error", upsertError);
        throw new Error(upsertError.message);
    }

    console.log("[email-campaigns] ensureManualContacts: upsert done");
}
type EmailLogStatus =
    | "queued"
    | "sent"
    | "failed"
    | "delivered"
    | "opened"
    | "clicked"
    | "bounced"
    | "complained"
    | "unsubscribed";

async function createEmailMessageLog(params: {
    campaignKey: string;
    templateKey: string | null;
    provider: string;
    email: string;
    fullName: string | null;
    subject: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
}) {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
        .from("email_messages")
        .insert({
            campaign_key: params.campaignKey,
            template_key: params.templateKey,
            provider: params.provider,
            email: params.email,
            full_name: params.fullName,
            user_id: params.userId ?? null,
            subject: params.subject,
            status: "queued",
            metadata: params.metadata ?? {},
        })
        .select("id")
        .single();

    if (error) {
        throw new Error(`Не удалось создать лог письма: ${error.message}`);
    }

    return data;
}

async function markEmailMessageSent(params: {
    id: number;
    providerMessageId?: string | null;
    providerResponse?: Record<string, unknown>;
}) {
    const adminClient = getAdminClient();

    const { error } = await adminClient
        .from("email_messages")
        .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: params.providerMessageId ?? null,
            provider_response: params.providerResponse ?? {},
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);

    if (error) {
        throw new Error(`Не удалось обновить лог sent: ${error.message}`);
    }
}

async function markEmailMessageFailed(params: {
    id: number;
    errorMessage: string;
}) {
    const adminClient = getAdminClient();

    const { error } = await adminClient
        .from("email_messages")
        .update({
            status: "failed",
            provider_response: {
                error: params.errorMessage,
            },
            updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);

    if (error) {
        throw new Error(`Не удалось обновить лог failed: ${error.message}`);
    }
}

async function isEmailSuppressed(email: string) {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
        .from("email_suppressions")
        .select("id, reason")
        .eq("email", email.trim().toLowerCase())
        .limit(1);

    if (error) {
        throw new Error(`Не удалось проверить suppression: ${error.message}`);
    }

    return Array.isArray(data) && data.length > 0;
}
export async function POST(req: NextRequest) {
    try {
        console.log("==================================================");
        console.log("[email-campaigns] POST started");

        const admin = await getAdminAuth(req);

        console.log("[email-campaigns] admin:", admin);

        if (!admin) {
            console.log("[email-campaigns] admin not found");
            return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));

        console.log("[email-campaigns] raw body:", body);

        const segmentKey = String(body.segment_key || "all") as SegmentKey;
        const isTest = body.test_mode === true;
        const subject = String(body.subject || "").trim();
        const html = String(body.html || "").trim();
        const text = String(body.text || "").trim();
        const campaignKey = `admin_campaign_${segmentKey}_${new Date().toISOString().slice(0, 10)}`;
        const templateKey = "admin_email_campaign";
        const manualEmails: string[] = Array.isArray(body.manual_emails)
            ? uniqueEmails(body.manual_emails.map((item: unknown) => String(item || "")))
            : [];

        const sendingToAdmins = isTest || segmentKey === "admins_test";

        console.log("[email-campaigns] parsed values:", {
            segmentKey,
            isTest,
            sendingToAdmins,
            subject,
            htmlLength: html.length,
            textLength: text.length,
            manualEmails,
            manualEmailsCount: manualEmails.length,
        });

        if (!sendingToAdmins && !LIVE_SEGMENTS.some((segment) => segment.key === segmentKey)) {
            console.log("[email-campaigns] unknown segment", segmentKey);
            return NextResponse.json({ ok: false, error: "Unknown segment" }, { status: 400 });
        }

        if (!subject) {
            console.log("[email-campaigns] subject is empty");
            return NextResponse.json({ ok: false, error: "Укажите тему письма." }, { status: 400 });
        }

        if (!html && !text) {
            console.log("[email-campaigns] html and text are empty");
            return NextResponse.json({ ok: false, error: "Добавьте HTML или текст письма." }, { status: 400 });
        }

        if (segmentKey === "manual_list" && !sendingToAdmins) {
            if (!manualEmails.length) {
                console.log("[email-campaigns] manual_list but no emails");
                return NextResponse.json({ ok: false, error: "Добавьте хотя бы один email." }, { status: 400 });
            }

            await ensureManualContacts(admin.userId, manualEmails);
        }

        const recipients = sendingToAdmins
            ? await getAdminRecipients()
            : await getRecipients(segmentKey as Exclude<SegmentKey, "admins_test">, manualEmails);

        console.log(
            "[email-campaigns] recipients list:",
            recipients.map((r) => ({
                id: r.id,
                email: r.email,
                full_name: r.full_name,
            }))
        );

        if (!recipients.length) {
            console.log("[email-campaigns] recipients empty");
            return NextResponse.json({ ok: false, error: "В выбранном сегменте нет получателей." }, { status: 400 });
        }

        const from = getEnv("SMTP_FROM");
        const replyTo = getEnv("SMTP_REPLY_TO") || from;
        const origin = getEnv("SITE_URL") || getEnv("NEXT_PUBLIC_SITE_URL") || req.nextUrl.origin;

        console.log("[email-campaigns] env values:", {
            from,
            replyTo,
            origin,
            smtpHost: process.env.SMTP_HOST,
            smtpPort: process.env.SMTP_PORT,
            smtpUser: process.env.SMTP_USER,
            smtpSecure: process.env.SMTP_SECURE,
        });

        if (!from) {
            console.log("[email-campaigns] SMTP_FROM not set");
            return NextResponse.json({ ok: false, error: "Не задан SMTP_FROM." }, { status: 500 });
        }

        const smtp = getSmtpConfig();

        let sent = 0;
        let failed = 0;
        const errors: Array<{ email: string; error: string }> = [];

        for (const recipient of recipients) {
            let emailLogId: number | null = null;

            try {
                console.log("[email-campaigns] processing recipient:", recipient.email);

                const suppressed = await isEmailSuppressed(recipient.email);

                if (suppressed) {
                    failed += 1;

                    errors.push({
                        email: recipient.email,
                        error: "Email в списке исключений (suppression list)",
                    });

                    console.warn("[email-campaigns] skipped suppressed email:", recipient.email);
                    continue;
                }

                const emailLog = await createEmailMessageLog({
                    campaignKey,
                    templateKey,
                    provider: "smtp",
                    email: recipient.email,
                    fullName: recipient.full_name ?? null,
                    subject,
                    userId: recipient.profile_id ?? null,
                    metadata: {
                        segment_key: segmentKey,
                        test_mode: isTest,
                        source: "admin_email_campaigns",
                        origin,
                    },
                });

                emailLogId = emailLog.id;

                console.log("[email-campaigns] sending to:", recipient.email);

                await sendSmtpMail({
                    host: smtp.host,
                    port: smtp.port,
                    secure: smtp.secure,
                    username: smtp.username,
                    password: smtp.password,
                    from,
                    to: recipient.email,
                    subject,
                    text: text || undefined,
                    html: html || undefined,
                    replyTo: replyTo || undefined,
                });

                await markEmailMessageSent({
                    id: emailLogId,
                    providerMessageId: null,
                    providerResponse: {
                        transport: "smtp",
                        reply_to: replyTo,
                        segment_key: segmentKey,
                    },
                });

                sent += 1;

                console.log("[email-campaigns] sent ok:", recipient.email);
            } catch (error) {
                failed += 1;

                const errorMessage = error instanceof Error ? error.message : String(error);

                if (emailLogId) {
                    try {
                        await markEmailMessageFailed({
                            id: emailLogId,
                            errorMessage,
                        });
                    } catch (logError) {
                        console.error("[email-campaigns] failed to mark failed status:", logError);
                    }
                }

                errors.push({
                    email: recipient.email,
                    error: errorMessage,
                });

                console.error("[email-campaigns] send failed:", {
                    email: recipient.email,
                    error: errorMessage,
                });
            }
        }

        const status =
            failed > 0
                ? sent > 0
                    ? "partial"
                    : "failed"
                : "sent";

        console.log("[email-campaigns] finished:", {
            status,
            sent,
            failed,
            recipientsCount: recipients.length,
            errors,
        });

        return NextResponse.json({
            ok: true,
            status,
            sent_count: sent,
            failed_count: failed,
            recipients_count: recipients.length,
            reply_to: replyTo,
            test_mode: isTest,
            errors,
            message:
                status === "sent"
                    ? "Отправлено"
                    : status === "partial"
                        ? "Частично отправлено"
                        : "Ошибка отправки",
        });
    } catch (error) {
        console.error("[email-campaigns][POST] fatal error:", error);

        const message = error instanceof Error ? error.message : "Неизвестная ошибка отправки.";

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}