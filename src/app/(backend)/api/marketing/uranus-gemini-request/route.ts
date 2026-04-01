import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function log(...args: unknown[]) {
    console.log("[uranus-gemini-request]", ...args);
}

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function getEnv(name: string) {
    return String(process.env[name] || "").trim();
}

function isMissingTableError(message: string) {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("could not find the table") ||
        (normalized.includes("relation") && normalized.includes("does not exist"))
    );
}

function isValidBirthDate(value: string) {
    if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/.test(value)) {
        return false;
    }

    const [dayRaw, monthRaw, yearRaw] = value.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function isValidBirthTime(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidBirthCity(value: string) {
    return /^[\p{L}\s.,()-]{2,}$/u.test(value.trim());
}

function toIsoBirthDate(value: string) {
    const [day, month, year] = value.split(".");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function nl2br(value: string) {
    return escapeHtml(value).replace(/\n/g, "<br/>");
}

function extractUranusText(payloadData: unknown): string {
    if (typeof payloadData === "string") return payloadData.trim();

    if (!payloadData || typeof payloadData !== "object") {
        return String(payloadData ?? "").trim();
    }

    const candidate = payloadData as Record<string, unknown>;

    const directText = [
        candidate.text,
        candidate.result_text,
        candidate.interpretation_text,
        candidate.interpretation,
        candidate.content,
        candidate.markdown,
        candidate.report,
        candidate.summary,
    ].find((value) => typeof value === "string" && value.trim());

    if (typeof directText === "string") return directText.trim();

    return JSON.stringify(payloadData, null, 2);
}

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

const URANUS_OPENAI_MODEL =
    process.env.URANUS_GEMINI_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini";

function readOpenAIText(json: OpenAIResponse | null) {
    return (
        json?.output_text ||
        json?.output
            ?.flatMap((item) => item?.content ?? [])
            ?.map((item) => item?.text ?? "")
            ?.join("\n")
            ?.trim() ||
        null
    );
}

async function readPrompt() {
    const promptPath = path.join(
        process.cwd(),
        "backend",
        "app",
        "prompt",
        "uranus-gemini-request.txt"
    );

    try {
        const value = await fs.readFile(promptPath, "utf8");
        if (value.trim()) {
            log("prompt loaded from file", promptPath);
            return value;
        }
    } catch {
        log("prompt file not found, use fallback");
    }

    return [
        "Ты астролог-консультант.",
        "На основе входных данных составь персональную интерпретацию периода Урана в Близнецах.",
        "Пиши по-русски, красиво, понятно, без канцелярита.",
        "Не показывай сырой JSON и технические поля.",
        "Сделай структуру:",
        "1. Главная тема периода.",
        "2. Какие жизненные изменения запускаются.",
        "3. Сильные возможности периода.",
        "4. На что обратить внимание и где нужна осторожность.",
        "5. Практические рекомендации.",
        "6. Итог периода.",
        "Текст должен быть цельным, аккуратным, в стиле персонального прогноза.",
        "Не придумывай астрологические факты сверх входных данных.",
    ].join("\n");
}

async function createOpenAIInterpretation(prompt: string, input: unknown) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY не настроен.");
    }

    log("openai request start", {
        model: URANUS_OPENAI_MODEL,
    });

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: URANUS_OPENAI_MODEL,
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: prompt }],
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "input_text",
                            text:
                                typeof input === "string"
                                    ? input
                                    : JSON.stringify(input, null, 2),
                        },
                    ],
                },
            ],
            max_output_tokens: 4000,
        }),
    });

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;

    if (!response.ok) {
        log("openai request failed", {
            status: response.status,
            payload: json,
        });
        throw new Error(json?.error?.message || "OpenAI не смог сгенерировать интерпретацию.");
    }

    const text = readOpenAIText(json);

    if (!text) {
        throw new Error("OpenAI вернул пустую интерпретацию.");
    }

    log("openai request success", {
        length: text.length,
        preview: text.slice(0, 300),
    });

    return text;
}

async function readImageAsDataUrl(imagePath: string) {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    let mime = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    if (ext === ".webp") mime = "image/webp";

    return `data:${mime};base64,${buffer.toString("base64")}`;
}

