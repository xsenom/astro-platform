import { NextRequest, NextResponse } from "next/server";
import { getAstroPrompt, type AstroPromptKind } from "@/lib/astro/prompts";

type InterpretBody = {
    kind?: AstroPromptKind;
    resultText?: string;
    raw?: unknown;
};

const MODEL = "gpt-4.1-mini";

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as InterpretBody;
        const kind = body.kind;

        if (!kind) {
            return NextResponse.json({ ok: false, error: "Не указан тип расчёта." }, { status: 400 });
        }

        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (!apiKey) {
            return NextResponse.json({
                ok: true,
                interpretation: null,
                skipped: true,
                reason: "OPENAI_API_KEY is not configured",
            });
        }

        const prompt = getAstroPrompt(kind);
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
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
                                    "Данные астрологического расчёта в JSON:\n" +
                                    JSON.stringify(
                                        {
                                            kind,
                                            resultText: body.resultText ?? "",
                                            raw: body.raw ?? null,
                                        },
                                        null,
                                        2
                                    ),
                            },
                        ],
                    },
                ],
                max_output_tokens: 900,
            }),
        });

        const json = (await response.json().catch(() => null)) as OpenAIResponse | null;
        if (!response.ok) {
            return NextResponse.json(
                { ok: false, error: json?.error?.message || "OpenAI request failed" },
                { status: 500 }
            );
        }

        const interpretation =
            json?.output_text ||
            json?.output
                ?.flatMap((item) => item?.content ?? [])
                ?.map((item) => item?.text ?? "")
                ?.join("\n")
                ?.trim() ||
            null;

        return NextResponse.json({ ok: true, model: MODEL, interpretation });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
