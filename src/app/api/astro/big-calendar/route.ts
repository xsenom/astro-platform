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

const OPENAI_MODEL = "gpt-5.2";
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
        throw new Error("OPENAI_API_KEY is not configured");
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
                            text: typeof input === "string" ? input : JSON.stringify(input, null, 2),
                        },
                    ],
                },
            ],
            max_output_tokens: maxTokens,
        }),
    });

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;
    if (!response.ok) {
        throw new Error(json?.error?.message || "OpenAI request failed");
    }

    const text = readText(json);
    if (!text) {
        throw new Error("OpenAI did not return text");
    }

    return text;
}

async function fetchCalendar(body: Required<Pick<RequestBody, "birthDate" | "birthTime" | "birthPlace">> & { months: number }) {
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

    const json = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(json?.detail || json?.message || `HTTP ${response.status}`);
    }

    return json;
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
            return NextResponse.json(
                { ok: false, error: "Нужны дата рождения, время рождения и место рождения." },
                { status: 400 }
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
            { days: calendarJson?.days ?? [] },
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
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
