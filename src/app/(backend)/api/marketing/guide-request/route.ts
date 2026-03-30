import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

type GuideConfig = {
    guidePageUrl: string;
    guidePdfUrl: string;
    localPdfPath: string;
};

type AttachmentData = {
    filename: string;
    content: Buffer;
    contentType: string;
};

function getGuideConfig(): GuideConfig {
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

function maskEmail(value: string) {
    const email = String(value || "").trim().toLowerCase();
    const [name, domain] = email.split("@");

    if (!name || !domain) return email;

    if (name.length <= 2) {
        return `${name.slice(0, 1)}***@${domain}`;
    }

    return `${name.slice(0, 2)}***@${domain}`;
}

function normalizePublicPath(rawPath: string) {
    const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    if (normalized.includes("..")) {
        return "/guides/uran-v-bliznetsah.pdf";
    }

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

function normalizeError(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        message: String(error),
    };
}

function logInfo(requestId: string, step: string, payload?: unknown) {
    if (payload !== undefined) {
        console.info(`[guide-request][${requestId}] ${step}`, payload);
        return;
    }

    console.info(`[guide-request][${requestId}] ${step}`);
}

function logWarn(requestId: string, step: string, payload?: unknown) {
    if (payload !== undefined) {
        console.warn(`[guide-request][${requestId}] ${step}`, payload);
        return;
    }

    console.warn(`[guide-request][${requestId}] ${step}`);
}

function logError(requestId: string, step: string, payload?: unknown) {
    if (payload !== undefined) {
        console.error(`[guide-request][${requestId}] ${step}`, payload);
        return;
    }

    console.error(`[guide-request][${requestId}] ${step}`);
}

async function tryLoadAttachmentFromPublic(
    publicPath: string,
    requestId: string
): Promise<AttachmentData | null> {
    try {
        const relPath = normalizePublicPath(publicPath).replace(/^\//, "");
        const absPath = path.join(process.cwd(), "public", relPath);

        logInfo(requestId, "attachment:read:start", {
            publicPath,
            relPath,
            absPath,
        });

        const content = await fs.readFile(absPath);

        logInfo(requestId, "attachment:read:ok", {
            filename: path.basename(relPath),
            bytes: content.length,
        });

        return {
            filename: path.basename(relPath),
            content,
            contentType: "application/pdf",
        };
    } catch (error) {
        logWarn(requestId, "attachment:read:miss", normalizeError(error));
        return null;
    }
}

export async function POST(req: Request) {
    const startedAt = Date.now();
    const requestId =
        req.headers.get("x-request-id") ||
        `guide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let requestLogId: string | null = null;

    logInfo(requestId, "start");

    try {
        let body: any = null;

        try {
            body = await req.json();

            logInfo(requestId, "body:parsed", {
                email: maskEmail(body?.email),
                full_name_length: String(body?.full_name || "").trim().length,
                accepted_personal_data: body?.accepted_personal_data === true,
                accepted_ads: body?.accepted_ads === true,
            });
        } catch (error) {
            logError(requestId, "body:parse-error", normalizeError(error));

            return NextResponse.json(
                {
                    ok: false,
                    error: "Некорректное тело запроса.",
                    request_id: requestId,
                },
                { status: 400 }
            );
        }

        const email = normalizeEmail(body?.email);
        const fullName = String(body?.full_name || "").trim();
        const acceptedPersonalData = body?.accepted_personal_data === true;
        const acceptedAds = body?.accepted_ads === true;

        if (!fullName) {
            logWarn(requestId, "validation:full-name-empty");

            return NextResponse.json(
                {
                    ok: false,
                    error: "Укажите имя.",
                    request_id: requestId,
                },
                { status: 400 }
            );
        }

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            logWarn(requestId, "validation:invalid-email", {
                email: maskEmail(email),
            });

            return NextResponse.json(
                {
                    ok: false,
                    error: "Укажите корректный email.",
                    request_id: requestId,
                },
                { status: 400 }
            );
        }

        if (!acceptedPersonalData) {
            logWarn(requestId, "validation:no-personal-data-consent");

            return NextResponse.json(
                {
                    ok: false,
                    error: "Нужно согласие на обработку персональных данных.",
                    request_id: requestId,
                },
                { status: 400 }
            );
        }

        if (!acceptedAds) {
            logWarn(requestId, "validation:no-ads-consent");

            return NextResponse.json(
                {
                    ok: false,
                    error: "Нужно согласие на получение рекламной информации.",
                    request_id: requestId,
                },
                { status: 400 }
            );
        }

        logInfo(requestId, "validation:ok", {
            email: maskEmail(email),
            fullNameLength: fullName.length,
        });

        const { guidePageUrl, guidePdfUrl, localPdfPath } = getGuideConfig();
        const resolvedLocalPdfPath = normalizePublicPath(localPdfPath);

        logInfo(requestId, "config:resolved", {
            guidePageUrl,
            guidePdfUrl,
            localPdfPath,
            resolvedLocalPdfPath,
        });

        const admin = getAdminClient();
        const nowIso = new Date().toISOString();

        logInfo(requestId, "db:marketing_guide_requests:insert:start");

        const { data: logRow, error: logCreateError } = await admin
            .from("marketing_guide_requests")
            .insert({
                email,
                full_name: fullName,
                source: "uranus_guide_pdf",
                status: "requested",
                email_sent: false,
                accepted_personal_data: acceptedPersonalData,
                accepted_ads: acceptedAds,
                request_payload: {
                    accepted_personal_data: acceptedPersonalData,
                    accepted_ads: acceptedAds,
                    request_id: requestId,
                },
                updated_at: nowIso,
            })
            .select("id")
            .single();

        if (!logCreateError && logRow?.id) {
            requestLogId = String(logRow.id);
            logInfo(requestId, "db:marketing_guide_requests:insert:ok", {
                requestLogId,
            });
        } else if (logCreateError) {
            logError(
                requestId,
                "db:marketing_guide_requests:insert:failed",
                normalizeError(logCreateError)
            );
        }

        try {
            assertPublicUrl("URANUS_GUIDE_PAGE_URL", guidePageUrl);
            assertPublicUrl("URANUS_GUIDE_PDF_URL", guidePdfUrl);
            logInfo(requestId, "config:public-urls:ok");
        } catch (configError) {
            logError(
                requestId,
                "config:public-urls:failed",
                normalizeError(configError)
            );

            if (requestLogId) {
                await admin
                    .from("marketing_guide_requests")
                    .update({
                        status: "failed",
                        email_error:
                            configError instanceof Error
                                ? configError.message
                                : String(configError),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestLogId);
            }

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Ссылки на путеводитель настроены неверно. Проверьте URANUS_GUIDE_PAGE_URL и URANUS_GUIDE_PDF_URL.",
                    request_id: requestId,
                },
                { status: 500 }
            );
        }

        logInfo(requestId, "db:marketing_contacts:upsert:start", {
            email: maskEmail(email),
        });

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
            logError(
                requestId,
                "db:marketing_contacts:upsert:failed",
                normalizeError(upsertError)
            );

            if (requestLogId) {
                await admin
                    .from("marketing_guide_requests")
                    .update({
                        status: "failed",
                        email_error: upsertError.message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestLogId);
            }

            return NextResponse.json(
                {
                    ok: false,
                    error: "Не удалось сохранить заявку.",
                    request_id: requestId,
                },
                { status: 500 }
            );
        }

        logInfo(requestId, "db:marketing_contacts:upsert:ok");

        const attachment = await tryLoadAttachmentFromPublic(
            resolvedLocalPdfPath,
            requestId
        );

        logInfo(requestId, "email:prepare", {
            hasAttachment: Boolean(attachment),
            attachmentFilename: attachment?.filename || null,
            pdfUrl: guidePdfUrl,
            pageUrl: guidePageUrl,
            to: maskEmail(email),
        });

        /**
         * ВАЖНО:
         * Сейчас здесь НЕТ реальной отправки письма.
         * Ваш старый route тоже не отправлял письмо — он только возвращал email_sent: false.
         *
         * Когда подключите реальный mailer (SMTP / Resend / Mailgun / SendGrid),
         * вставьте отправку именно в этот блок и замените emailSent на true при успехе.
         */
        let emailSent = false;
        let emailError: string | null = "Отправщик письма не подключён в route.ts.";

        logWarn(requestId, "email:send:skipped", {
            reason: emailError,
        });

        if (requestLogId) {
            logInfo(requestId, "db:marketing_guide_requests:update-issued:start", {
                requestLogId,
            });

            const { error: updateIssuedError } = await admin
                .from("marketing_guide_requests")
                .update({
                    status: emailSent ? "sent" : "issued",
                    email_sent: emailSent,
                    email_error: emailError,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestLogId);

            if (updateIssuedError) {
                logError(
                    requestId,
                    "db:marketing_guide_requests:update-issued:failed",
                    normalizeError(updateIssuedError)
                );
            } else {
                logInfo(requestId, "db:marketing_guide_requests:update-issued:ok");
            }
        }

        const durationMs = Date.now() - startedAt;

        logInfo(requestId, "done", {
            durationMs,
            emailSent,
            hasAttachment: Boolean(attachment),
            requestLogId,
        });

        return NextResponse.json({
            ok: true,
            page_url: guidePageUrl,
            pdf_url: guidePdfUrl,
            has_attachment: Boolean(attachment),
            email_sent: emailSent,
            email_error: emailError,
            request_id: requestId,
        });
    } catch (error) {
        logError(requestId, "fatal", normalizeError(error));

        if (requestLogId) {
            try {
                const admin = getAdminClient();

                await admin
                    .from("marketing_guide_requests")
                    .update({
                        status: "failed",
                        email_error:
                            error instanceof Error ? error.message : String(error),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestLogId);

                logInfo(requestId, "db:marketing_guide_requests:update-failed:ok", {
                    requestLogId,
                });
            } catch (updateError) {
                logError(
                    requestId,
                    "db:marketing_guide_requests:update-failed:error",
                    normalizeError(updateError)
                );
            }
        }

        return NextResponse.json(
            {
                ok: false,
                error: "Внутренняя ошибка сервера.",
                request_id: requestId,
            },
            { status: 500 }
        );
    }
}