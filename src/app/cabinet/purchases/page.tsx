"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CalcKind = "natal" | "day" | "week" | "month" | "big_calendar";

type AccessRow = {
    id: string;
    product_code: CalcKind;
    source: string;
    granted_at: string;
};

type SavedCalculationRow = {
    id: string;
    kind: CalcKind;
    target_date: string | null;

    result_text: string;
    interpretation_text: string | null;
    interpretation_model: string | null;
    interpretation_updated_at: string | null;

    updated_at: string;
    pdf_url?: string | null;
};

type PurchaseCard = {
    key: string;
    kind: CalcKind;
    title: string;
    grantedAt: string | null;
    source: string | null;
    savedRows: SavedCalculationRow[];
    isFree: boolean;
};

const TITLES: Record<CalcKind, string> = {
    natal: "Натальная карта",
    day: "Прогноз на день",
    week: "Прогноз на неделю",
    month: "Прогноз на месяц",
    big_calendar: "Большой женский календарь",
};

function getDisplayText(row: SavedCalculationRow) {
    const text = row.interpretation_text?.trim() || row.result_text?.trim() || "";
    return text;
}

function getDisplayUpdatedAt(row: SavedCalculationRow) {
    return row.interpretation_updated_at || row.updated_at;
}

function getStatusLabel(savedRows: SavedCalculationRow[]) {
    if (!savedRows.length) return "Ожидает сохранения";

    const withInterpretation = savedRows.filter((row) =>
        !!row.interpretation_text?.trim()
    ).length;



    if (withInterpretation > 0) {
        return `Интерпретации: ${withInterpretation} из ${savedRows.length}`;
    }

    return savedRows.length === 1
        ? "Результат сохранён"
        : `Результатов сохранено: ${savedRows.length}`;
}

function cutText(text: string, limit = 500) {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
}

