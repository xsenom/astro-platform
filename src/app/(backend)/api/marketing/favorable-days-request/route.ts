import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import PDFDocument from "pdfkit";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

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
    return /^[\p{L}\s-]{2,}$/u.test(value);
}

function toIsoBirthDate(value: string) {
    const [day, month, year] = value.split(".");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value: string) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function sanitizeInterpretationForPdf(value: string) {
    const cleanedLines = String(value || "")
        .replace(/\r/g, "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*[-*•]+\s*$/gm, "")
        .replace(/^\s*[•*-]+\s*[-–—]+\s*$/gm, "")
        .replace(/^\s*[-–—]{2,}\s*$/gm, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line, index, arr) => {
            if (!line) {
                const prev = arr[index - 1];
                return Boolean(prev && prev.trim());
            }
            return true;
        });

    return cleanedLines.join("\n").trim();
}

function splitInterpretationSections(value: string) {
    const text = sanitizeInterpretationForPdf(value);
    const lines = text.split("\n");

    const sections: Array<{ title: string; body: string[] }> = [];
    let current: { title: string; body: string[] } | null = null;

    const knownTitles = [
        "Краткий итог",
        "Лучшие дни",
        "Лучшие дни и периоды",
        "Рекомендации",
        "Рекомендации по действиям",
        "Чего избегать",
        "Самые благоприятные периоды",
        "Для чего эти периоды лучше всего подходят",
        "На что обратить внимание и чего избегать",
        "Практические рекомендации на месяц",
    ];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const normalized = line.replace(/:$/, "");
        const matchedTitle = knownTitles.find(
            (title) => normalized.toLowerCase() === title.toLowerCase()
        );

        if (matchedTitle) {
            current = { title: matchedTitle, body: [] };
            sections.push(current);
            continue;
        }

        if (!current) {
            current = { title: "Прогноз", body: [] };
            sections.push(current);
        }

        current.body.push(
            line
                .replace(/^[•*-]\s+/, "")
                .replace(/^\d+\.\s+/, "")
                .trim()
        );
    }

    return sections.filter((section) => section.body.length > 0);
}

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

type MonthTransitItem = {
    date?: string;
    transit?: string;
    natal?: string;
    theme?: string;
    description?: string;
};

type MonthTransitsResponse = {
    month_transits?: MonthTransitItem[];
    detail?: string;
    error?: string;
};

const FAVORABLE_DAYS_OPENAI_MODEL =
    process.env.FAVORABLE_DAYS_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini";

async function readFavorableDaysPrompt() {
    const promptPath = path.join(
        process.cwd(),
        "backend",
        "app",
        "prompt",
        "favorable-days-request.txt"
    );

    try {
        const value = await fs.readFile(promptPath, "utf8");
        if (value.trim()) return value;
    } catch {
        // ignore and fallback
    }

    return [
        "Ты астролог-консультант.",
        "На основе списка благоприятных аспектов составь понятную интерпретацию на ближайший месяц.",
        "Пиши по-русски, без markdown-разметки, без символов **, --, ### и пустых маркеров.",
        "Структура ответа: Краткий итог, Лучшие дни и периоды, Рекомендации по действиям, Чего избегать.",
        "Не выдумывай аспекты и даты, опирайся только на входные данные.",
        "Текст должен быть пригоден для прямой вставки в PDF.",
    ].join("\n");
}

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

async function createOpenAIInterpretation(prompt: string, input: unknown) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY не настроен.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: FAVORABLE_DAYS_OPENAI_MODEL,
            input: [
                { role: "system", content: [{ type: "input_text", text: prompt }] },
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
            max_output_tokens: 4500,
        }),
    });

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;

    if (!response.ok) {
        throw new Error(json?.error?.message || "OpenAI не смог сгенерировать интерпретацию.");
    }

    const text = readOpenAIText(json);
    if (!text) {
        throw new Error("OpenAI вернул пустую интерпретацию.");
    }

    return text;
}

