import type { CalcKind, MarkdownSection, SavedCalculationRow } from "./types";

export function pad2(n: number) {
    return String(n).padStart(2, "0");
}

export function toYMD(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseBirthDate(value: string | null) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((x) => Number.parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { year: y, month: m, day: d };
}

export function parseBirthTime(value: string | null) {
    if (!value) return null;
    const [h, min] = value.split(":").map((x) => Number.parseInt(x, 10));
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;

    return {
        hour: String(h).padStart(2, "0"),
        minute: String(min).padStart(2, "0"),
    };
}

export function parseYmdToLocalDate(value: string | null) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((x) => Number.parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

export function endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
}

export function getRowAnchorDate(row: SavedCalculationRow) {
    const byTargetDate = parseYmdToLocalDate(row.target_date ?? null);
    if (byTargetDate) return byTargetDate;

    const byUpdatedAt = new Date(row.updated_at);
    if (Number.isNaN(byUpdatedAt.getTime())) return null;

    return new Date(
        byUpdatedAt.getFullYear(),
        byUpdatedAt.getMonth(),
        byUpdatedAt.getDate(),
        0,
        0,
        0,
        0
    );
}

export function getExpirationDate(row: SavedCalculationRow) {
    if (row.kind === "natal") return null;

    const anchor = getRowAnchorDate(row);
    if (!anchor) return null;

    if (row.kind === "day") return endOfDay(anchor);
    if (row.kind === "week") return endOfDay(addDays(anchor, 6));
    if (row.kind === "month") return endOfDay(addDays(anchor, 29));
    if (row.kind === "big_calendar") return endOfDay(addDays(anchor, 60));
    if (row.kind === "uranus_gemini") return null;

    return null;
}

export function isSavedCalculationActive(row: SavedCalculationRow, now: Date) {
    if (row.kind === "natal") return true;

    const expiresAt = getExpirationDate(row);
    if (!expiresAt) return false;

    return now.getTime() <= expiresAt.getTime();
}

export function formatExpiration(kind: CalcKind) {
    if (kind === "day") return "до 23:59 текущего дня";
    if (kind === "week") return "6 дней после даты прогноза";
    if (kind === "month") return "29 дней после даты прогноза";
    if (kind === "big_calendar") return "60 дней после даты прогноза";
    if (kind === "uranus_gemini") return "без ограничения";
    return "без ограничения";
}

export const loadingLabels: Record<CalcKind, string[]> = {
    natal: [
        "Строим натальную карту",
        "Собираем положения планет",
        "Формируем интерпретацию",
    ],
    day: [
        "Открываем сохранённый прогноз на день",
        "Проверяем срок хранения результата",
        "Подготавливаем отображение",
    ],
    week: [
        "Открываем сохранённый прогноз на неделю",
        "Проверяем срок хранения результата",
        "Подготавливаем отображение",
    ],
    month: [
        "Открываем сохранённый прогноз на месяц",
        "Проверяем срок хранения результата",
        "Подготавливаем отображение",
    ],
    big_calendar: [
        "Открываем большой женский календарь",
        "Проверяем срок хранения результата",
        "Подготавливаем PDF и отображение",
    ],
    uranus_gemini: [
        "Отправляем запрос на backend-расчёт",
        "Получаем персональный расчёт Урана",
        "Подготавливаем отображение результата",
    ],
};

export function extractMarkdownSections(text: string): MarkdownSection[] {
    const lines = text.split("\n");
    const sections: MarkdownSection[] = [];
    let current: MarkdownSection | null = null;

    const natalFallbackTitles = [
        "Общий разбор",
        "Ключевой характер",
        "Сильные стороны",
        "Зоны роста",
        "Отношения",
        "Реализация",
    ];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        const headingMatch = line.match(/^#{2,3}\s+(.+)$/);
        if (headingMatch) {
            current = {
                title: headingMatch[1].replace(/\*\*/g, "").trim(),
                body: [],
            };
            sections.push(current);
            continue;
        }

        if (!current) {
            current = { title: "Общий разбор", body: [] };
            sections.push(current);
        }

        current.body.push(line);
    }

    if (sections.length <= 1) {
        const fallbackSections: MarkdownSection[] = [];
        let fallbackCurrent: MarkdownSection | null = null;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const normalizedLine = line
                .replace(/^[-*]\s*/, "")
                .replace(/\*\*/g, "")
                .replace(/:+$/, "")
                .trim();

            const matchedTitle = natalFallbackTitles.find(
                (title) =>
                    normalizedLine === title ||
                    normalizedLine.startsWith(`${title}:`) ||
                    normalizedLine.startsWith(`${title} —`)
            );

            if (matchedTitle) {
                fallbackCurrent = { title: matchedTitle, body: [] };
                fallbackSections.push(fallbackCurrent);
                continue;
            }

            if (!fallbackCurrent) {
                fallbackCurrent = { title: "Общий разбор", body: [] };
                fallbackSections.push(fallbackCurrent);
            }

            fallbackCurrent.body.push(line);
        }

        if (fallbackSections.length > 1) {
            return fallbackSections;
        }
    }

    return sections;
}