export default function PurchasesPage() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [accesses, setAccesses] = useState<AccessRow[]>([]);
    const [saved, setSaved] = useState<SavedCalculationRow[]>([]);

    useEffect(() => {
        void loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        setErr(null);

        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();

            if (userErr || !userData.user) {
                window.location.href = "/login";
                return;
            }

            const uid = userData.user.id;

            const [accessResp, savedResp] = await Promise.all([
                supabase
                    .from("user_calculation_access")
                    .select("id, product_code, source, granted_at")
                    .eq("user_id", uid)
                    .order("granted_at", { ascending: false }),

                supabase
                    .from("saved_calculations")
                    .select(
                        "id, kind, target_date, result_text, interpretation_text, interpretation_model, interpretation_updated_at, updated_at, pdf_url"
                    )
                    .eq("user_id", uid)
                    .order("updated_at", { ascending: false }),
            ]);

            if (accessResp.error) {
                setErr(accessResp.error.message);
                return;
            }

            if (savedResp.error) {
                setErr(savedResp.error.message);
                return;
            }

            setAccesses((accessResp.data ?? []) as AccessRow[]);
            setSaved((savedResp.data ?? []) as SavedCalculationRow[]);
        } finally {
            setLoading(false);
        }
    }

    const groupedSaved = useMemo(() => {
        const map: Partial<Record<CalcKind, SavedCalculationRow[]>> = {};

        for (const row of saved) {
            if (!map[row.kind]) {
                map[row.kind] = [];
            }
            map[row.kind]!.push(row);
        }

        return map;
    }, [saved]);

    const cards = useMemo(() => {
        const result: PurchaseCard[] = [];

        if ((groupedSaved.natal?.length ?? 0) > 0) {
            result.push({
                key: "free-natal",
                kind: "natal",
                title: TITLES.natal,
                grantedAt: null,
                source: "free",
                savedRows: groupedSaved.natal ?? [],
                isFree: true,
            });
        }

        for (const access of accesses) {
            const savedRows = groupedSaved[access.product_code] ?? [];

            result.push({
                key: access.id,
                kind: access.product_code,
                title: TITLES[access.product_code] || access.product_code,
                grantedAt: access.granted_at,
                source: access.source,
                savedRows,
                isFree: false,
            });
        }

        return result;
    }, [accesses, groupedSaved]);

    const savedWithInterpretationCount = useMemo(() => {
        return saved.filter((row) => !!row.interpretation_text?.trim()).length;
    }, [saved]);

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                <div style={{ fontSize: 24, fontWeight: 950 }}>Мои покупки</div>

                <div
                    style={{
                        marginTop: 8,
                        color: "rgba(245,240,233,.72)",
                        lineHeight: 1.55,
                    }}
                >

                </div>

                {!loading && !err && (
                    <div
                        style={{
                            marginTop: 14,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <div style={badgeStyle("rgba(224,197,143,.10)")}>
                            Покупок: {cards.length}
                        </div>
                        <div style={badgeStyle("rgba(110,170,255,.14)")}>
                            Всего сохранённых записей: {saved.length}
                        </div>

                    </div>
                )}
            </div>

            {loading && (
                <div
                    style={{
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid rgba(224,197,143,.14)",
                        background: "rgba(17,34,80,.16)",
                        color: "rgba(245,240,233,.78)",
                    }}
                >
                    Загружаем покупки...
                </div>
            )}

            {err && (
                <div
                    style={{
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid rgba(255,110,90,.22)",
                        background: "rgba(255,110,90,.06)",
                    }}
                >
                    <div style={{ fontWeight: 900 }}>Ошибка</div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>
                        {err}
                    </div>
                </div>
            )}

            {!loading && !err && (
                <>
                    <div
                        style={{
                            padding: 18,
                            borderRadius: 22,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "rgba(17,34,80,.16)",
                        }}
                    >


                        {cards.length === 0 ? (
                            <div style={{ color: "rgba(245,240,233,.70)" }}>
                                Пока нет покупок.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                                {cards.map((card) => {
                                    const status = getStatusLabel(card.savedRows);

                                    return (
                                        <div
                                            key={card.key}
                                            style={{
                                                padding: 14,
                                                borderRadius: 16,
                                                border: "1px solid rgba(224,197,143,.12)",
                                                background: "rgba(10,18,38,.18)",
                                                display: "grid",
                                                gap: 12,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 12,
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <div style={{ fontWeight: 900 }}>{card.title}</div>


                                            </div>

                                            {!card.isFree && card.grantedAt && (
                                                <div
                                                    style={{
                                                        color: "rgba(245,240,233,.72)",
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    Доступ выдан:{" "}
                                                    {new Date(card.grantedAt).toLocaleString("ru-RU")}
                                                </div>
                                            )}

                                            {!card.isFree && card.source && (
                                                <div
                                                    style={{
                                                        color: "rgba(245,240,233,.58)",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    Источник: {card.source}
                                                </div>
                                            )}

                                            {card.savedRows.length > 0 ? (
                                                <div style={{ display: "grid", gap: 10 }}>
                                                    {card.savedRows.map((row) => {
                                                        const displayText = getDisplayText(row);
                                                        const displayUpdatedAt = getDisplayUpdatedAt(row);
                                                        const hasInterpretation =
                                                            !!row.interpretation_text?.trim();

                                                        return (
                                                            <div
                                                                key={row.id}
                                                                style={{
                                                                    padding: 12,
                                                                    borderRadius: 14,
                                                                    border:
                                                                        "1px solid rgba(224,197,143,.10)",
                                                                    background: "rgba(17,34,80,.16)",
                                                                    display: "grid",
                                                                    gap: 8,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        gap: 10,
                                                                        flexWrap: "wrap",
                                                                        alignItems: "center",
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            color: "rgba(245,240,233,.92)",
                                                                            fontWeight: 800,
                                                                        }}
                                                                    >
                                                                        {row.target_date
                                                                            ? `Дата прогноза: ${row.target_date}`
                                                                            : "Без привязки к дате"}
                                                                    </div>


                                                                </div>

                                                                <div
                                                                    style={{
                                                                        color: "rgba(245,240,233,.72)",
                                                                        fontSize: 14,
                                                                    }}
                                                                >
                                                                    Обновлено:{" "}
                                                                    {new Date(
                                                                        displayUpdatedAt
                                                                    ).toLocaleString("ru-RU")}
                                                                </div>

                                                                {row.interpretation_model && (
                                                                    <div
                                                                        style={{
                                                                            color: "rgba(245,240,233,.58)",
                                                                            fontSize: 13,
                                                                        }}
                                                                    >
                                                                        Модель: {row.interpretation_model}
                                                                    </div>
                                                                )}

                                                                <div
                                                                    style={{
                                                                        color: "rgba(245,240,233,.82)",
                                                                        lineHeight: 1.55,
                                                                        whiteSpace: "pre-wrap",
                                                                    }}
                                                                >
                                                                    {displayText
                                                                        ? cutText(displayText, 500)
                                                                        : "Текст пока пустой."}
                                                                </div>

                                                                {row.pdf_url && (
                                                                    <a
                                                                        href={row.pdf_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            display: "inline-block",
                                                                            width: "fit-content",
                                                                            borderRadius: 12,
                                                                            padding: "10px 12px",
                                                                            border:
                                                                                "1px solid rgba(224,197,143,.18)",
                                                                            background:
                                                                                "rgba(224,197,143,.10)",
                                                                            color: "rgba(245,240,233,.92)",
                                                                            fontWeight: 900,
                                                                            textDecoration: "none",
                                                                        }}
                                                                    >
                                                                        Скачать PDF
                                                                    </a>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div
                                                    style={{
                                                        color: "rgba(245,240,233,.68)",
                                                        lineHeight: 1.55,
                                                    }}
                                                >
                                                    Расчет пока не сохранен.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            padding: 18,
                            borderRadius: 22,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "rgba(17,34,80,.16)",
                        }}
                    >
                        <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 12 }}>
                            Все сохранённые расчёты
                        </div>

                        {saved.length === 0 ? (
                            <div style={{ color: "rgba(245,240,233,.70)" }}>
                                Пока нет сохранённых расчётов.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                                {saved.map((row) => {
                                    const displayText = getDisplayText(row);
                                    const displayUpdatedAt = getDisplayUpdatedAt(row);
                                    const hasInterpretation =
                                        !!row.interpretation_text?.trim();

                                    return (
                                        <div
                                            key={row.id}
                                            style={{
                                                padding: 14,
                                                borderRadius: 16,
                                                border: "1px solid rgba(224,197,143,.12)",
                                                background: "rgba(10,18,38,.18)",
                                                display: "grid",
                                                gap: 8,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: 12,
                                                    flexWrap: "wrap",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <div style={{ fontWeight: 900 }}>
                                                    {TITLES[row.kind] || row.kind}
                                                    {row.target_date ? ` · ${row.target_date}` : ""}
                                                </div>


                                            </div>

                                            <div
                                                style={{
                                                    color: "rgba(245,240,233,.72)",
                                                    fontSize: 14,
                                                }}
                                            >
                                                Обновлено:{" "}
                                                {new Date(displayUpdatedAt).toLocaleString("ru-RU")}
                                            </div>

                                            {row.interpretation_model && (
                                                <div
                                                    style={{
                                                        color: "rgba(245,240,233,.58)",
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    Модель: {row.interpretation_model}
                                                </div>
                                            )}

                                            <div
                                                style={{
                                                    marginTop: 2,
                                                    color: "rgba(245,240,233,.82)",
                                                    lineHeight: 1.55,
                                                    whiteSpace: "pre-wrap",
                                                }}
                                            >
                                                {displayText
                                                    ? cutText(displayText, 500)
                                                    : "Текст пока пустой."}
                                            </div>

                                            {row.pdf_url && (
                                                <a
                                                    href={row.pdf_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: "inline-block",
                                                        width: "fit-content",
                                                        borderRadius: 12,
                                                        padding: "10px 12px",
                                                        border: "1px solid rgba(224,197,143,.18)",
                                                        background: "rgba(224,197,143,.10)",
                                                        color: "rgba(245,240,233,.92)",
                                                        fontWeight: 900,
                                                        textDecoration: "none",
                                                    }}
                                                >
                                                    Скачать PDF
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function badgeStyle(bg: string) {
    return {
        minWidth: 120,
        minHeight: 30,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background: bg,
        color: "rgba(245,240,233,.92)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center" as const,
        whiteSpace: "nowrap" as const,
    };
}