async function buildPdfBuffer(payload: {
    title: string;
    fullName: string;
    birthDate: string;
    birthTime: string;
    summary: string;
    interpretation: string;
}) {
    const bannerPath = path.join(
        process.cwd(),
        "public",
        "banners",
        "favorable-days-request.jpg"
    );

    const regularFontPath = path.join(
        process.cwd(),
        "public",
        "fonts",
        "Inter-Regular.ttf"
    );

    const boldFontPath = path.join(
        process.cwd(),
        "public",
        "fonts",
        "Inter-Bold.ttf"
    );

    const hasBanner = await fs.access(bannerPath).then(() => true).catch(() => false);
    const hasRegularFont = await fs.access(regularFontPath).then(() => true).catch(() => false);
    const hasBoldFont = await fs.access(boldFontPath).then(() => true).catch(() => false);

    if (!hasRegularFont || !hasBoldFont) {
        throw new Error(
            "Для PDF не найдены шрифты public/fonts/Inter-Regular.ttf и public/fonts/Inter-Bold.ttf"
        );
    }

    const doc = new PDFDocument({
        autoFirstPage: false,
        size: "A4",
        margins: {
            top: 44,
            bottom: 44,
            left: 42,
            right: 42,
        },
        info: {
            Title: payload.title,
            Author: "Astro Platform",
        },
    });

    doc.registerFont("Regular", regularFontPath);
    doc.registerFont("Bold", boldFontPath);

    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const done = new Promise<Buffer>((resolve, reject) => {
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
        doc.on("error", reject);
    });

    doc.pipe(stream);
    doc.addPage();
    doc.font("Regular");

    const pageWidth = doc.page.width;
    const pageMargins = doc.page.margins;
    const contentLeft = pageMargins.left;
    const contentRight = pageWidth - pageMargins.right;
    const contentWidth = contentRight - contentLeft;

    if (hasBanner) {
        const bannerTop = 20;
        const bannerHeight = 210;

        doc.image(bannerPath, contentLeft, bannerTop, {
            width: contentWidth,
            height: bannerHeight,
        });

        doc.y = bannerTop + bannerHeight + 30;
    } else {
        doc.y = 44;
    }

    doc
        .font("Bold")
        .fontSize(22)
        .fillColor("#1E2A44")
        .text("Благоприятные дни на месяц", contentLeft, doc.y, {
            align: "left",
            width: contentWidth,
        });

    doc.moveDown(0.9);

    doc
        .font("Regular")
        .fontSize(11)
        .fillColor("#475467")
        .text(`Имя: ${payload.fullName}`, contentLeft, doc.y, { width: contentWidth })
        .text(`Дата рождения: ${payload.birthDate}`, { width: contentWidth })
        .text(`Время рождения: ${payload.birthTime}`, { width: contentWidth });

    doc.moveDown(0.9);

    doc
        .font("Bold")
        .fontSize(13)
        .fillColor("#1E2A44")
        .text("Краткая справка");

    doc.moveDown(0.25);

    doc
        .font("Regular")
        .fontSize(11)
        .fillColor("#344054")
        .text(sanitizeInterpretationForPdf(payload.summary), {
            align: "left",
            lineGap: 3,
        });

    const sections = splitInterpretationSections(payload.interpretation);

    for (const section of sections) {
        doc.moveDown(0.9);

        doc
            .font("Bold")
            .fontSize(14)
            .fillColor("#1E2A44")
            .text(section.title);

        doc.moveDown(0.25);

        doc.font("Regular").fontSize(11).fillColor("#344054");

        for (const paragraph of section.body) {
            doc.text(paragraph, {
                align: "left",
                lineGap: 3,
                paragraphGap: 8,
            });
        }
    }

    doc.moveDown(1);

    doc
        .font("Regular")
        .fontSize(9)
        .fillColor("#667085")
        .text(
            "Материал носит информационный характер и предназначен для личного ознакомления.",
            { align: "left" }
        );

    doc.end();

    return done;
}

