import { NextRequest, NextResponse } from "next/server";
import {
    BIG_CALENDAR_REPORT_PROMPT,
    BIG_CALENDAR_SUMMARY_PROMPT,
} from "@/lib/astro/big-calendar-prompts";

type RequestBody = {
    birthDate?: string;
    birthTime?: string;
    birthPlace?: string;

    birth_date?: string;
    birth_time?: string;
    birth_city?: string;
    birth_place?: string;

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

function normalizeBirthDate(input: string): string {
    return input.trim();
}

function normalizeBirthTime(input: string): string {
    const value = input.trim();

    if (!value) return value;

    if (value.toLowerCase() === "я не знаю") {
        return "я не знаю";
    }

    const hhmmss = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (hhmmss) {
        const [, hh, mm] = hhmmss;
        return `${hh}:${mm}`;
    }

    const hhmm = value.match(/^(\d{2}):(\d{2})$/);
    if (hhmm) {
        return value;
    }

    return value;
}

async function createOpenAIText(
    prompt: string,
    input: unknown,
    maxTokens: number
) {
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

async function requestCalendar(payload: {
    birth_date: string;
    birth_time: string;
    birth_place: string;
    months: number;
}) {
    const response = await fetch(BIG_CALENDAR_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    const data = isJson
        ? await response.json().catch(() => null)
        : await response.text().catch(() => "");

    return { response, data, isJson };
}

async function fetchCalendar(body: {
    birthDate: string;
    birthTime: string;
    birthPlace: string;
    months: number;
}) {
    const payload = {
        birth_date: normalizeBirthDate(body.birthDate),
        birth_time: normalizeBirthTime(body.birthTime),
        birth_place: body.birthPlace.trim(),
        months: body.months,
    };

    console.log("[/api/astro/big-calendar] outbound payload:", payload);

    const result = await requestCalendar(payload);

    console.log("[/api/astro/big-calendar] external status:", result.response.status);
    console.log("[/api/astro/big-calendar] external data:", result.data);

    if (!result.response.ok) {
        let detail = `HTTP ${result.response.status}`;

        if (typeof result.data === "string") {
            detail = result.data.trim() || detail;
        } else if (result.data && typeof result.data === "object") {
            const obj = result.data as Record<string, any>;

            if (typeof obj.detail === "string") {
                detail = obj.detail;
            } else if (typeof obj.message === "string") {
                detail = obj.message;
            } else if (typeof obj.error === "string") {
                detail = obj.error;
            } else if (Array.isArray(obj.detail)) {
                detail = obj.detail
                    .map((item) => {
                        if (typeof item === "string") return item;

                        if (item && typeof item === "object") {
                            const loc = Array.isArray(item.loc)
                                ? item.loc.join(".")
                                : "";
                            const msg =
                                typeof item.msg === "string"
                                    ? item.msg
                                    : JSON.stringify(item);
                            return loc ? `${loc}: ${msg}` : msg;
                        }

                        return String(item);
                    })
                    .join("; ");
            } else {
                detail = JSON.stringify(obj, null, 2);
            }
        }

        throw new RouteError(
            `Сервис БЖК вернул ${result.response.status}: ${detail}`,
            result.response.status >= 400 && result.response.status < 600
                ? result.response.status
                : 502
        );
    }

    if (!result.isJson || !result.data || typeof result.data !== "object") {
        throw new RouteError("Сервис БЖК вернул неожиданный ответ вместо JSON.", 502);
    }

    return result.data;
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as RequestBody;

        console.log("[/api/astro/big-calendar] incoming body:", body);

        const birthDate = String(body.birth_date ?? body.birthDate ?? "").trim();
        const birthTime = String(body.birth_time ?? body.birthTime ?? "").trim();
        const birthPlace = String(
            body.birth_city ?? body.birth_place ?? body.birthPlace ?? ""
        ).trim();

        const name = String(body.name ?? "Клиент").trim() || "Клиент";
        const months =
            typeof body.months === "number" && body.months > 0 ? body.months : 3;

        console.log("[/api/astro/big-calendar] normalized input preview:", {
            birthDateRaw: birthDate,
            birthDateNormalized: normalizeBirthDate(birthDate),
            birthTimeRaw: birthTime,
            birthTimeNormalized: normalizeBirthTime(birthTime),
            birthPlace,
            months,
            name,
        });

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
                birth_time: normalizeBirthTime(birthTime),
            },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        const status = error instanceof RouteError ? error.status : 500;

        console.error("[/api/astro/big-calendar] error:", error);

        return NextResponse.json({ ok: false, error: message }, { status });
    }
}