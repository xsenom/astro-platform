import fs from "node:fs/promises";
import path from "node:path";
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
        normalized.includes("relation") && normalized.includes("does not exist")
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

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
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
        "По входным аспектам составь понятную интерпретацию благоприятных дней на ближайший месяц.",
        "Пиши по-русски, дружелюбно и структурно.",
        "Дай блоки: краткий итог, лучшие дни/периоды, рекомендации по действиям, чего избегать.",
        "Не выдумывай аспекты, опирайся только на входные данные.",
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

async function buildFavorableDaysPdf(req: NextRequest, payload: {
    interpretation: string;
    summary: string;
    fullName: string;
    birthDate: string;
    birthTime: string;
}) {
    const bannerPath = path.join(
        process.cwd(),
        "public",
        "banners",
        "favorable-days-request.png"
    );
    const hasBanner = await fs
        .access(bannerPath)
        .then(() => true)
        .catch(() => false);

    const response = await fetch(new URL("/api/astro/big-calendar/pdf", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: payload.interpretation,
            general_p2: payload.summary,
            name: payload.fullName,
            birth_date: payload.birthDate,
            birth_time: payload.birthTime,
            ...(hasBanner ? { banner_url: "/banners/favorable-days-request.png" } : {}),
            title: "Ваши благоприятные дни на месяц",
            file_name: "blagopriyatnye-dni-na-mesyac.pdf",
        }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => "");
        throw new Error(message || "Не удалось собрать PDF.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
        fileName: "blagopriyatnye-dni-na-mesyac.pdf",
        content: buffer,
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
            return NextResponse.json({ ok: false, error: "Заполните имя, email, дату, время и город рождения." }, { status: 400 });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ ok: false, error: "Некорректный email." }, { status: 400 });
        }

        if (!isValidBirthDate(birthDate)) {
            return NextResponse.json({ ok: false, error: "Дата рождения должна быть в формате ДД.ММ.ГГГГ." }, { status: 400 });
        }

        if (!isValidBirthTime(birthTime)) {
            return NextResponse.json({ ok: false, error: "Время рождения должно быть в формате HH:MM." }, { status: 400 });
        }

        if (!isValidBirthCity(birthCity)) {
            return NextResponse.json({ ok: false, error: "Укажите корректный город рождения." }, { status: 400 });
        }

        const normalizedBirthDate = toIsoBirthDate(birthDate);

        const { data: inserted, error: insertError } = await admin
            .from("favorable_days_requests")
            .insert({
                full_name: fullName,
                email,
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                months: Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1,
                status: "requested",
                email_sent: false,
            })
            .select("id")
            .single();

        if (insertError && !isMissingTableError(insertError.message)) {
            return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
        }

        requestId = inserted?.id ? String(inserted.id) : null;

        const calendarRes = await fetch(new URL("/api/astro/big-calendar", req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                name: fullName,
                months: Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1,
            }),
        });

        const calendarJson = await calendarRes.json().catch(() => null);
        if (!calendarRes.ok || !calendarJson?.ok) {
            const message = calendarJson?.error || "Не удалось рассчитать благоприятные дни.";

            if (requestId) {
                await admin.from("favorable_days_requests").update({
                    status: "failed",
                    email_error: message,
                    updated_at: new Date().toISOString(),
                }).eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const rawCalendar = calendarJson?.rawCalendar || calendarJson?.raw_calendar || null;
        const aspects = Array.isArray(rawCalendar?.days) ? rawCalendar.days : [];

        const favorablePrompt = await readFavorableDaysPrompt();
        const aiInterpretation = await createOpenAIInterpretation(favorablePrompt, {
            name: fullName,
            birth_date: normalizedBirthDate,
            birth_time: birthTime,
            birth_city: birthCity,
            months: Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1,
            aspects,
        });

        const fallbackSummary =
            String(calendarJson?.summaryText || "").trim() ||
            String(calendarJson?.summary_text || "").trim() ||
            "Персональный астропрогноз на месяц.";

        const pdf = await buildFavorableDaysPdf(req, {
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

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            if (requestId) {
                await admin.from("favorable_days_requests").update({
                    status: "failed",
                    email_error: "SMTP не настроен",
                    result_text: aiInterpretation,
                    updated_at: new Date().toISOString(),
                }).eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: "SMTP не настроен." }, { status: 500 });
        }

        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            from: smtpFrom,
            to: email,
            subject: "Ваши благоприятные дни на месяц",
            text: `Здравствуйте, ${fullName}!\n\nВаш расчёт благоприятных дней готов.\n\n${aiInterpretation}`,
            html: `<div style=\"font-family:Arial,sans-serif;line-height:1.6\"><p>Здравствуйте, ${fullName}!</p><p>Ваш расчёт благоприятных дней готов.</p><pre style=\"white-space:pre-wrap\">${aiInterpretation}</pre></div>`,
            attachments: [
                {
                    filename: pdf.fileName,
                    content: pdf.content,
                    contentType: "application/pdf",
                },
            ],
        });

        if (requestId) {
            await admin.from("favorable_days_requests").update({
                status: "sent",
                email_sent: true,
                email_error: null,
                result_text: aiInterpretation,
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq("id", requestId);
        }

        return NextResponse.json({
            ok: true,
            email_sent: true,
            email_error: null,
            interpretation: aiInterpretation,
            pdf_base64: pdf.content.toString("base64"),
            pdf_file_name: pdf.fileName,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (requestId) {
            await admin.from("favorable_days_requests").update({
                status: "failed",
                email_error: message,
                updated_at: new Date().toISOString(),
            }).eq("id", requestId);
        }

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