async function buildFavorableDaysPdf(payload: {
    interpretation: string;
    summary: string;
    fullName: string;
    birthDate: string;
    birthTime: string;
}) {
    const content = await buildPdfBuffer({
        title: "Благоприятные дни на месяц",
        fullName: payload.fullName,
        birthDate: payload.birthDate,
        birthTime: payload.birthTime,
        summary: payload.summary,
        interpretation: payload.interpretation,
    });

    return {
        fileName: "blagopriyatnye-dni-na-mesyac.pdf",
        content,
    };
}

export async function POST(req: NextRequest) {
    const admin = getAdminClient();
    let requestId: string | null = null;

    try {
        const body = await req.json();

        const fullName = String(body?.full_name || "").trim();
        const email = normalizeEmail(body?.email);
        const birthDate = String(body?.birth_date || "").trim();
        const birthTime = String(body?.birth_time || "").trim();
        const birthCity = String(body?.birth_city || "").trim();
        const months = Number(body?.months || 1);

        if (!fullName || !email || !birthDate || !birthTime || !birthCity) {
            return NextResponse.json(
                { ok: false, error: "Заполните имя, email, дату, время и город рождения." },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ ok: false, error: "Некорректный email." }, { status: 400 });
        }

        if (!isValidBirthDate(birthDate)) {
            return NextResponse.json(
                { ok: false, error: "Дата рождения должна быть в формате ДД.ММ.ГГГГ." },
                { status: 400 }
            );
        }

        if (!isValidBirthTime(birthTime)) {
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

        const normalizedBirthDate = toIsoBirthDate(birthDate);
        const [birthYear, birthMonth, birthDay] = normalizedBirthDate.split("-").map(Number);
        const [birthHour, birthMinute] = birthTime.split(":").map(Number);

        const safeMonths =
            Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1;

        const { data: inserted, error: insertError } = await admin
            .from("favorable_days_requests")
            .insert({
                full_name: fullName,
                email,
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                months: safeMonths,
                status: "requested",
                email_sent: false,
            })
            .select("id")
            .single();

        if (insertError && !isMissingTableError(insertError.message)) {
            return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
        }

        requestId = inserted?.id ? String(inserted.id) : null;

        const astroBase =
            process.env.ASTRO_API_BASE?.trim() ||
            process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() ||
            "http://127.0.0.1:8011";

        const monthUrl = new URL("/transits_month", astroBase);
        monthUrl.searchParams.set("year", String(birthYear));
        monthUrl.searchParams.set("month", String(birthMonth));
        monthUrl.searchParams.set("day", String(birthDay));
        monthUrl.searchParams.set("hour", String(birthHour));
        monthUrl.searchParams.set("minute", String(birthMinute));
        monthUrl.searchParams.set("city_name", birthCity);

        const monthRes = await fetch(monthUrl.toString(), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        });

        const monthJson = (await monthRes.json().catch(() => null)) as MonthTransitsResponse | null;

        if (!monthRes.ok || !monthJson) {
            const message =
                monthJson?.detail ||
                monthJson?.error ||
                "Не удалось рассчитать месячный прогноз.";

            if (requestId) {
                await admin
                    .from("favorable_days_requests")
                    .update({
                        status: "failed",
                        email_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const aspects = Array.isArray(monthJson.month_transits) ? monthJson.month_transits : [];

        if (!aspects.length) {
            const message = "Месячный прогноз вернул пустой список аспектов.";

            if (requestId) {
                await admin
                    .from("favorable_days_requests")
                    .update({
                        status: "failed",
                        email_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const uniqueDates = [
            ...new Set(
                aspects
                    .map((item) => item?.date)
                    .filter((value): value is string => Boolean(value))
            ),
        ];

        const fallbackSummary =
            uniqueDates.length > 0
                ? `Найдено ${aspects.length} благоприятных аспектов на ${uniqueDates.length} дней ближайшего месяца.`
                : "Персональный астропрогноз на месяц.";

        const favorablePrompt = await readFavorableDaysPrompt();
        const aiInterpretationRaw = await createOpenAIInterpretation(favorablePrompt, {
            name: fullName,
            birth_date: normalizedBirthDate,
            birth_time: birthTime,
            birth_city: birthCity,
            months: safeMonths,
            aspects,
        });

        const aiInterpretation = sanitizeInterpretationForPdf(aiInterpretationRaw);

        const pdf = await buildFavorableDaysPdf({
            interpretation: aiInterpretation,
            summary: fallbackSummary,
            fullName,
            birthDate: normalizedBirthDate,
            birthTime,
        });

        const smtpHost = getEnv("SMTP_HOST");
        const smtpPort = Number(getEnv("SMTP_PORT") || "0");
        const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
        const smtpUser = getEnv("SMTP_USER");
        const smtpPass = getEnv("SMTP_PASS");
        const smtpFrom = getEnv("SMTP_FROM");

        let emailSent = false;
        let emailError: string | null = null;

        console.log("[favorable-days] SMTP config check", {
            hasHost: Boolean(smtpHost),
            smtpPort,
            secure: smtpSecure,
            hasUser: Boolean(smtpUser),
            hasPass: Boolean(smtpPass),
            hasFrom: Boolean(smtpFrom),
            to: email,
            requestId,
        });

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            emailError = "SMTP не настроен";
            console.error("[favorable-days] SMTP is not configured", {
                requestId,
                emailError,
            });
        } else {
            const escapedFullName = escapeHtml(fullName);
            const escapedInterpretation = escapeHtml(aiInterpretation);

            try {
                console.log("[favorable-days] Sending email...", {
                    requestId,
                    to: email,
                    subject: "Ваши благоприятные дни на месяц",
                    attachmentName: pdf.fileName,
                    attachmentSize: pdf.content.length,
                });

                await sendSmtpMail({
                    host: smtpHost,
                    port: smtpPort,
                    secure: smtpSecure,
                    username: smtpUser,
                    password: smtpPass,
                    from: smtpFrom,
                    to: email,
                    subject: "Ваши благоприятные дни на месяц",
                    text:
                        `Здравствуйте, ${fullName}!\n\n` +
                        `Ваш расчёт благоприятных дней готов.\n\n` +
                        `PDF-файл во вложении.`,
                    html:
                        `<div style="font-family:Arial,sans-serif;line-height:1.6">` +
                        `<p>Здравствуйте, ${escapedFullName}!</p>` +
                        `<p>Ваш расчёт благоприятных дней готов.</p>` +
                        `<p>PDF-файл во вложении.</p>` +
                        `<div style="margin-top:16px;padding:12px 14px;background:#f8f7fb;border-radius:12px;color:#344054;white-space:pre-wrap">` +
                        `${escapedInterpretation}` +
                        `</div>` +
                        `</div>`,
                    attachments: [
                        {
                            filename: pdf.fileName,
                            content: pdf.content,
                            contentType: "application/pdf",
                        },
                    ],
                });

                emailSent = true;

                console.log("[favorable-days] Email sent successfully", {
                    requestId,
                    to: email,
                    sentAt: new Date().toISOString(),
                });
            } catch (error) {
                emailSent = false;
                emailError = error instanceof Error ? error.message : String(error);

                console.error("[favorable-days] Email sending failed", {
                    requestId,
                    to: email,
                    error: emailError,
                });
            }
        }

        if (requestId) {
            await admin
                .from("favorable_days_requests")
                .update({
                    status: emailSent ? "sent" : "failed",
                    email_sent: emailSent,
                    email_error: emailError,
                    result_text: aiInterpretation,
                    updated_at: new Date().toISOString(),
                    sent_at: emailSent ? new Date().toISOString() : null,
                })
                .eq("id", requestId);
        }

        console.log("[favorable-days] Request completed", {
            requestId,
            emailSent,
            emailError,
            pdfFileName: pdf.fileName,
            pdfSize: pdf.content.length,
        });

        return NextResponse.json({
            ok: true,
            email_sent: emailSent,
            email_error: emailError,
            interpretation: aiInterpretation,
            pdf_base64: pdf.content.toString("base64"),
            pdf_file_name: pdf.fileName,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error("[favorable-days] Route failed", {
            requestId,
            error: message,
        });

        if (requestId) {
            await admin
                .from("favorable_days_requests")
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