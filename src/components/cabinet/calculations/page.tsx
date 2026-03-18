"use client";

import { useMemo, useState } from "react";

type ApiResult =
    | { kind: "natal"; text: string; meta?: any }
    | { kind: "day"; text: string; raw?: any }
    | { kind: "week"; text: string; raw?: any }
    | { kind: "month"; text: string; raw?: any };

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function CalculationsPage() {
    const API = process.env.NEXT_PUBLIC_ASTRO_API_BASE || "http://127.0.0.1:8011";

    // базовые поля (можешь связать потом с profile из supabase)
    const [year, setYear] = useState<number>(1990);
    const [month, setMonth] = useState<number>(5);
    const [day, setDay] = useState<number>(11);
    const [hour, setHour] = useState<string>("12");    // строка, т.к. у тебя hour может быть "я не знаю"
    const [minute, setMinute] = useState<string>("00");
    const [city, setCity] = useState<string>("Москва");

    // дата прогноза для day/week (target_date)
    const [targetDate, setTargetDate] = useState<string>(toYMD(new Date()));

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<ApiResult | null>(null);

    const canRun = useMemo(() => {
        return !!city.trim() && year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
    }, [city, year, month, day]);

    async function callJson(url: string) {
        const res = await fetch(url, { method: "GET" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
            // FastAPI обычно отдаёт { detail: "..." }
            const msg = json?.detail || json?.message || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return json;
    }

    async function runNatal() {
        setLoading(true);
        setErr(null);
        setResult(null);
        try {
            const qs = new URLSearchParams({
                year: String(year),
                month: String(month),
                day: String(day),
                city_name: city,
                // hour/minute у тебя Optional[str], поэтому передаём как строку
                hour: hour,
                minute: minute,
            });

            const json = await callJson(`${API}/natal?${qs.toString()}`);

            setResult({
                kind: "natal",
                text: json?.natal_chart || "Пустой ответ",
                meta: json,
            });
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
        }
    }

    async function runDay() {
        setLoading(true);
        setErr(null);
        setResult(null);
        try {
            const qs = new URLSearchParams({
                year: String(year),
                month: String(month),
                day: String(day),
                hour: String(parseInt(hour || "12", 10) || 12),
                minute: String(parseInt(minute || "0", 10) || 0),
                city_name: city,
                target_date: targetDate, // твоя ручка поддерживает target_date
            });

            const json = await callJson(`${API}/transits_day?${qs.toString()}`);

            // json там список, берём первый элемент
            const item = Array.isArray(json) ? json[0] : json;

            const lines: string[] = [];
            if (item?.day_summary) lines.push(item.day_summary);
            if (Array.isArray(item?.aspects_text)) lines.push("", ...item.aspects_text);

            setResult({
                kind: "day",
                text: lines.join("\n") || "Пустой ответ",
                raw: json,
            });
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
        }
    }

    async function runWeek() {
        setLoading(true);
        setErr(null);
        setResult(null);
        try {
            // У тебя есть /transits_week_theme и /transits_week.
            // Для UI проще theme (возвращает summary_text по дням).
            const qs = new URLSearchParams({
                year: String(year),
                month: String(month),
                day: String(day),
                hour: String(parseInt(hour || "12", 10) || 12),
                minute: String(parseInt(minute || "0", 10) || 0),
                city_name: city,
            });

            const json = await callJson(`${API}/transits_week_theme?${qs.toString()}`);

            const arr = json?.weekly_theme_forecast || [];
            const text = Array.isArray(arr)
                ? arr.map((x: any) => x.summary_text).join("\n\n")
                : JSON.stringify(json, null, 2);

            setResult({ kind: "week", text: text || "Пустой ответ", raw: json });
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
        }
    }

    async function runMonth() {
        setLoading(true);
        setErr(null);
        setResult(null);
        try {
            const qs = new URLSearchParams({
                year: String(year),
                month: String(month),
                day: String(day),
                hour: String(parseInt(hour || "12", 10) || 12),
                minute: String(parseInt(minute || "0", 10) || 0),
                city_name: city,
            });

            const json = await callJson(`${API}/transits_month?${qs.toString()}`);

            const arr = json?.month_transits || [];
            const text = Array.isArray(arr) && arr.length
                ? arr
                    .slice(0, 200)
                    .map((x: any) => `${x.date} — ${x.description}`)
                    .join("\n")
                : "Нет точных благоприятных аспектов в ближайшие 30 дней.";

            setResult({ kind: "month", text, raw: json });
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
        }
    }

    function shiftTarget(days: number) {
        const d = new Date(targetDate + "T00:00:00");
        d.setDate(d.getDate() + days);
        setTargetDate(toYMD(d));
    }

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                <div style={{ fontSize: 24, fontWeight: 950 }}>Прогнозы</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>
                    Натальная карта и прогнозы (день / неделя / месяц).
                </div>

                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
                    <Field label="Год">
                        <input value={String(year)} onChange={(e) => setYear(parseInt(e.target.value || "0", 10) || 0)} style={inp()} />
                    </Field>
                    <Field label="Месяц">
                        <input value={String(month)} onChange={(e) => setMonth(parseInt(e.target.value || "0", 10) || 0)} style={inp()} />
                    </Field>
                    <Field label="День">
                        <input value={String(day)} onChange={(e) => setDay(parseInt(e.target.value || "0", 10) || 0)} style={inp()} />
                    </Field>
                    <Field label="Час">
                        <input value={hour} onChange={(e) => setHour(e.target.value)} placeholder='например "12" или "я не знаю"' style={inp()} />
                    </Field>
                    <Field label="Минуты">
                        <input value={minute} onChange={(e) => setMinute(e.target.value)} style={inp()} />
                    </Field>
                    <Field label="Город">
                        <input value={city} onChange={(e) => setCity(e.target.value)} style={inp()} />
                    </Field>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button disabled={!canRun || loading} onClick={() => void runNatal()} style={btn()}>
                        {loading ? "…" : "Натальная карта"}
                    </button>
                    <button disabled={!canRun || loading} onClick={() => void runDay()} style={btn()}>
                        {loading ? "…" : "Прогноз на день"}
                    </button>
                    <button disabled={!canRun || loading} onClick={() => void runWeek()} style={btn()}>
                        {loading ? "…" : "Прогноз на неделю"}
                    </button>
                    <button disabled={!canRun || loading} onClick={() => void runMonth()} style={btn()}>
                        {loading ? "…" : "Прогноз на месяц"}
                    </button>

                    <div style={{ flex: 1 }} />

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Дата (для дня):</div>
                        <input value={targetDate} onChange={(e) => setTargetDate(e.target.value)} style={{ ...inp(), width: 160 }} />
                        <button onClick={() => shiftTarget(1)} disabled={loading} style={iconBtn()}>+1 день</button>
                        <button onClick={() => shiftTarget(7)} disabled={loading} style={iconBtn()}>+1 нед</button>
                        <button onClick={() => shiftTarget(30)} disabled={loading} style={iconBtn()}>+1 мес</button>
                    </div>
                </div>
            </div>

            {err && (
                <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(255,110,90,.22)", background: "rgba(255,110,90,.06)" }}>
                    <div style={{ fontWeight: 900 }}>Ошибка</div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
                </div>
            )}

            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                    minHeight: "40vh",
                }}
            >
                <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>Результат</div>

                {!result && (
                    <div style={{ color: "rgba(245,240,233,.70)" }}>
                        Нажми кнопку расчёта — результат появится здесь.
                    </div>
                )}

                {result && (
                    <pre
                        style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            padding: 14,
                            borderRadius: 16,
                            border: "1px solid rgba(224,197,143,.10)",
                            background: "rgba(10,18,38,.18)",
                            color: "rgba(245,240,233,.92)",
                            fontSize: 13,
                            lineHeight: 1.55,
                        }}
                    >
            {result.text}
          </pre>
                )}
            </div>
        </div>
    );
}

function Field({ label, children }: any) {
    return (
        <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>{label}</div>
            {children}
        </div>
    );
}

function inp(): React.CSSProperties {
    return {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(224,197,143,.14)",
        background: "rgba(10,18,38,.28)",
        color: "rgba(245,240,233,.92)",
        outline: "none",
    };
}

function btn(): React.CSSProperties {
    return {
        borderRadius: 14,
        padding: "10px 12px",
        border: "1px solid rgba(224,197,143,.18)",
        background: "rgba(224,197,143,.10)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: "pointer",
    };
}

function iconBtn(): React.CSSProperties {
    return {
        borderRadius: 12,
        padding: "8px 10px",
        border: "1px solid rgba(224,197,143,.18)",
        background: "rgba(17,34,80,.16)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 900,
        cursor: "pointer",
        fontSize: 12,
    };
}
