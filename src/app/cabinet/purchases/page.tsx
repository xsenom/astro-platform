"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type AccessRow = {
    id: string;
    product_code: "natal" | "day" | "week" | "month";
    source: string;
    granted_at: string;
};

type SavedCalculationRow = {
    id: string;
    kind: "natal" | "day" | "week" | "month";
    target_date: string | null;
    result_text: string;
    updated_at: string;
};

const TITLES: Record<string, string> = {
    natal: "Натальная карта",
    day: "Прогноз на день",
    week: "Прогноз на неделю",
    month: "Прогноз на месяц",
};

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
                    .select("id, kind, target_date, result_text, updated_at")
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
                    Загружаем покупки и сохранённые расчёты…
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
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
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
                        <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 12 }}>
                            Доступные расчёты
                        </div>

                        {accesses.length === 0 ? (
                            <div style={{ color: "rgba(245,240,233,.70)" }}>
                                Пока нет оплаченных расчётов.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                                {accesses.map((row) => (
                                    <div
                                        key={row.id}
                                        style={{
                                            padding: 14,
                                            borderRadius: 16,
                                            border: "1px solid rgba(224,197,143,.12)",
                                            background: "rgba(10,18,38,.18)",
                                        }}
                                    >
                                        <div style={{ fontWeight: 900 }}>{TITLES[row.product_code] || row.product_code}</div>
                                        <div
                                            style={{
                                                marginTop: 6,
                                                color: "rgba(245,240,233,.72)",
                                                fontSize: 14,
                                            }}
                                        >
                                            Доступ выдан: {new Date(row.granted_at).toLocaleString("ru-RU")}
                                        </div>
                                        <div
                                            style={{
                                                marginTop: 4,
                                                color: "rgba(245,240,233,.58)",
                                                fontSize: 13,
                                            }}
                                        >
                                            Источник: {row.source}
                                        </div>
                                    </div>
                                ))}
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
                            Сохранённые результаты
                        </div>

                        {saved.length === 0 ? (
                            <div style={{ color: "rgba(245,240,233,.70)" }}>
                                Пока нет сохранённых расчётов.
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 12 }}>
                                {saved.map((row) => (
                                    <div
                                        key={row.id}
                                        style={{
                                            padding: 14,
                                            borderRadius: 16,
                                            border: "1px solid rgba(224,197,143,.12)",
                                            background: "rgba(10,18,38,.18)",
                                        }}
                                    >
                                        <div style={{ fontWeight: 900 }}>
                                            {TITLES[row.kind] || row.kind}
                                            {row.target_date ? ` · ${row.target_date}` : ""}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 6,
                                                color: "rgba(245,240,233,.72)",
                                                fontSize: 14,
                                            }}
                                        >
                                            Обновлено: {new Date(row.updated_at).toLocaleString("ru-RU")}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 10,
                                                color: "rgba(245,240,233,.82)",
                                                lineHeight: 1.55,
                                                whiteSpace: "pre-wrap",
                                            }}
                                        >
                                            {row.result_text.length > 500
                                                ? `${row.result_text.slice(0, 500)}...`
                                                : row.result_text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}