import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

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
    let requestLogId: string | null = null;

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

        const admin = getAdminClient();
        const nowIso = new Date().toISOString();

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
                },
                updated_at: nowIso,
            })
            .select("id")
            .single();

        if (!logCreateError && logRow?.id) {
            requestLogId = String(logRow.id);
        } else if (logCreateError) {
            console.error("[guide-request] failed to create marketing_guide_requests log", logCreateError);
        }

        try {
            assertPublicUrl("URANUS_GUIDE_PAGE_URL", guidePageUrl);
            assertPublicUrl("URANUS_GUIDE_PDF_URL", guidePdfUrl);
        } catch (configError) {
            console.error("[guide-request] invalid guide config", configError);

            if (requestLogId) {
                await admin
                    .from("marketing_guide_requests")
                    .update({
                        status: "failed",
                        email_error: configError instanceof Error ? configError.message : String(configError),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestLogId);
            }

            return NextResponse.json(
                {
                    ok: false,
                    error:
                        "Ссылки на путеводитель настроены неверно. Проверьте URANUS_GUIDE_PAGE_URL и URANUS_GUIDE_PDF_URL.",
                },
                { status: 500 }
            );
        }

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
                { ok: false, error: "Не удалось сохранить заявку." },
                { status: 500 }
            );
        }

        const attachment = await tryLoadAttachmentFromPublic(resolvedLocalPdfPath);

        if (requestLogId) {
            await admin
                .from("marketing_guide_requests")
                .update({
                    status: "issued",
                    email_sent: false,
                    email_error: null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestLogId);
        }

        return NextResponse.json({
            ok: true,
            page_url: guidePageUrl,
            pdf_url: guidePdfUrl,
            has_attachment: Boolean(attachment),
            email_sent: false,
        });
    } catch (error) {
        console.error("[guide-request][POST] failed", error);

        if (requestLogId) {
            try {
                const admin = getAdminClient();
                await admin
                    .from("marketing_guide_requests")
                    .update({
                        status: "failed",
                        email_error: error instanceof Error ? error.message : String(error),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestLogId);
            } catch (updateError) {
                console.error("[guide-request][POST] failed to update log", updateError);
            }
        }

        return NextResponse.json(
            { ok: false, error: "Внутренняя ошибка сервера." },
            { status: 500 }
        );
    }
}
