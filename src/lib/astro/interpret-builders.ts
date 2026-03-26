import type { AstroPromptKind } from "./prompt-types";

type InterpretInput = {
    resultText?: string;
    raw?: unknown;
};

export function buildInterpretUserText(kind: AstroPromptKind, body: InterpretInput): string {
    if (kind === "uran") {
        return buildUranUserText(body);
    }

    return [
        "Данные астрологического расчёта:",
        JSON.stringify(
            {
                kind,
                resultText: body.resultText ?? "",
                raw: body.raw ?? null,
            },
            null,
            2
        ),
    ].join("\n");
}

function buildUranUserText(body: InterpretInput): string {
    return [
        "Ниже данные расчёта Урана в Близнецах.",
        "Сформируй строго структурированный ответ по инструкции из системного промта.",
        "",
        "RESULT_TEXT:",
        body.resultText ?? "",
        "",
        "RAW_JSON:",
        JSON.stringify(body.raw ?? null, null, 2),
    ].join("\n");
}