function buildPdfHtml(payload: {
    fullName: string;
    birthDate: string;
    birthTime: string;
    birthCity: string;
    interpretation: string;
    coverImageDataUrl?: string | null;
}) {
    const renderedBirthTime =
        payload.birthTime === "12:00"
            ? `${payload.birthTime} (условное время)`
            : payload.birthTime;

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Уран в Близнецах</title>
<style>
    @page {
        size: A4;
        margin: 0;
    }

    * {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2230;
        background: #f8f4f4;
    }

    .page {
        width: 210mm;
        min-height: 297mm;
        position: relative;
        padding: 18mm 16mm 16mm;
        background:
            radial-gradient(circle at 80% 78%, rgba(236, 197, 206, 0.35), transparent 26%),
            radial-gradient(circle at 15% 15%, rgba(244, 221, 226, 0.45), transparent 20%),
            linear-gradient(180deg, #fcf8f8 0%, #f7f2f3 100%);
        page-break-after: always;
    }

    .page:last-child {
        page-break-after: auto;
    }

    .cover {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding-top: 8mm;
    }

    .cover-image {
        width: 122mm;
        max-width: 100%;
        display: block;
        margin: 0 auto 10mm;
        object-fit: contain;
    }

    .eyebrow {
        font-size: 11px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #9d6c78;
        margin-bottom: 5mm;
    }

    .title {
        font-size: 30px;
        line-height: 1.1;
        margin: 0 0 5mm;
        font-weight: 700;
        color: #352b33;
    }

    .subtitle {
        margin: 0 0 8mm;
        font-size: 14px;
        line-height: 1.6;
        color: #5a4f57;
        max-width: 160mm;
    }

    .meta-card {
        width: 100%;
        border: 1px solid rgba(171, 146, 154, 0.35);
        border-radius: 16px;
        padding: 12px 14px;
        background: rgba(255,255,255,0.72);
        text-align: left;
    }

    .meta-row {
        margin: 0 0 7px;
        font-size: 13px;
        line-height: 1.55;
        color: #3c3440;
    }

    .meta-row:last-child {
        margin-bottom: 0;
    }

    .section-title {
        margin: 0 0 10mm;
        font-size: 22px;
        line-height: 1.2;
        font-weight: 700;
        color: #372d35;
    }

    .content-card {
        border: 1px solid rgba(171, 146, 154, 0.35);
        border-radius: 18px;
        padding: 14mm 12mm;
        background: rgba(255,255,255,0.76);
        font-size: 14px;
        line-height: 1.75;
        color: #2d2930;
        white-space: normal;
        word-break: break-word;
    }

    .footer {
        position: absolute;
        left: 16mm;
        right: 16mm;
        bottom: 10mm;
        font-size: 11px;
        color: #8a7780;
        display: flex;
        justify-content: space-between;
    }
</style>
</head>
<body>
    <section class="page cover">
        ${
        payload.coverImageDataUrl
            ? `<img class="cover-image" src="${payload.coverImageDataUrl}" alt="Уран в Близнецах" />`
            : ""
    }

        <div class="eyebrow">Персональный астрологический прогноз</div>
        <h1 class="title">Уран в Близнецах</h1>
        <p class="subtitle">
            Индивидуальный цикл реформ на 7 лет. Персональная интерпретация периода
            с акцентом на изменения, возможности, внутренние повороты и практические рекомендации.
        </p>

        <div class="meta-card">
            <p class="meta-row"><strong>Имя:</strong> ${escapeHtml(payload.fullName)}</p>
            <p class="meta-row"><strong>Дата рождения:</strong> ${escapeHtml(payload.birthDate)}</p>
            <p class="meta-row"><strong>Время рождения:</strong> ${escapeHtml(renderedBirthTime)}</p>
            <p class="meta-row"><strong>Город рождения:</strong> ${escapeHtml(payload.birthCity)}</p>
        </div>

        <div class="footer">
            <span>Уран в Близнецах</span>
            <span>Персональный PDF-отчёт</span>
        </div>
    </section>

    <section class="page">
        <h2 class="section-title">Интерпретация периода</h2>
        <div class="content-card">
            ${nl2br(payload.interpretation)}
        </div>

        <div class="footer">
            <span>${escapeHtml(payload.fullName)}</span>
            <span>стр. 2</span>
        </div>
    </section>
</body>
</html>`;
}

async function renderPdfFromHtml(html: string) {
    let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;

    try {
        const { chromium } = await import("playwright");

        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "0",
                right: "0",
                bottom: "0",
                left: "0",
            },
        });

        return Buffer.from(pdf);
    } finally {
        if (browser) {
            await browser.close().catch(() => undefined);
        }
    }
}

export async function POST(req: NextRequest) {
    const admin = getAdminClient();
    let requestId: string | null = null;

    try {
        const body = await req.json();

        log("incoming body", body);

        const fullName = String(body?.full_name || "").trim();
        const email = normalizeEmail(body?.email);
        const birthDate = String(body?.birth_date || "").trim();
        const birthTimeRaw = String(body?.birth_time || "").trim();
        const birthTimeUnknown = Boolean(body?.birth_time_unknown);
        const birthCity = String(body?.birth_city || "").trim();
        const consentPersonalData = Boolean(body?.consent_personal_data);
        const consentAds = Boolean(body?.consent_ads);

        const birthTime = birthTimeUnknown ? "12:00" : birthTimeRaw;

        log("normalized input", {
            fullName,
            email,
            birthDate,
            birthTimeRaw,
            birthTimeUnknown,
            birthTime,
            birthCity,
            consentPersonalData,
            consentAds,
        });

        if (!fullName || !email || !birthDate || !birthCity) {
            return NextResponse.json(
                { ok: false, error: "Заполните имя, email, дату рождения и город рождения." },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { ok: false, error: "Некорректный email." },
                { status: 400 }
            );
        }

        if (!isValidBirthDate(birthDate)) {
            return NextResponse.json(
                { ok: false, error: "Дата рождения должна быть в формате ДД.ММ.ГГГГ." },
                { status: 400 }
            );
        }

        if (!birthTimeUnknown && !isValidBirthTime(birthTime)) {
            return NextResponse.json(
                { ok: false, error: "Время рождения должно быть в формате HH:MM." },
                { status: 400 }
            );
        }

        if (!isValidBirthCity(birthCity)) {
            return NextResponse.json(
                { ok: false, error: "Укажите корректный город рождения." },
                { status: 400 }
            );
        }

        if (!consentPersonalData) {
            return NextResponse.json(
                { ok: false, error: "Нужно согласие на обработку персональных данных." },
                { status: 400 }
            );
        }

        const normalizedBirthDate = toIsoBirthDate(birthDate);
        const [year, month, day] = normalizedBirthDate.split("-").map(Number);
        const [hour, minute] = birthTime.split(":").map(Number);

        log("parsed birth params", {
            normalizedBirthDate,
            year,
            month,
            day,
            hour,
            minute,
        });

        const { data: inserted, error: insertError } = await admin
            .from("uranus_gemini_requests")
            .insert({
                full_name: fullName,
                email,
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_time_unknown: birthTimeUnknown,
                birth_city: birthCity,
                consent_personal_data: consentPersonalData,
                consent_ads: consentAds,
                status: "requested",
                email_sent: false,
            })
            .select("id")
            .single();

        if (insertError) {
            if (isMissingTableError(insertError.message)) {
                log("table uranus_gemini_requests not found, continue without db row");
            } else {
                log("db insert failed", insertError);
                return NextResponse.json(
                    { ok: false, error: insertError.message },
                    { status: 500 }
                );
            }
        }

        requestId = inserted?.id ? String(inserted.id) : null;

        log("request row created", { requestId });

        const calcRes = await fetch(new URL("/api/astro/uranus-gemini", req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                year,
                month,
                day,
                hour,
                minute,
                city_name: birthCity,
            }),
        });

        const calcJson = (await calcRes.json().catch(() => null)) as
            | { ok?: boolean; error?: string; data?: unknown }
            | null;

        log("astro route response", {
            status: calcRes.status,
            ok: calcRes.ok,
            payload: calcJson,
        });

        if (!calcRes.ok || !calcJson?.ok) {
            const message =
                calcJson?.error || "Не удалось получить расчёт Урана в Близнецах.";

            if (requestId) {
                await admin
                    .from("uranus_gemini_requests")
                    .update({
                        status: "failed",
                        email_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const rawText = extractUranusText(calcJson.data);

        log("raw astro text extracted", {
            length: rawText.length,
            preview: rawText.slice(0, 300),
        });

        const prompt = await readPrompt();

        const aiInterpretation = await createOpenAIInterpretation(prompt, {
            product: "Уран в Близнецах",
            full_name: fullName,
            birth_date: normalizedBirthDate,
            birth_time: birthTime,
            birth_time_unknown: birthTimeUnknown,
            birth_city: birthCity,
            raw_result: calcJson.data,
            raw_text: rawText,
        });

        const possibleCoverPaths = [
            path.join(process.cwd(), "public", "banners", "uranus-gemini-request.png"),
            path.join(process.cwd(), "public", "banners", "uranus-gemini-request.jpg"),
            path.join(process.cwd(), "public", "banners", "uran-v-bliznetsah.png"),
            path.join(process.cwd(), "public", "banners", "uran-v-bliznetsah.jpg"),
        ];

        let coverImageDataUrl: string | null = null;

        for (const filePath of possibleCoverPaths) {
            try {
                coverImageDataUrl = await readImageAsDataUrl(filePath);
                log("cover image loaded", filePath);
                break;
            } catch {
                // ignore
            }
        }

        const html = buildPdfHtml({
            fullName,
            birthDate,
            birthTime,
            birthCity,
            interpretation: aiInterpretation,
            coverImageDataUrl,
        });

        const pdfBuffer = await renderPdfFromHtml(html);
        const pdfFileName = "uran-v-bliznetsah.pdf";

        log("custom pdf generated", {
            pdfFileName,
            size: pdfBuffer.length,
        });

        const smtpHost = getEnv("SMTP_HOST");
        const smtpPort = Number(getEnv("SMTP_PORT") || "0");
        const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
        const smtpUser = getEnv("SMTP_USER");
        const smtpPass = getEnv("SMTP_PASS");
        const smtpFrom = getEnv("SMTP_FROM");

        log("smtp config check", {
            smtpHost: Boolean(smtpHost),
            smtpPort,
            smtpSecure,
            smtpUser: Boolean(smtpUser),
            smtpPass: Boolean(smtpPass),
            smtpFrom: Boolean(smtpFrom),
        });

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            if (requestId) {
                await admin
                    .from("uranus_gemini_requests")
                    .update({
                        status: "failed",
                        email_error: "SMTP не настроен",
                        result_text: aiInterpretation,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json(
                { ok: false, error: "SMTP не настроен." },
                { status: 500 }
            );
        }

        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            from: smtpFrom,
            to: email,
            subject: "Ваш расчёт: Уран в Близнецах",
            text:
                `Здравствуйте, ${fullName}!\n\n` +
                `Ваш персональный расчёт «Уран в Близнецах» готов.\n\n` +
                aiInterpretation,
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6">
                    <p>Здравствуйте, ${escapeHtml(fullName)}!</p>
                    <p>Ваш персональный расчёт <b>«Уран в Близнецах»</b> готов.</p>
                    <p>PDF-файл приложен к письму.</p>
                </div>
            `,
            attachments: [
                {
                    filename: pdfFileName,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ],
        });

        log("email sent", {
            to: email,
            fileName: pdfFileName,
            pdfSize: pdfBuffer.length,
        });

        if (requestId) {
            await admin
                .from("uranus_gemini_requests")
                .update({
                    status: "sent",
                    email_sent: true,
                    email_error: null,
                    result_text: aiInterpretation,
                    sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId);
        }

        return NextResponse.json({
            ok: true,
            email_sent: true,
            email_error: null,
            interpretation: aiInterpretation,
            pdf_base64: pdfBuffer.toString("base64"),
            pdf_file_name: pdfFileName,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        log("fatal error", {
            message,
            stack: error instanceof Error ? error.stack : null,
            requestId,
        });

        if (requestId) {
            await admin
                .from("uranus_gemini_requests")
                .update({
                    status: "failed",
                    email_error: message,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId);
        }

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}