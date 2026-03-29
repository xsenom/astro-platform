import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { buildCommonEmailFooterHtml, buildCommonEmailFooterText } from "@/lib/email/shared-footer";
import { sendSmtpMail } from "@/lib/email/smtp";

function getGuideConfig() {
    const guidePageUrl = (
        process.env.URANUS_GUIDE_PAGE_URL ||
        "https://starstalking.ru/guide/uran-v-bliznetsah"
    ).trim();

    const guidePdfUrl = (
        process.env.URANUS_GUIDE_PDF_URL ||
        "https://starstalking.ru/guides/uran-v-bliznetsah.pdf"
    ).trim();

    const localPdfPath = (
        process.env.URANUS_GUIDE_PDF_PATH ||
        "/guides/uran-v-bliznetsah.pdf"
    ).trim();

    return {
        guidePageUrl,
        guidePdfUrl,
        localPdfPath,
    };
}

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function normalizePublicPath(rawPath: string) {
    const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    if (normalized.includes("..")) return "/guides/uran-v-bliznetsah.pdf";
    return normalized;
}

function isValidHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function assertPublicUrl(name: string, value: string) {
    if (!value) {
        throw new Error(`${name} is empty`);
    }

    if (!isValidHttpUrl(value)) {
        throw new Error(`${name} must be a valid absolute URL`);
    }

    if (value.includes("localhost") || value.includes("127.0.0.1")) {
        throw new Error(`${name} must not point to localhost`);
    }
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

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const email = normalizeEmail(body?.email);
        const fullName = String(body?.full_name || "").trim();
        const acceptedPersonalData = body?.accepted_personal_data === true;
        const acceptedAds = body?.accepted_ads === true;

        if (!fullName) {
            return NextResponse.json(
                { ok: false, error: "Укажите имя." },
                { status: 400 }
            );
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { ok: false, error: "Укажите корректный email." },
                { status: 400 }
            );
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

        const { guidePageUrl, guidePdfUrl, localPdfPath } = getGuideConfig();
        const resolvedLocalPdfPath = normalizePublicPath(localPdfPath);

        try {
            assertPublicUrl("URANUS_GUIDE_PAGE_URL", guidePageUrl);
            assertPublicUrl("URANUS_GUIDE_PDF_URL", guidePdfUrl);
        } catch (configError) {
            console.error("[guide-request] invalid guide config", configError);

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Ссылки на путеводитель настроены неверно. Проверьте URANUS_GUIDE_PAGE_URL и URANUS_GUIDE_PDF_URL.",
                },
                { status: 500 }
            );
        }

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

            return NextResponse.json(
                { ok: false, error: "Не удалось сохранить заявку." },
                { status: 500 }
            );
        }

        const smtpHost = process.env.SMTP_HOST || "";
        const smtpPort = Number(process.env.SMTP_PORT || "0");
        const smtpSecure =
            String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
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
            "Спасибо за интерес к путеводителю по Урану в Близнецах.",
            "PDF-файл приложен к этому письму.",
            "",
            `Открыть страницу путеводителя: ${guidePageUrl}`,
            `Скачать PDF напрямую: ${guidePdfUrl}`,
            "",
            "Служба заботы проекта «Татьяна Ермолина».",
        ].join("\n");

        const text = `${baseText}${buildCommonEmailFooterText(email)}`;

        const baseHtml = `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55">
        <p>Здравствуйте, ${fullName}!</p>
        <p>Спасибо за интерес к путеводителю по Урану в Близнецах.</p>
        <p><strong>PDF-файл приложен к этому письму.</strong></p>

        <p style="margin:16px 0;">
          <a
            href="${guidePageUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="display:inline-block;padding:12px 18px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;"
          >
            Открыть путеводитель
          </a>
        </p>

        <p>
          Если кнопка не сработала, откройте страницу:
          <a href="${guidePageUrl}" target="_blank" rel="noopener noreferrer">
            ${guidePageUrl}
          </a>
        </p>

        <p>
          Прямая ссылка на PDF:
          <a href="${guidePdfUrl}" target="_blank" rel="noopener noreferrer">
            Скачать путеводитель
          </a>
        </p>

        <p>Служба заботы проекта «Татьяна Ермолина».</p>
      </div>
    `;

        const html = `${baseHtml}${buildCommonEmailFooterHtml(email)}`;

        const attachment = await tryLoadAttachmentFromPublic(resolvedLocalPdfPath);

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

        return NextResponse.json({
            ok: true,
            page_url: guidePageUrl,
            pdf_url: guidePdfUrl,
            has_attachment: Boolean(attachment),
        });
    } catch (error) {
        console.error("[guide-request][POST] failed", error);

        return NextResponse.json(
            { ok: false, error: "Внутренняя ошибка сервера." },
            { status: 500 }
        );
    }
}