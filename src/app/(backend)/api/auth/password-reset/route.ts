import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function normalizeOptional(value: string | null | undefined) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function getSiteUrl(req: NextRequest) {
    const configured =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        process.env.SITE_URL?.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim();

    if (configured) return configured.replace(/\/$/, "");

    const origin = req.nextUrl.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return "http://localhost:3000";
    }

    return origin.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as { email?: string | null };
        const email = normalizeOptional(body.email)?.toLowerCase() ?? null;

        if (!email) {
            return NextResponse.json({ ok: false, error: "Укажите email." }, { status: 400 });
        }

        const adminClient = getAdminClient();
        const redirectTo = `${getSiteUrl(req)}/reset-password`;

        const { data, error } = await adminClient.auth.admin.generateLink({
            type: "recovery",
            email,
            options: { redirectTo },
        });

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const tokenHash = data.properties?.hashed_token ?? null;
        const fallbackActionLink = data.properties?.action_link ?? null;
        const actionLink = tokenHash
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

        if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
            return NextResponse.json({ ok: false, error: "SMTP не настроен." }, { status: 500 });
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
            message: "Письмо для сброса пароля отправлено.",
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
