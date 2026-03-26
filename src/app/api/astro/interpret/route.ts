import { NextRequest, NextResponse } from "next/server";
import { loadAstroPrompt } from "@/lib/astro/prompt-loader";
import { buildInterpretUserText } from "@/lib/astro/interpret-builders";
import {
    isAstroPromptKind,
    type AstroPromptKind,
} from "@/lib/astro/prompt-types";

export const runtime = "nodejs";

type InterpretBody = {
    kind?: AstroPromptKind;
    resultText?: string;
    raw?: unknown;
};

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

const MODEL = process.env.OPENAI_INTERPRET_MODEL?.trim() || "gpt-4.1-mini";

function extractText(json: OpenAIResponse | null): string | null {
    const text =
        json?.output_text ||
        json?.output
            ?.flatMap((item) => item?.content ?? [])
            ?.map((item) => item?.text ?? "")
            ?.join("\n")
            ?.trim() ||
        null;

    return text?.trim() || null;
}

function safeJsonParse<T = unknown>(value: string | null): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as InterpretBody;
        const kind = body.kind;

        if (!isAstroPromptKind(kind)) {
            return NextResponse.json(
                { ok: false, error: "Не указан или неверно указан тип расчёта." },
                { status: 400 }
            );
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

        const prompt = await loadAstroPrompt(kind);
        const userText = buildInterpretUserText(kind, {
            resultText: body.resultText,
            raw: body.raw,
        });

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
                        content: [{ type: "input_text", text: userText }],
                    },
                ],
                max_output_tokens: kind === "uran" ? 2200 : 1200,
            }),
        });

        const json = (await response.json().catch(() => null)) as OpenAIResponse | null;

        if (!response.ok) {
            return NextResponse.json(
                { ok: false, error: json?.error?.message || "OpenAI request failed" },
                { status: 500 }
            );
        }

        const interpretation = extractText(json);

        if (kind === "uran") {
            const parsed = safeJsonParse<{
                block1?: string;
                reforms?: string[];
                aspects?: Array<{
                    periods?: string;
                    title?: string;
                    text?: string;
                }>;
            }>(interpretation);

            return NextResponse.json({
                ok: true,
                model: MODEL,
                kind,
                interpretation,
                structured: parsed,
            });
        }

        return NextResponse.json({
            ok: true,
            model: MODEL,
            kind,
            interpretation,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}