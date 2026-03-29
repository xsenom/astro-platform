import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { buildCommonEmailFooterHtml, buildCommonEmailFooterText } from "@/lib/email/shared-footer";
import { sendSmtpMail } from "@/lib/email/smtp";

function getGuidePdfConfig() {
    const externalUrl = (process.env.URANUS_GUIDE_PDF_URL || process.env.NEXT_PUBLIC_URANUS_GUIDE_PDF_URL || "").trim();
    const localPath = (process.env.URANUS_GUIDE_PDF_PATH || "/guides/uran-v-bliznetsah.pdf").trim();
    return { externalUrl, localPath };
}

function buildAbsoluteUrl(req: NextRequest, publicPath: string) {
    const normalizedPath = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
    return new URL(normalizedPath, req.nextUrl.origin).toString();
}

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function normalizePublicPath(rawPath: string) {
    const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (normalized.includes("..")) return "/guides/uran-v-bliznetsah.pdf";
    return normalized;
}

async function tryLoadAttachmentFromPublic(publicPath: string) {
    try {
        const relPath = normalizePublicPath(publicPath).replace(/^\//, "");
        const absPath = path.join(process.cwd(), "public", relPath);
        const content = await fs.readFile(absPath);
        return {
            filename: path.basename(relPath),
            content,
            contentType: "application/pdf",
        };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const email = normalizeEmail(body?.email);
        const fullName = String(body?.full_name || "").trim();
        const acceptedPersonalData = body?.accepted_personal_data === true;
        const acceptedAds = body?.accepted_ads === true;

        if (!fullName) {
            return NextResponse.json({ ok: false, error: "Укажите имя." }, { status: 400 });
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ ok: false, error: "Укажите корректный email." }, { status: 400 });
        }

        if (!acceptedPersonalData) {
            return NextResponse.json(
                { ok: false, error: "Нужно согласие на обработку персональных данных." },
                { status: 400 }
            );
        }

        if (!acceptedAds) {
            return NextResponse.json(
                { ok: false, error: "Нужно согласие на получение рекламной информации." },
                { status: 400 }
            );
        }

        const { externalUrl, localPath } = getGuidePdfConfig();
        const resolvedLocalPath = normalizePublicPath(localPath || "/guides/uran-v-bliznetsah.pdf");
        const guidePdfUrl = externalUrl || buildAbsoluteUrl(req, resolvedLocalPath);

        const admin = getAdminClient();
        const nowIso = new Date().toISOString();

        const { error: upsertError } = await admin
            .from("marketing_contacts")
            .upsert(
                {
                    email,
                    full_name: fullName,
                    source: "uranus_guide_pdf",
                    marketing_email_opt_in: true,
                    updated_at: nowIso,
                },
                { onConflict: "email" }
            );

        if (upsertError) {
            console.error("[guide-request] marketing_contacts upsert failed", upsertError);
            return NextResponse.json({ ok: false, error: "Не удалось сохранить заявку." }, { status: 500 });
        }

        const smtpHost = process.env.SMTP_HOST || "";
        const smtpPort = Number(process.env.SMTP_PORT || "0");
        const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
        const smtpUser = process.env.SMTP_USER || "";
        const smtpPass = process.env.SMTP_PASS || "";
        const smtpFrom = process.env.SMTP_FROM || "";

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "SMTP не настроен: письмо с путеводителем отправить нельзя.",
                },
                { status: 500 }
            );
        }

        const subject = "Путеводитель по Урану в Близнецах";
        const baseText = [
            `Здравствуйте, ${fullName}!`,
            "",
            "Вы можете скачать из этого письма ваш путеводитель по Урану в Близнецах.",
            "Файл во вложении.",
            "",
            "Служба заботы проекта «Татьяна Ермолина».",
            "",
            `Если вложение не открылось, используйте ссылку: ${guidePdfUrl}`,
        ].join("\n");
        const text = `${baseText}${buildCommonEmailFooterText(email)}`;

        const baseHtml = `
          <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55">
            <p>Здравствуйте, ${fullName}!</p>
            <p>Вы можете скачать из этого письма ваш путеводитель по Урану в Близнецах.</p>
            <p><strong>Файл во вложении.</strong></p>
            <p>Служба заботы проекта «Татьяна Ермолина».</p>
            <p>Если вложение не открылось: <a href="${guidePdfUrl}" target="_blank" rel="noopener noreferrer">Открыть путеводитель</a>.</p>
          </div>
        `;
        const html = `${baseHtml}${buildCommonEmailFooterHtml(email)}`;

        const attachment = await tryLoadAttachmentFromPublic(resolvedLocalPath);
        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            from: smtpFrom,
            to: email,
            subject,
            text,
            html,
            attachments: attachment ? [attachment] : undefined,
        });

        return NextResponse.json({ ok: true, pdf_url: guidePdfUrl, has_attachment: Boolean(attachment) });
    } catch (error) {
        console.error("[guide-request][POST] failed", error);
        return NextResponse.json({ ok: false, error: "Внутренняя ошибка сервера." }, { status: 500 });
    }
}
