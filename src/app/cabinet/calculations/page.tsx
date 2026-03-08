"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CalcKind = "natal" | "day" | "week" | "month";

type ApiResult =
    | { kind: "natal"; text: string; meta?: unknown }
    | { kind: "day"; text: string; raw?: unknown }
    | { kind: "week"; text: string; raw?: unknown }
    | { kind: "month"; text: string; raw?: unknown };

type BirthProfile = {
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
};

type CalcAccessOrder = {
    id: string;
    meta: Record<string, unknown> | null;
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

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

function modeTitle(kind: CalcKind) {
    if (kind === "natal") return "Натальная карта";
    if (kind === "day") return "Прогноз на день";
    if (kind === "week") return "Прогноз на неделю";
    return "Прогноз на месяц";
}

export default function CalculationsPage() {
    const API = process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() || "http://127.0.0.1:8011";

    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profile, setProfile] = useState<BirthProfile | null>(null);

    const [checkingAccess, setCheckingAccess] = useState(true);
    const [hasPaidAccess, setHasPaidAccess] = useState(false);
    const [paidOrder, setPaidOrder] = useState<CalcAccessOrder | null>(null);

    const [loading, setLoading] = useState(false);
    const [loadingKind, setLoadingKind] = useState<CalcKind | null>(null);
    const [payLoading, setPayLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<ApiResult | null>(null);

    const targetDate = toYMD(new Date());

    const dateParts = useMemo(() => parseBirthDate(profile?.birth_date ?? null), [profile?.birth_date]);
    const timeParts = useMemo(() => parseBirthTime(profile?.birth_time ?? null), [profile?.birth_time]);

    const missingFields = useMemo(() => {
        const missing: string[] = [];
        if (!dateParts) missing.push("дата рождения");
        if (!timeParts) missing.push("время рождения");
        if (!profile?.birth_city?.trim()) missing.push("место рождения");
        return missing;
    }, [dateParts, timeParts, profile?.birth_city]);

    const canRunBirth = missingFields.length === 0;

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

    useEffect(() => {
        void refreshPaidAccess();
    }, []);

    async function refreshPaidAccess() {
        setCheckingAccess(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) {
                setHasPaidAccess(false);
                setPaidOrder(null);
                return;
            }

            const { data } = await supabase
                .from("orders")
                .select("id, meta")
                .eq("user_id", user.id)
                .eq("kind", "calc_access")
                .or("status.eq.paid,paid_at.not.is.null")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data?.id) {
                setHasPaidAccess(true);
                setPaidOrder({
                    id: data.id as string,
                    meta: (data.meta as Record<string, unknown> | null) ?? null,
                });
            } else {
                setHasPaidAccess(false);
                setPaidOrder(null);
            }
        } finally {
            setCheckingAccess(false);
        }
    }

    async function createPendingCalcOrder() {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
            window.location.href = "/login";
            return null;
        }

        const amountCents = Number.parseInt(process.env.NEXT_PUBLIC_CALCS_PRICE_CENTS || "99000", 10) || 99000;

        const { data, error } = await supabase
            .from("orders")
            .insert({
                user_id: user.id,
                status: "pending",
                amount_cents: amountCents,
                currency: "RUB",
                customer_email: user.email ?? null,
                provider: "getcourse",
                provider_order_id: null,
                paid_at: null,
                kind: "calc_access",
                meta: { purpose: "calc_access" },
                consumed_at: null,
                updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

        if (error) {
            setErr(error.message);
            return null;
        }

        return data.id as string;
    }

    function getCalcPayUrl(localOrderId: string) {
        const base = process.env.NEXT_PUBLIC_GC_CALCS_URL;
        if (!base) return "";

        const u = new URL(base);
        u.searchParams.set("local_order_id", localOrderId);
        u.searchParams.set("kind", "calc_access");
        return u.toString();
    }

    function buildCacheKey(kind: CalcKind) {
        return JSON.stringify({
            kind,
            year: dateParts?.year,
            month: dateParts?.month,
            day: dateParts?.day,
            hour: timeParts?.hour,
            minute: timeParts?.minute,
            city: profile?.birth_city?.trim().toLowerCase(),
            targetDate: kind === "day" ? targetDate : null,
        });
    }

    function readCachedResult(kind: CalcKind): ApiResult | null {
        if (!paidOrder?.meta || kind === "natal") return null;
        const cacheKey = buildCacheKey(kind);
        const calcsCache = (paidOrder.meta.calcs_cache as Record<string, unknown> | undefined) || {};
        const row = calcsCache[cacheKey] as { text?: string; raw?: unknown } | undefined;
        if (!row?.text) return null;
        return { kind, text: row.text, raw: row.raw } as ApiResult;
    }

    async function saveCachedResult(kind: Exclude<CalcKind, "natal">, payload: { text: string; raw: unknown }) {
        if (!paidOrder?.id) return;

        const cacheKey = buildCacheKey(kind);
        const existingMeta = (paidOrder.meta ?? {}) as Record<string, unknown>;
        const existingCache = (existingMeta.calcs_cache as Record<string, unknown> | undefined) ?? {};

        const nextMeta: Record<string, unknown> = {
            ...existingMeta,
            calcs_cache: {
                ...existingCache,
                [cacheKey]: {
                    ...payload,
                    saved_at: new Date().toISOString(),
                },
            },
        };

        const { error } = await supabase
            .from("orders")
            .update({ meta: nextMeta, updated_at: new Date().toISOString() })
            .eq("id", paidOrder.id);

        if (!error) {
            setPaidOrder({ ...paidOrder, meta: nextMeta });
        }
    }

    async function callJson(url: string) {
        let res: Response;

        try {
            res = await fetch(url, { method: "GET" });
        } catch {
            throw new Error("Сервис расчётов временно недоступен. Проверьте подключение к API и попробуйте ещё раз.");
        }

        const json = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = json?.detail || json?.message || `HTTP ${res.status}`;
            throw new Error(msg);
        }

        return json;
    }

    async function run(kind: CalcKind) {
        if (!canRunBirth || profileLoading || checkingAccess) return;

        if (kind !== "natal" && !hasPaidAccess) {
            setErr("Прогнозы на день/неделю/месяц доступны после покупки. Сначала оплатите доступ.");
            return;
        }

        if (kind !== "natal") {
            const cached = readCachedResult(kind);
            if (cached) {
                setErr(null);
                setResult(cached);
                return;
            }
        }

        setLoading(true);
        setLoadingKind(kind);
        setErr(null);
        setResult(null);

        try {
            const qs = new URLSearchParams({
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: timeParts!.hour,
                minute: timeParts!.minute,
                city_name: profile!.birth_city!.trim(),
            });

            if (kind === "day") qs.set("target_date", targetDate);

            const path =
                kind === "natal"
                    ? "/natal"
                    : kind === "day"
                        ? "/transits_day"
                        : kind === "week"
                            ? "/transits_week_theme"
                            : "/transits_month";

            const json = await callJson(`${API}${path}?${qs.toString()}`);

            if (kind === "natal") {
                setResult({ kind: "natal", text: json?.natal_chart || "Пустой ответ", meta: json });
                return;
            }

            if (kind === "day") {
                const item = Array.isArray(json) ? json[0] : json;
                const lines: string[] = [];
                if (item?.day_summary) lines.push(String(item.day_summary));
                if (Array.isArray(item?.aspects_text)) lines.push("", ...item.aspects_text.map((x: unknown) => String(x)));
                const text = lines.join("\n") || "Пустой ответ";
                const out: ApiResult = { kind: "day", text, raw: json };
                setResult(out);
                await saveCachedResult("day", { text, raw: json });
                return;
            }

            if (kind === "week") {
                const arr = json?.weekly_theme_forecast || [];
                const text = Array.isArray(arr)
                    ? arr.map((x: { summary_text?: string }) => x.summary_text || "").join("\n\n")
                    : JSON.stringify(json, null, 2);
                const out: ApiResult = { kind: "week", text: text || "Пустой ответ", raw: json };
                setResult(out);
                await saveCachedResult("week", { text: out.text, raw: json });
                return;
            }

            const arr = json?.month_transits || [];
            const text = Array.isArray(arr) && arr.length
                ? arr
                    .slice(0, 200)
                    .map((x: { date?: string; description?: string }) => `${x.date} — ${x.description}`)
                    .join("\n")
                : "Нет точных благоприятных аспектов в ближайшие 30 дней.";

            const out: ApiResult = { kind: "month", text, raw: json };
            setResult(out);
            await saveCachedResult("month", { text, raw: json });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Ошибка");
        } finally {
            setLoading(false);
            setLoadingKind(null);
        }
    }

    async function buyAccess() {
        setPayLoading(true);
        setErr(null);
        try {
            const localOrderId = await createPendingCalcOrder();
            if (!localOrderId) return;

            const url = getCalcPayUrl(localOrderId);
            if (!url) {
                setErr("Заказ создан, но ссылка на оплату не задана. Добавьте NEXT_PUBLIC_GC_CALCS_URL.");
                return;
            }

            window.location.href = url;
        } finally {
            setPayLoading(false);
        }
    }

    const disableRunButtons = !canRunBirth || loading || profileLoading || checkingAccess;

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <style jsx>{`
                @keyframes orbit {
                    0% { transform: rotate(0deg) translateX(22px) rotate(0deg); }
                    100% { transform: rotate(360deg) translateX(22px) rotate(-360deg); }
                }
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 0.85; }
                    50% { transform: scale(1.16); opacity: 1; }
                }
            `}</style>

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
                    Натальная карта — бесплатно. Прогнозы (день / неделя / месяц) — после покупки.
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

                {!checkingAccess && !hasPaidAccess && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: "1px solid rgba(120,230,255,.26)", background: "rgba(120,230,255,.08)", color: "rgba(245,240,233,.92)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13 }}>Доступ к прогнозам (день/неделя/месяц) ещё не куплен.</div>
                        <button onClick={() => void buyAccess()} disabled={payLoading} style={buyBtn()}>
                            {payLoading ? "Создаём заказ…" : "Купить доступ к прогнозам"}
                        </button>
                    </div>
                )}

                {!checkingAccess && hasPaidAccess && (
                    <div style={{ marginTop: 12, color: "rgba(120,230,255,.92)", fontSize: 13, fontWeight: 700 }}>
                        ✓ Доступ к прогнозам активен. Готовые результаты сохраняются и повторно отдаются из покупки.
                    </div>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button disabled={disableRunButtons} onClick={() => void run("natal")} style={btn()}>
                        {loadingKind === "natal" ? "…" : modeTitle("natal")}
                    </button>
                    <button disabled={disableRunButtons || !hasPaidAccess} onClick={() => void run("day")} style={btn(!hasPaidAccess)}>
                        {loadingKind === "day" ? "…" : modeTitle("day")}
                    </button>
                    <button disabled={disableRunButtons || !hasPaidAccess} onClick={() => void run("week")} style={btn(!hasPaidAccess)}>
                        {loadingKind === "week" ? "…" : modeTitle("week")}
                    </button>
                    <button disabled={disableRunButtons || !hasPaidAccess} onClick={() => void run("month")} style={btn(!hasPaidAccess)}>
                        {loadingKind === "month" ? "…" : modeTitle("month")}
                    </button>
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

                {loading && (
                    <div style={{
                        display: "grid",
                        placeItems: "center",
                        minHeight: 180,
                        borderRadius: 16,
                        border: "1px solid rgba(224,197,143,.10)",
                        background: "rgba(10,18,38,.18)",
                    }}>
                        <div style={{ position: "relative", width: 70, height: 70 }}>
                            <div style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                background: "radial-gradient(circle, rgba(255,216,142,1) 0%, rgba(255,173,92,1) 100%)",
                                boxShadow: "0 0 26px rgba(255,190,90,.45)",
                                animation: "pulse 1.2s ease-in-out infinite",
                            }} />
                            <div style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                marginLeft: -5,
                                marginTop: -5,
                                background: "rgba(120,230,255,1)",
                                boxShadow: "0 0 10px rgba(120,230,255,.9)",
                                animation: "orbit 1.4s linear infinite",
                            }} />
                        </div>
                        <div style={{ marginTop: 12, color: "rgba(245,240,233,.82)", fontWeight: 700 }}>
                            Считаем: {loadingKind ? modeTitle(loadingKind) : "расчёт"}…
                        </div>
                    </div>
                )}

                {!loading && !result && (
                    <div style={{ color: "rgba(245,240,233,.70)" }}>
                        Нажми кнопку расчёта — результат появится здесь.
                    </div>
                )}

                {!loading && result && (
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

function btn(disabledStyle = false): React.CSSProperties {
    return {
        borderRadius: 14,
        padding: "10px 12px",
        border: disabledStyle ? "1px solid rgba(224,197,143,.10)" : "1px solid rgba(224,197,143,.18)",
        background: disabledStyle ? "rgba(17,34,80,.18)" : "rgba(224,197,143,.10)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: "pointer",
    };
}

function buyBtn(): React.CSSProperties {
    return {
        borderRadius: 12,
        padding: "8px 10px",
        border: "1px solid rgba(120,230,255,.26)",
        background: "rgba(120,230,255,.16)",
        color: "rgba(245,240,233,.95)",
        fontWeight: 900,
        cursor: "pointer",
    };
}
