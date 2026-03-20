import { NextRequest, NextResponse } from "next/server";
import {
    BIG_CALENDAR_REPORT_PROMPT,
    BIG_CALENDAR_SUMMARY_PROMPT,
} from "@/lib/astro/big-calendar-prompts";

type RequestBody = {
    birthDate?: string;
    birthTime?: string;
    birthPlace?: string;
    name?: string | null;
    months?: number;
};

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

class RouteError extends Error {
    status: number;

    constructor(message: string, status = 500) {
        super(message);
        this.status = status;
    }
}

const OPENAI_MODEL =
    process.env.BIG_CALENDAR_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini";
const BIG_CALENDAR_API_URL =
    process.env.BIG_CALENDAR_API_URL?.trim() ||
    "http://45.90.35.133:1800/calendar/favorable/3m";

function readText(json: OpenAIResponse | null) {
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

async function createOpenAIText(prompt: string, input: unknown, maxTokens: number) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new RouteError(
            "Не настроен OPENAI_API_KEY для генерации текста БЖК. Добавьте ключ в окружение сервера.",
            503
        );
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
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
            max_output_tokens: maxTokens,
        }),
    });

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;
    if (!response.ok) {
        throw new RouteError(
            json?.error?.message || "OpenAI не смог сгенерировать текст БЖК.",
            response.status >= 400 && response.status < 600 ? response.status : 502
        );
    }

    const text = readText(json);
    if (!text) {
        throw new RouteError("OpenAI вернул пустой текст для БЖК.", 502);
    }

    return text;
}

async function fetchCalendar(
    body: Required<Pick<RequestBody, "birthDate" | "birthTime" | "birthPlace">> & {
        months: number;
    }
) {
    const form = new URLSearchParams({
        birth_date: body.birthDate,
        birth_time: body.birthTime,
        birth_place: body.birthPlace,
        months: String(body.months),
    });

    const response = await fetch(BIG_CALENDAR_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: form.toString(),
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

    if (!response.ok) {
        const detail =
            typeof payload === "string"
                ? payload.trim() || `HTTP ${response.status}`
                : payload?.detail || payload?.message || `HTTP ${response.status}`;

        const message =
            response.status === 403
                ? `Внешний сервис БЖК отклонил запрос (403 Forbidden). Проверьте доступ сервера к ${BIG_CALENDAR_API_URL}.`
                : `Не удалось получить данные БЖК: ${detail}`;

        throw new RouteError(message, response.status >= 400 && response.status < 600 ? response.status : 502);
    }

    if (!isJson || !payload || typeof payload !== "object") {
        throw new RouteError("Сервис БЖК вернул неожиданный ответ вместо JSON.", 502);
    }

    return payload;
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as RequestBody;
        const birthDate = body.birthDate?.trim();
        const birthTime = body.birthTime?.trim();
        const birthPlace = body.birthPlace?.trim();
        const name = body.name?.trim() || "Клиент";
        const months = body.months && body.months > 0 ? body.months : 3;

        if (!birthDate || !birthTime || !birthPlace) {
            throw new RouteError(
                "Нужны дата рождения, время рождения и место рождения.",
                400
            );
        }

        const calendarJson = await fetchCalendar({
            birthDate,
            birthTime,
            birthPlace,
            months,
        });

        const reportText = await createOpenAIText(
            BIG_CALENDAR_REPORT_PROMPT,
            { days: (calendarJson as { days?: unknown[] })?.days ?? [] },
            5000
        );
        const summaryText = await createOpenAIText(
            BIG_CALENDAR_SUMMARY_PROMPT,
            reportText,
            1800
        );

        return NextResponse.json({
            ok: true,
            model: OPENAI_MODEL,
            reportText,
            summaryText,
            rawCalendar: calendarJson,
            pdfPayload: {
                content: reportText,
                general_p2: summaryText,
                name,
                birth_date: birthDate,
                birth_time: birthTime,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = error instanceof RouteError ? error.status : 500;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
