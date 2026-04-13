import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";
import { getZodiacSign } from "@/lib/astro/zodiac";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type UpdateUserPayload = {
    userId?: string;
    email?: string | null;
    full_name?: string | null;
    birth_date?: string | null;
    birth_time?: string | null;
    birth_city?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_term?: string | null;
    utm_content?: string | null;
    utm_referrer?: string | null;
    marketing_email_opt_in?: boolean;
    is_blocked?: boolean;
};

type UserActionPayload = {
    action?: string;
    userId?: string;
    email?: string | null;
    targetEmail?: string | null;
};

function parsePositiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
}

function escapeLike(value: string) {
    return value.replace(/[,%]/g, (char) => `\\${char}`);
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeOptional(value: string | null | undefined) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function normalizeSiteUrl(value: string | null | undefined) {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    const normalized = raw.replace(/\/$/, "");

    if (normalized.includes("app.astroschool.site")) {
        return "";
    }

    return normalized;
}

function getSiteUrl(req: NextRequest) {
    const configured =
        normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
        normalizeSiteUrl(process.env.SITE_URL) ||
        normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL);

    if (configured) return configured;

    const origin = req.nextUrl.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return "";
    }

    return normalizeSiteUrl(origin) || "https://starstalking.ru";
}

function getResetRedirectUrl(req: NextRequest) {
    const siteUrl = getSiteUrl(req);
    if (!siteUrl) return "";
    return `${siteUrl}/reset-password`;
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const page = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
        const pageSize = Math.min(
            parsePositiveInt(req.nextUrl.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
            MAX_PAGE_SIZE
        );
        const q = (req.nextUrl.searchParams.get("q") || "").trim();
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = getAdminClient()
            .from("profiles")
            .select("id, email, full_name, birth_date, birth_time, birth_city, zodiac_sign, utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_referrer, marketing_email_opt_in, is_blocked, created_at, updated_at", {
                count: "exact",
            })
            .order("created_at", { ascending: false });

        if (q) {
            const safeQuery = escapeLike(q);
            const filters = [`email.ilike.%${safeQuery}%`, `full_name.ilike.%${safeQuery}%`];

            if (isUuid(q)) {
                filters.push(`id.eq.${q}`);
            }

            query = query.or(filters.join(","));
        }

        const { data, count, error } = await query.range(from, to);

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const ids = (data ?? []).map((row) => row.id).filter(Boolean);
        const { data: relatedRows } = ids.length
            ? await getAdminClient().from("user_related_profiles").select("user_id").in("user_id", ids)
            : { data: [] as Array<{ user_id: string }> };

        const relatedCounts = (relatedRows ?? []).reduce<Record<string, number>>((acc, row) => {
            acc[row.user_id] = (acc[row.user_id] ?? 0) + 1;
            return acc;
        }, {});

        const total = count ?? 0;
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);

        return NextResponse.json({
            ok: true,
            profiles: (data ?? []).map((row) => ({
                ...row,
                related_profiles_count: relatedCounts[row.id] ?? 0,
            })),
            pagination: {
                page,
                pageSize,
                total,
                totalPages,
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json()) as UpdateUserPayload;
        const userId = body.userId?.trim();

        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ ok: false, error: "Некорректный userId." }, { status: 400 });
        }

        const email = normalizeOptional(body.email)?.toLowerCase() ?? null;
        if (!email) {
            return NextResponse.json({ ok: false, error: "Email не может быть пустым." }, { status: 400 });
        }

        const fullName = normalizeOptional(body.full_name);
        const birthDate = normalizeOptional(body.birth_date);
        const birthTime = normalizeOptional(body.birth_time);
        const birthCity = normalizeOptional(body.birth_city);
        const zodiacSign = getZodiacSign(birthDate);

        const adminClient = getAdminClient();

        const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email });
        if (authError) {
            return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
        }

        const { data, error } = await adminClient
            .from("profiles")
            .update({
                email,
                full_name: fullName,
                birth_date: birthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                zodiac_sign: zodiacSign,
                utm_source: normalizeOptional(body.utm_source),
                utm_medium: normalizeOptional(body.utm_medium),
                utm_campaign: normalizeOptional(body.utm_campaign),
                utm_term: normalizeOptional(body.utm_term),
                utm_content: normalizeOptional(body.utm_content),
                utm_referrer: normalizeOptional(body.utm_referrer),
                marketing_email_opt_in: body.marketing_email_opt_in !== false,
                is_blocked: body.is_blocked === true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select("id, email, full_name, birth_date, birth_time, birth_city, zodiac_sign, utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_referrer, marketing_email_opt_in, is_blocked, created_at, updated_at")
            .single();

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, profile: data });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json()) as UserActionPayload;
        const adminClient = getAdminClient();

        if (body.action === "merge_by_email") {
            const targetEmail = normalizeOptional(body.targetEmail)?.toLowerCase() ?? null;
            if (!targetEmail) {
                return NextResponse.json({ ok: false, error: "Укажите email для объединения." }, { status: 400 });
            }

            const { data: duplicates, error: duplicatesError } = await adminClient
                .from("profiles")
                .select("id, created_at")
                .eq("email", targetEmail)
                .order("created_at", { ascending: true });

            if (duplicatesError) {
                return NextResponse.json({ ok: false, error: duplicatesError.message }, { status: 500 });
            }

            if (!duplicates || duplicates.length < 2) {
                return NextResponse.json({ ok: true, message: "Дубликаты для объединения не найдены." });
            }

            const primaryUserId = duplicates[0].id as string;
            const duplicateIds = duplicates.slice(1).map((row) => row.id as string);

            for (const duplicateId of duplicateIds) {
                await adminClient.from("orders").update({ user_id: primaryUserId }).eq("user_id", duplicateId);
                await adminClient.from("calculations").update({ user_id: primaryUserId }).eq("user_id", duplicateId);
                await adminClient.from("support_threads").update({ user_id: primaryUserId }).eq("user_id", duplicateId);
                await adminClient.from("user_related_profiles").update({ user_id: primaryUserId }).eq("user_id", duplicateId);
            }

            await adminClient.from("profiles").delete().in("id", duplicateIds);

            return NextResponse.json({
                ok: true,
                message: `Объединили ${duplicateIds.length + 1} карточек.`,
                primaryUserId,
            });
        }

        const userId = body.userId?.trim();
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ ok: false, error: "Некорректный userId." }, { status: 400 });
        }

        if (body.action === "set_blocked") {
            const { error } = await adminClient
                .from("profiles")
                .update({ is_blocked: true, updated_at: new Date().toISOString() })
                .eq("id", userId);

            if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, message: "Пользователь заблокирован." });
        }

        if (body.action === "set_unblocked") {
            const { error } = await adminClient
                .from("profiles")
                .update({ is_blocked: false, updated_at: new Date().toISOString() })
                .eq("id", userId);

            if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, message: "Пользователь разблокирован." });
        }

        if (body.action !== "send_password_reset") {
            return NextResponse.json({ ok: false, error: "Неизвестное действие." }, { status: 400 });
        }

        let email = normalizeOptional(body.email)?.toLowerCase() ?? null;

        if (!email) {
            const { data: profile, error: profileError } = await adminClient
                .from("profiles")
                .select("email")
                .eq("id", userId)
                .maybeSingle();

            if (profileError) {
                return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
            }

            email = normalizeOptional(profile?.email)?.toLowerCase() ?? null;
        }

        if (!email) {
            return NextResponse.json({ ok: false, error: "У пользователя не указан email." }, { status: 400 });
        }

        const redirectTo = getResetRedirectUrl(req);

        const { data, error } = await adminClient.auth.admin.generateLink({
            type: "recovery",
            email,
            options: redirectTo ? { redirectTo } : undefined,
        });

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const tokenHash = data.properties?.hashed_token ?? null;
        const fallbackActionLink = data.properties?.action_link ?? null;
        const actionLink = tokenHash && redirectTo
            ? `${redirectTo}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
            : fallbackActionLink;

        if (!actionLink) {
            return NextResponse.json(
                { ok: false, error: "Не удалось сгенерировать ссылку для сброса пароля." },
                { status: 500 }
            );
        }

        const smtpHost = String(process.env.SMTP_HOST || "").trim();
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpSecure = String(process.env.SMTP_SECURE || "false").trim() === "true";
        const smtpUser = String(process.env.SMTP_USER || "").trim();
        const smtpPass = String(process.env.SMTP_PASS || "").trim();
        const smtpFrom = String(process.env.SMTP_FROM || smtpUser).trim();
        const smtpFromName = String(
            process.env.SMTP_FROM_NAME || "Центр прогнозов Татьяны Ермолиной"
        ).trim();
        const smtpReplyTo = String(process.env.SMTP_REPLY_TO || smtpFrom).trim();

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            return NextResponse.json(
                { ok: false, error: "SMTP не настроен для отправки письма сброса пароля." },
                { status: 500 }
            );
        }

        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            fromEmail: smtpFrom,
            fromName: smtpFromName,
            to: email,
            replyTo: smtpReplyTo,
            subject: "Сброс пароля",
            text:
                `Здравствуйте!\n\n` +
                `Чтобы сбросить пароль, перейдите по ссылке:\n${actionLink}\n\n` +
                `Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.\n\n` +
                `ЦЕНТР ПРОГНОЗОВ ТАТЬЯНЫ ЕРМОЛИНОЙ\n` +
                `ИП Ермолина Т.Н.\n` +
                `ОГРНИП 310618111700022\n` +
                `ИНН 300401721008`,
            html:
                `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1f2937">` +
                `<p>Здравствуйте!</p>` +
                `<p>Чтобы сбросить пароль, нажмите на кнопку ниже.</p>` +
                `<p><a href="${actionLink}" target="_blank" rel="noopener noreferrer" ` +
                `style="display:inline-block;padding:12px 18px;border-radius:10px;background:#d7b46d;color:#0b1226;text-decoration:none;font-weight:700;">` +
                `Сбросить пароль</a></p>` +
                `<p>Если вы не запрашивали смену пароля, просто проигнорируйте это письмо.</p>` +
                `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />` +
                `<div style="font-size:13px;line-height:1.5;color:#6b7280;">` +
                `<p style="margin:0 0 8px 0;"><strong>ЦЕНТР ПРОГНОЗОВ ТАТЬЯНЫ ЕРМОЛИНОЙ</strong></p>` +
                `<p style="margin:0;">ИП Ермолина Т.Н.<br>ОГРНИП 310618111700022<br>ИНН 300401721008</p>` +
                `</div>` +
                `</div>`,
        });

        return NextResponse.json({
            ok: true,
            message: `Письмо для сброса пароля отправлено на ${email}.`,
            email,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}