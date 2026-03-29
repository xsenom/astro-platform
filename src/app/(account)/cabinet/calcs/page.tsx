"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Mode = "natal" | "day" | "week" | "month";

const ASTRO_API_BASE =
    process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() ||
    "https://YOUR_FASTAPI_DOMAIN"; // ← поставь свой

function clampInt(v: any, def: number) {
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
}

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export default function CalcsPage() {
    const [userEmail, setUserEmail] = useState("");

    // входные данные рождения (можно позже подтянуть из profile)
    const [year, setYear] = useState(1990);
    const [month, setMonth] = useState(2);
    const [day, setDay] = useState(7);
    const [hour, setHour] = useState<string>("12"); // hour/minute у тебя Optional[str] в natal
    const [minute, setMinute] = useState<string>("00");
    const [city, setCity] = useState("Москва");

    const [mode, setMode] = useState<Mode>("natal");

    // shift: 0 / +1 day / +7 day / +30 day
    const [shiftDays, setShiftDays] = useState(0);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [resultText, setResultText] = useState<string>("");

    useEffect(() => {
        (async () => {
            const { data } = await supabase.auth.getUser();
            setUserEmail(data.user?.email ?? "");
        })();
    }, []);

    const shiftOptions = useMemo(() => {
        if (mode === "day") {
            return [
                { v: 0, label: "Сегодня" },
                { v: 1, label: "Завтра (+1 день)" },
            ];
        }
        if (mode === "week") {
            return [
                { v: 0, label: "Эта неделя" },
                { v: 7, label: "Следующая неделя (+7 дней)" },
            ];
        }
        if (mode === "month") {
            return [
                { v: 0, label: "Этот месяц" },
                { v: 30, label: "Следующий месяц (+30 дней)" },
            ];
        }
        // natal
        return [
            { v: 0, label: "Дата рождения" },
            { v: 1, label: "Сдвиг +1 день (опционально)" },
        ];
    }, [mode]);

    async function runCalc() {
        setErr(null);
        setLoading(true);
        setResultText("");

        try {
            // если хочешь защищать fastapi токеном — добавь bearer
            const token = await getAccessToken();

            const qs = new URLSearchParams();
            qs.set("year", String(year));
            qs.set("month", String(month));
            qs.set("day", String(day));
            qs.set("city_name", city);

            // для natal у тебя hour/minute Optional[str]
            if (mode === "natal") {
                qs.set("hour", hour);
                qs.set("minute", minute);
                qs.set("shift_days", String(shiftDays));
            }

            // day/week/month требуют int hour/minute
            if (mode === "day" || mode === "week" || mode === "month") {
                qs.set("hour", String(clampInt(hour, 12)));
                qs.set("minute", String(clampInt(minute, 0)));
                qs.set("shift_days", String(shiftDays));
            }

            const url =
                mode === "natal"
                    ? `${ASTRO_API_BASE}/natal?${qs.toString()}`
                    : mode === "day"
                        ? `${ASTRO_API_BASE}/transits_day?${qs.toString()}`
                        : mode === "week"
                            ? `${ASTRO_API_BASE}/transits_week_theme?${qs.toString()}`
                            : `${ASTRO_API_BASE}/transits_month?${qs.toString()}`;

            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });

            const json = await res.json().catch(() => null);
            if (!res.ok) {
                setErr(json?.detail || json?.error || `HTTP ${res.status}`);
                return;
            }

            // normalize output to text
            if (mode === "natal") {
                setResultText(String(json?.natal_chart ?? ""));
                return;
            }

            if (mode === "day") {
                const item = Array.isArray(json) ? json[0] : null;
                const lines: string[] = [];
                if (item?.day_summary) lines.push(item.day_summary);
                if (Array.isArray(item?.aspects_text)) {
                    lines.push("", "Аспекты:");
                    lines.push(...item.aspects_text.map((x: any) => String(x)));
                }
                setResultText(lines.join("\n"));
                return;
            }

            if (mode === "week") {
                const days = json?.weekly_theme_forecast || [];
                const out: string[] = [];
                for (const d of days) {
                    out.push(d.summary_text || `${d.date}`);
                    out.push("");
                }
                setResultText(out.join("\n").trim());
                return;
            }

            if (mode === "month") {
                const rows = json?.month_transits || [];
                if (!Array.isArray(rows) || !rows.length) {
                    setResultText("На выбранный период благоприятных аспектов не найдено.");
                    return;
                }
                const out = rows.map((r: any) => `• ${r.date}: ${r.description}`).join("\n");
                setResultText(out);
                return;
            }
        } finally {
            setLoading(false);
        }
    }

    function copy() {
        if (!resultText) return;
        void navigator.clipboard.writeText(resultText);
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
                {userEmail ? (
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.55)", fontSize: 12 }}>
                        Пользователь: {userEmail}
                    </div>
                ) : null}
            </div>

            {err && (
                <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(255,110,90,.22)", background: "rgba(255,110,90,.06)" }}>
                    <div style={{ fontWeight: 900 }}>Ошибка</div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
                {/* LEFT */}
                <div style={{ borderRadius: 20, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.14)", padding: 14 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Tab active={mode === "natal"} onClick={() => { setMode("natal"); setShiftDays(0); }}>Натальная карта</Tab>
                        <Tab active={mode === "day"} onClick={() => { setMode("day"); setShiftDays(0); }}>День</Tab>
                        <Tab active={mode === "week"} onClick={() => { setMode("week"); setShiftDays(0); }}>Неделя</Tab>
                        <Tab active={mode === "month"} onClick={() => { setMode("month"); setShiftDays(0); }}>Месяц</Tab>
                    </div>

                    <div style={{ marginTop: 12, padding: 12, borderRadius: 16, border: "1px solid rgba(224,197,143,.12)", background: "rgba(10,18,38,.22)" }}>
                        <div style={{ display: "grid", gap: 10 }}>
                            <Field label="Город рождения">
                                <input
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    style={inp}
                                    placeholder="Москва"
                                />
                            </Field>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                                <Field label="Год">
                                    <input value={year} onChange={(e) => setYear(clampInt(e.target.value, year))} style={inp} />
                                </Field>
                                <Field label="Месяц">
                                    <input value={month} onChange={(e) => setMonth(clampInt(e.target.value, month))} style={inp} />
                                </Field>
                                <Field label="День">
                                    <input value={day} onChange={(e) => setDay(clampInt(e.target.value, day))} style={inp} />
                                </Field>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <Field label="Час">
                                    <input value={hour} onChange={(e) => setHour(e.target.value)} style={inp} placeholder="12" />
                                </Field>
                                <Field label="Минута">
                                    <input value={minute} onChange={(e) => setMinute(e.target.value)} style={inp} placeholder="00" />
                                </Field>
                            </div>

                            <Field label="Период">
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {shiftOptions.map((o) => (
                                        <Pill
                                            key={o.v}
                                            active={shiftDays === o.v}
                                            onClick={() => setShiftDays(o.v)}
                                        >
                                            {o.label}
                                        </Pill>
                                    ))}
                                </div>
                            </Field>

                            <button
                                onClick={() => void runCalc()}
                                disabled={loading || !city.trim()}
                                style={{
                                    borderRadius: 14,
                                    padding: "12px 14px",
                                    border: "1px solid rgba(224,197,143,.20)",
                                    background: "rgba(224,197,143,.12)",
                                    color: "rgba(245,240,233,.92)",
                                    fontWeight: 950,
                                    cursor: loading ? "default" : "pointer",
                                    opacity: loading ? 0.75 : 1,
                                }}
                            >
                                {loading ? "Считаю…" : "Сделать расчёт"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT */}
                <div style={{ borderRadius: 20, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.14)", padding: 14, minHeight: "68vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 16, fontWeight: 950 }}>
                            Результат:{" "}
                            {mode === "natal" ? "Натальная карта" : mode === "day" ? "Прогноз на день" : mode === "week" ? "Прогноз на неделю" : "Прогноз на месяц"}
                        </div>
                        <div style={{ flex: 1 }} />
                        <button onClick={copy} disabled={!resultText} style={btnGhost}>
                            Копировать
                        </button>
                    </div>

                    <div style={{ marginTop: 12, padding: 12, borderRadius: 16, border: "1px solid rgba(224,197,143,.10)", background: "rgba(10,18,38,.18)", overflow: "auto", whiteSpace: "pre-wrap", color: "rgba(245,240,233,.92)" }}>
                        {resultText ? resultText : <span style={{ opacity: 0.7 }}>Нажми “Сделать расчёт”.</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: any) {
    return (
        <div>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>{label}</div>
            <div style={{ marginTop: 6 }}>{children}</div>
        </div>
    );
}

function Tab({ active, onClick, children }: any) {
    return (
        <button
            onClick={onClick}
            style={{
                borderRadius: 999,
                padding: "8px 12px",
                border: active ? "1px solid rgba(224,197,143,.30)" : "1px solid rgba(224,197,143,.12)",
                background: active ? "rgba(224,197,143,.10)" : "rgba(17,34,80,.16)",
                color: "rgba(245,240,233,.92)",
                fontWeight: 950,
                cursor: "pointer",
            }}
        >
            {children}
        </button>
    );
}

function Pill({ active, onClick, children }: any) {
    return (
        <button
            onClick={onClick}
            style={{
                borderRadius: 999,
                padding: "8px 12px",
                border: active ? "1px solid rgba(120,230,255,.28)" : "1px solid rgba(224,197,143,.12)",
                background: active ? "rgba(120,230,255,.10)" : "rgba(10,18,38,.18)",
                color: "rgba(245,240,233,.92)",
                fontWeight: 900,
                cursor: "pointer",
            }}
        >
            {children}
        </button>
    );
}

const inp: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(224,197,143,.14)",
    background: "rgba(10,18,38,.28)",
    color: "rgba(245,240,233,.92)",
    outline: "none",
};

const btnGhost: React.CSSProperties = {
    borderRadius: 12,
    padding: "8px 10px",
    border: "1px solid rgba(224,197,143,.16)",
    background: "rgba(10,18,38,.18)",
    color: "rgba(245,240,233,.92)",
    fontWeight: 900,
    cursor: "pointer",
};
