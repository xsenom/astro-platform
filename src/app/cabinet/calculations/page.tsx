"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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

type BirthProfile = {
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
};

function parseBirthDate(value: string | null) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((x) => Number.parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { year: y, month: m, day: d };
}

function parseBirthTime(value: string | null) {
    if (!value) return null;
    const [h, min] = value.split(":").map((x) => Number.parseInt(x, 10));
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    return { hour: String(h).padStart(2, "0"), minute: String(min).padStart(2, "0") };
}

export default function CalculationsPage() {
    const API = process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() || "http://127.0.0.1:8011";

    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profile, setProfile] = useState<BirthProfile | null>(null);

    const targetDate = toYMD(new Date());

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<ApiResult | null>(null);

    const dateParts = useMemo(() => parseBirthDate(profile?.birth_date ?? null), [profile?.birth_date]);
    const timeParts = useMemo(() => parseBirthTime(profile?.birth_time ?? null), [profile?.birth_time]);

    const missingFields = useMemo(() => {
        const missing: string[] = [];
        if (!dateParts) missing.push("дата рождения");
        if (!timeParts) missing.push("время рождения");
        if (!profile?.birth_city?.trim()) missing.push("место рождения");
        return missing;
    }, [dateParts, timeParts, profile?.birth_city]);

    const canRun = missingFields.length === 0;

    useEffect(() => {
        (async () => {
            setProfileLoading(true);
            setProfileError(null);

            try {
                const { data: userData, error: userErr } = await supabase.auth.getUser();
                if (userErr || !userData.user) {
                    window.location.href = "/login";
                    return;
                }

                const { data, error } = await supabase
                    .from("profiles")
                    .select("birth_date, birth_time, birth_city")
                    .eq("id", userData.user.id)
                    .maybeSingle();

                if (error) {
                    setProfileError(error.message);
                    return;
                }

                setProfile((data ?? null) as BirthProfile | null);
            } finally {
                setProfileLoading(false);
            }
        })();
    }, []);

    async function callJson(url: string) {
        let res: Response;

        try {
            res = await fetch(url, { method: "GET" });
        } catch {
            throw new Error("Сервис расчётов временно недоступен. Проверьте подключение к API и попробуйте ещё раз.");
        }

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
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                city_name: profile!.birth_city!.trim(),
                // hour/minute у тебя Optional[str], поэтому передаём как строку
                hour: timeParts!.hour,
                minute: timeParts!.minute,
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
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: String(parseInt(timeParts!.hour || "12", 10) || 12),
                minute: String(parseInt(timeParts!.minute || "0", 10) || 0),
                city_name: profile!.birth_city!.trim(),
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
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: String(parseInt(timeParts!.hour || "12", 10) || 12),
                minute: String(parseInt(timeParts!.minute || "0", 10) || 0),
                city_name: profile!.birth_city!.trim(),
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
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: String(parseInt(timeParts!.hour || "12", 10) || 12),
                minute: String(parseInt(timeParts!.minute || "0", 10) || 0),
                city_name: profile!.birth_city!.trim(),
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
                <div style={{ fontSize: 24, fontWeight: 950 }}>Расчёты</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>
                    Натальная карта и прогнозы (день / неделя / месяц).
                </div>

                {profileLoading && (
                    <div style={{ marginTop: 14, color: "rgba(245,240,233,.75)" }}>
                        Загружаем данные профиля…
                    </div>
                )}

                {!profileLoading && (profileError || missingFields.length > 0) && (
                    <div style={{ marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid rgba(255,190,90,.26)", background: "rgba(255,190,90,.08)", color: "rgba(245,240,233,.92)" }}>
                        {profileError
                            ? `Не удалось загрузить профиль: ${profileError}`
                            : `Чтобы открыть расчёты, сначала заполните в профиле: ${missingFields.join(", ")}.`}
                    </div>
                )}


                {API === "http://127.0.0.1:8011" && (
                    <div style={{ marginTop: 10, color: "rgba(245,240,233,.60)", fontSize: 12 }}>
                        Используется локальный API ({API}). Если расчёт не запускается, проверьте, что backend доступен.
                    </div>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button disabled={!canRun || loading || profileLoading} onClick={() => void runNatal()} style={btn()}>
                        {loading ? "…" : "Натальная карта"}
                    </button>
                    <button disabled={!canRun || loading || profileLoading} onClick={() => void runDay()} style={btn()}>
                        {loading ? "…" : "Прогноз на день"}
                    </button>
                    <button disabled={!canRun || loading || profileLoading} onClick={() => void runWeek()} style={btn()}>
                        {loading ? "…" : "Прогноз на неделю"}
                    </button>
                    <button disabled={!canRun || loading || profileLoading} onClick={() => void runMonth()} style={btn()}>
                        {loading ? "…" : "Прогноз на месяц"}
                    </button>

                    <div style={{ flex: 1 }} />


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
