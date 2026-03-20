"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CalcKind = "natal" | "day" | "week" | "month" | "big_calendar";

type ApiResult =
    | { kind: "natal"; text: string; meta?: any }
    | { kind: "day"; text: string; raw?: any }
    | { kind: "week"; text: string; raw?: any }
    | { kind: "month"; text: string; raw?: any }
    | { kind: "big_calendar"; text: string; raw?: any };

type BirthProfile = {
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
};

type ProductRow = {
    code: CalcKind;
    title: string;
    description: string | null;
    price_rub: number;
    is_free: boolean;
    is_active: boolean;
    sort_order: number;
};

type AccessRow = {
    product_code: CalcKind;
};

type SavedCalculationRow = {
    id: string;
    kind: CalcKind;
    target_date: string | null;
    result_text: string;
    result_json: any;
    input_params: any;
    updated_at: string;
    pdf_url?: string | null;
    pdf_path?: string | null;
    file_name?: string | null;
};

type AdminState = {
    isAdmin: boolean;
    isSuper: boolean;
};

type InterpretationState = {
    loading: boolean;
    text: string | null;
    error: string | null;
    model: string | null;
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

    return {
        hour: String(h).padStart(2, "0"),
        minute: String(min).padStart(2, "0"),
    };
}

const loadingLabels: Record<CalcKind, string[]> = {
    natal: [
        "Строим натальную карту",
        "Собираем положения планет",
        "Формируем интерпретацию",
    ],
    day: [
        "Считаем прогноз на день",
        "Анализируем транзиты",
        "Собираем рекомендации",
    ],
    week: [
        "Считаем прогноз на неделю",
        "Выделяем основные темы периода",
        "Формируем итоговый текст",
    ],
    month: [
        "Считаем прогноз на месяц",
        "Анализируем благоприятные периоды",
        "Собираем итоговый результат",
    ],
    big_calendar: [
        "Собираем персональный календарь",
        "Формируем интерпретацию",
        "Готовим PDF-файл",
    ],
};

export default function CalculationsPage() {
    const API =
        process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() || "http://127.0.0.1:8011";

    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profile, setProfile] = useState<BirthProfile | null>(null);

    const [userId, setUserId] = useState<string | null>(null);
    const [adminState, setAdminState] = useState<AdminState>({ isAdmin: false, isSuper: false });

    const [products, setProducts] = useState<ProductRow[]>([]);
    const [accessMap, setAccessMap] = useState<Record<CalcKind, boolean>>({
        natal: true,
        day: false,
        week: false,
        month: false,
        big_calendar: false,
    });

    const [savedMap, setSavedMap] = useState<
        Partial<Record<CalcKind, SavedCalculationRow>>
    >({});

    const [loading, setLoading] = useState(false);
    const [activeKind, setActiveKind] = useState<CalcKind | null>(null);
    const [loadingStep, setLoadingStep] = useState(0);

    const [err, setErr] = useState<string | null>(null);
    const [result, setResult] = useState<ApiResult | null>(null);
    const [resultMeta, setResultMeta] = useState<{
        source: "saved" | "fresh" | null;
        updatedAt?: string | null;
    }>({ source: null, updatedAt: null });
    const [interpretation, setInterpretation] = useState<InterpretationState>({
        loading: false,
        text: null,
        error: null,
        model: null,
    });

    const targetDate = toYMD(new Date());

    const dateParts = useMemo(
        () => parseBirthDate(profile?.birth_date ?? null),
        [profile?.birth_date]
    );

    const timeParts = useMemo(
        () => parseBirthTime(profile?.birth_time ?? null),
        [profile?.birth_time]
    );

    const missingFields = useMemo(() => {
        const missing: string[] = [];
        if (!dateParts) missing.push("дата рождения");
        if (!timeParts) missing.push("время рождения");
        if (!profile?.birth_city?.trim()) missing.push("место рождения");
        return missing;
    }, [dateParts, timeParts, profile?.birth_city]);

    const canRun = missingFields.length === 0;

    useEffect(() => {
        if (!loading || !activeKind) return;

        setLoadingStep(0);

        const timer = window.setInterval(() => {
            setLoadingStep((prev) => (prev + 1) % loadingLabels[activeKind].length);
        }, 1300);

        return () => window.clearInterval(timer);
    }, [loading, activeKind]);

    useEffect(() => {
        void bootstrap();
    }, []);

    async function bootstrap() {
        setProfileLoading(true);
        setProfileError(null);
        setErr(null);

        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();

            if (userErr || !userData.user) {
                window.location.href = "/login";
                return;
            }

            const uid = userData.user.id;
            setUserId(uid);
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token ?? null;

            const [profileResp, productsResp, accessResp, savedResp, adminResp] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("birth_date, birth_time, birth_city")
                    .eq("id", uid)
                    .maybeSingle(),

                supabase
                    .from("calculation_products")
                    .select("code, title, description, price_rub, is_free, is_active, sort_order")
                    .eq("is_active", true)
                    .order("sort_order", { ascending: true }),

                supabase
                    .from("user_calculation_access")
                    .select("product_code")
                    .eq("user_id", uid),

                supabase
                    .from("saved_calculations")
                    .select("id, kind, target_date, result_text, result_json, input_params, updated_at, pdf_url, pdf_path, file_name")
                    .eq("user_id", uid)
                    .order("updated_at", { ascending: false }),
                token
                    ? fetch("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } }).then((res) => res.json().catch(() => null))
                    : Promise.resolve(null),
            ]);

            console.log("profileResp", profileResp);
            console.log("productsResp", productsResp);
            console.log("accessResp", accessResp);
            console.log("savedResp", savedResp);

            if (profileResp.error) {
                setProfileError(profileResp.error.message);
            } else {
                setProfile((profileResp.data ?? null) as BirthProfile | null);
            }

            if (productsResp.error) {
                setErr(`Не удалось загрузить список расчётов: ${productsResp.error.message}`);
                setProducts([]);
            } else {
                setProducts((productsResp.data ?? []) as ProductRow[]);
            }

            setAdminState({
                isAdmin: !!adminResp?.is_admin,
                isSuper: !!adminResp?.is_super,
            });

            const nextAccess: Record<CalcKind, boolean> = {
                natal: true,
                day: false,
                week: false,
                month: false,
                big_calendar: false,
            };

            const productRows = (productsResp.data ?? []) as ProductRow[];
            for (const p of productRows) {
                if (p.is_free) {
                    nextAccess[p.code] = true;
                }
            }

            if (!accessResp.error) {
                const accessRows = (accessResp.data ?? []) as AccessRow[];
                for (const row of accessRows) {
                    nextAccess[row.product_code] = true;
                }
            }

            if (adminResp?.is_admin) {
                nextAccess.day = true;
                nextAccess.week = true;
                nextAccess.month = true;
                nextAccess.big_calendar = true;
            }

            setAccessMap(nextAccess);

            if (!savedResp.error) {
                const rows = (savedResp.data ?? []) as SavedCalculationRow[];
                const nextSaved: Partial<Record<CalcKind, SavedCalculationRow>> = {};

                for (const row of rows) {
                    if (row.kind === "day") {
                        if (row.target_date === targetDate && !nextSaved.day) {
                            nextSaved.day = row;
                        }
                        continue;
                    }

                    if (!nextSaved[row.kind]) {
                        nextSaved[row.kind] = row;
                    }
                }

                setSavedMap(nextSaved);
            }
        } finally {
            setProfileLoading(false);
        }
    }

    function isPurchased(kind: CalcKind) {
        return adminState.isAdmin || !!accessMap[kind];
    }

    async function loadInterpretation(kind: CalcKind, resultText: string, raw: any) {
        setInterpretation({ loading: true, text: null, error: null, model: "gpt-4.1-mini" });

        try {
            const res = await fetch("/api/astro/interpret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, resultText, raw }),
            });
            const json = await res.json().catch(() => null);

            if (!res.ok) throw new Error(json?.error || "Не удалось получить ИИ-интерпретацию.");

            if (json?.skipped) {
                setInterpretation({
                    loading: false,
                    text: null,
                    error: "ИИ-интерпретация пока не настроена: добавьте OPENAI_API_KEY и при необходимости ASTRO_PROMPT_*. ",
                    model: null,
                });
                return;
            }

            setInterpretation({
                loading: false,
                text: json?.interpretation || null,
                error: json?.interpretation ? null : "ИИ не вернул текст интерпретации.",
                model: json?.model || "gpt-4.1-mini",
            });
        } catch (e: any) {
            setInterpretation({
                loading: false,
                text: null,
                error: e?.message || "Ошибка ИИ-интерпретации.",
                model: null,
            });
        }
    }

    async function callJson(url: string) {
        let res: Response;

        try {
            res = await fetch(url, { method: "GET" });
        } catch {
            throw new Error(
                "Сервис расчётов временно недоступен. Проверьте подключение к API и попробуйте ещё раз."
            );
        }

        const json = await res.json().catch(() => null);

        if (!res.ok) {
            const msg = json?.detail || json?.message || `HTTP ${res.status}`;
            throw new Error(msg);
        }

        return json;
    }

    async function saveCalculation(params: {
        kind: CalcKind;
        resultText: string;
        resultJson: any;
        inputParams: any;
        targetDate?: string | null;
    }) {
        if (!userId) return;

        try {
            if (params.kind === "day") {
                const { data: existing, error: selectError } = await supabase
                    .from("saved_calculations")
                    .select("id")
                    .eq("user_id", userId)
                    .eq("kind", "day")
                    .eq("target_date", params.targetDate ?? null)
                    .maybeSingle();

                if (selectError) {
                    console.error("saveCalculation day selectError:", selectError);
                    setErr(`Ошибка сохранения расчёта: ${selectError.message}`);
                    return;
                }

                if (existing?.id) {
                    const { error: updateError } = await supabase
                        .from("saved_calculations")
                        .update({
                            result_text: params.resultText,
                            result_json: params.resultJson ?? null,
                            input_params: params.inputParams ?? null,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", existing.id);

                    if (updateError) {
                        console.error("saveCalculation day updateError:", updateError);
                        setErr(`Ошибка сохранения расчёта: ${updateError.message}`);
                    }

                    return;
                }

                const { error: insertError } = await supabase
                    .from("saved_calculations")
                    .insert({
                        user_id: userId,
                        kind: "day",
                        target_date: params.targetDate ?? null,
                        result_text: params.resultText,
                        result_json: params.resultJson ?? null,
                        input_params: params.inputParams ?? null,
                    });

                if (insertError) {
                    console.error("saveCalculation day insertError:", insertError);
                    setErr(`Ошибка сохранения расчёта: ${insertError.message}`);
                }

                return;
            }

            const { data: existing, error: selectError } = await supabase
                .from("saved_calculations")
                .select("id")
                .eq("user_id", userId)
                .eq("kind", params.kind)
                .maybeSingle();

            if (selectError) {
                console.error("saveCalculation selectError:", selectError);
                setErr(`Ошибка сохранения расчёта: ${selectError.message}`);
                return;
            }

            if (existing?.id) {
                const { error: updateError } = await supabase
                    .from("saved_calculations")
                    .update({
                        result_text: params.resultText,
                        result_json: params.resultJson ?? null,
                        input_params: params.inputParams ?? null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", existing.id);

                if (updateError) {
                    console.error("saveCalculation updateError:", updateError);
                    setErr(`Ошибка сохранения расчёта: ${updateError.message}`);
                }

                return;
            }

            const { error: insertError } = await supabase
                .from("saved_calculations")
                .insert({
                    user_id: userId,
                    kind: params.kind,
                    target_date: null,
                    result_text: params.resultText,
                    result_json: params.resultJson ?? null,
                    input_params: params.inputParams ?? null,
                });

            if (insertError) {
                console.error("saveCalculation insertError:", insertError);
                setErr(`Ошибка сохранения расчёта: ${insertError.message}`);
            }
        } catch (e: any) {
            console.error("saveCalculation unexpected error:", e);
            setErr(`Ошибка сохранения расчёта: ${e?.message || "Неизвестная ошибка"}`);
        }
    }

    async function runBigCalendar() {
        if (!requireProfile()) return;

        if (!isPurchased("big_calendar")) {
            setErr("Расчёт доступен только после оплаты.");
            return;
        }

        setLoading(true);
        setActiveKind("big_calendar");
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null });

        try {
            if (showSaved("big_calendar")) return;

            const { data: userData, error } = await supabase.auth.getUser();

            if (error || !userData.user) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`${API}/calculations/big-calendar`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-User-Id": userData.user.id,
                },
            });

            const json = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(json?.detail || "Не удалось выполнить расчёт");
            }

            const text = json?.text || "PDF сформирован";

            setResult({
                kind: "big_calendar",
                text,
                raw: json,
            } as any);

            setResultMeta({ source: "fresh", updatedAt: null });
            void loadInterpretation("big_calendar", text, json);

            setSavedMap((prev) => ({
                ...prev,
                big_calendar: {
                    id: "temp-big-calendar",
                    kind: "big_calendar",
                    target_date: null,
                    result_text: text,
                    result_json: json,
                    input_params: null,
                    updated_at: new Date().toISOString(),
                    pdf_url: json?.pdf_url ?? null,
                    pdf_path: json?.pdf_path ?? null,
                    file_name: json?.file_name ?? null,
                },
            }));
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }
    function showSaved(kind: CalcKind) {
        const row = savedMap[kind];
        if (!row) return false;

        setResult({
            kind,
            text: row.result_text,
            raw: {
                ...(row.result_json || {}),
                pdf_url: row.pdf_url ?? null,
                pdf_path: row.pdf_path ?? null,
                file_name: row.file_name ?? null,
            },
        } as ApiResult);

        setResultMeta({
            source: "saved",
            updatedAt: row.updated_at,
        });
        void loadInterpretation(kind, row.result_text, row.result_json);

        return true;
    }

    function requireProfile(): boolean {
        if (profileLoading) return false;

        if (!canRun) {
            setErr(
                `Чтобы открыть расчёты, сначала заполните в профиле: ${missingFields.join(", ")}.`
            );
            return false;
        }

        return true;
    }

    async function runNatal() {
        if (!requireProfile()) return;

        setLoading(true);
        setActiveKind("natal");
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null });

        try {
            if (showSaved("natal")) return;

            const qs = new URLSearchParams({
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                city_name: profile!.birth_city!.trim(),
                hour: timeParts!.hour,
                minute: timeParts!.minute,
            });

            const json = await callJson(`${API}/natal?${qs.toString()}`);
            const text = json?.natal_chart || "Пустой ответ";

            setResult({
                kind: "natal",
                text,
                meta: json,
            });

            setResultMeta({ source: "fresh", updatedAt: null });
            void loadInterpretation("natal", text, json);

            await saveCalculation({
                kind: "natal",
                resultText: text,
                resultJson: json,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                },
            });

            setSavedMap((prev) => ({
                ...prev,
                natal: {
                    id: "temp-natal",
                    kind: "natal",
                    target_date: null,
                    result_text: text,
                    result_json: json,
                    input_params: null,
                    updated_at: new Date().toISOString(),
                },
            }));
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function runDay() {
        if (!requireProfile()) return;

        if (!isPurchased("day")) {
            setErr("Прогноз на день доступен только после оплаты.");
            return;
        }

        setLoading(true);
        setActiveKind("day");
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null });

        try {
            if (showSaved("day")) return;

            const qs = new URLSearchParams({
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: String(parseInt(timeParts!.hour || "12", 10) || 12),
                minute: String(parseInt(timeParts!.minute || "0", 10) || 0),
                city_name: profile!.birth_city!.trim(),
                target_date: targetDate,
            });

            const json = await callJson(`${API}/transits_day?${qs.toString()}`);
            const item = Array.isArray(json) ? json[0] : json;

            const lines: string[] = [];
            if (item?.day_summary) lines.push(item.day_summary);
            if (Array.isArray(item?.aspects_text)) lines.push("", ...item.aspects_text);

            const text = lines.join("\n") || "Пустой ответ";

            setResult({
                kind: "day",
                text,
                raw: json,
            });

            setResultMeta({ source: "fresh", updatedAt: null });
            void loadInterpretation("day", text, json);

            await saveCalculation({
                kind: "day",
                targetDate,
                resultText: text,
                resultJson: json,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                    target_date: targetDate,
                },
            });

            setSavedMap((prev) => ({
                ...prev,
                day: {
                    id: "temp-day",
                    kind: "day",
                    target_date: targetDate,
                    result_text: text,
                    result_json: json,
                    input_params: null,
                    updated_at: new Date().toISOString(),
                },
            }));
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function runWeek() {
        if (!requireProfile()) return;

        if (!isPurchased("week")) {
            setErr("Прогноз на неделю доступен только после оплаты.");
            return;
        }

        setLoading(true);
        setActiveKind("week");
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null });

        try {
            if (showSaved("week")) return;

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

            setResult({
                kind: "week",
                text: text || "Пустой ответ",
                raw: json,
            });

            setResultMeta({ source: "fresh", updatedAt: null });
            void loadInterpretation("week", text || "Пустой ответ", json);

            await saveCalculation({
                kind: "week",
                resultText: text || "Пустой ответ",
                resultJson: json,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                },
            });

            setSavedMap((prev) => ({
                ...prev,
                week: {
                    id: "temp-week",
                    kind: "week",
                    target_date: null,
                    result_text: text || "Пустой ответ",
                    result_json: json,
                    input_params: null,
                    updated_at: new Date().toISOString(),
                },
            }));
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function runMonth() {
        if (!requireProfile()) return;

        if (!isPurchased("month")) {
            setErr("Прогноз на месяц доступен только после оплаты.");
            return;
        }

        setLoading(true);
        setActiveKind("month");
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null });

        try {
            if (showSaved("month")) return;

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
            const text =
                Array.isArray(arr) && arr.length
                    ? arr
                        .slice(0, 200)
                        .map((x: any) => `${x.date} — ${x.description}`)
                        .join("\n")
                    : "Нет точных благоприятных аспектов в ближайшие 30 дней.";

            setResult({
                kind: "month",
                text,
                raw: json,
            });

            setResultMeta({ source: "fresh", updatedAt: null });
            void loadInterpretation("month", text, json);

            await saveCalculation({
                kind: "month",
                resultText: text,
                resultJson: json,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                },
            });

            setSavedMap((prev) => ({
                ...prev,
                month: {
                    id: "temp-month",
                    kind: "month",
                    target_date: null,
                    result_text: text,
                    result_json: json,
                    input_params: null,
                    updated_at: new Date().toISOString(),
                },
            }));
        } catch (e: any) {
            setErr(e?.message || "Ошибка");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function openPayment(kind: "day" | "week" | "month" | "big_calendar") {
        try {
            setErr(null);

            const { data: userData, error } = await supabase.auth.getUser();

            if (error || !userData.user) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`${API}/payments/prodamus/link`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-User-Id": userData.user.id,
                },
                body: JSON.stringify({
                    product_code: kind,
                    customer_email: userData.user.email ?? null,
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(json?.detail || "Не удалось создать ссылку оплаты");
            }

            if (!json?.payment_url) {
                throw new Error("Сервер не вернул ссылку на оплату");
            }

            window.open(json.payment_url, "_blank", "noopener,noreferrer");
        } catch (e: any) {
            setErr(e?.message || "Ошибка оплаты");
        }
    }

    function handleAction(kind: CalcKind) {
        if (kind === "natal") {
            void runNatal();
            return;
        }

        if (kind === "big_calendar") {
            if (!isPurchased(kind)) {
                void openPayment(kind);
                return;
            }
            void runBigCalendar();
            return;
        }

        if (!isPurchased(kind)) {
            void openPayment(kind);
            return;
        }

        if (kind === "day") {
            void runDay();
            return;
        }

        if (kind === "week") {
            void runWeek();
            return;
        }

        if (kind === "month") {
            void runMonth();
            return;
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
                <div style={{ fontSize: 24, fontWeight: 950 }}>Прогнозы</div>
                {adminState.isAdmin && (
                    <div style={{ marginTop: 10, ...tagStyle("rgba(110,170,255,.14)") }}>
                        Режим администратора: все расчёты на этой вкладке доступны бесплатно.
                    </div>
                )}



                {profileLoading && (
                    <div style={{ marginTop: 14, color: "rgba(245,240,233,.75)" }}>
                        Загружаем данные профиля…
                    </div>
                )}

                {!profileLoading && (profileError || missingFields.length > 0) && (
                    <div
                        style={{
                            marginTop: 14,
                            padding: 14,
                            borderRadius: 14,
                            border: "1px solid rgba(255,190,90,.26)",
                            background: "rgba(255,190,90,.08)",
                            color: "rgba(245,240,233,.92)",
                        }}
                    >
                        {profileError
                            ? `Не удалось загрузить профиль: ${profileError}`
                            : `Чтобы открыть расчёты, сначала заполните в профиле: ${missingFields.join(", ")}.`}
                    </div>
                )}

                {!profileLoading && !err && products.length === 0 && (
                    <div
                        style={{
                            marginTop: 14,
                            padding: 14,
                            borderRadius: 14,
                            border: "1px solid rgba(255,190,90,.20)",
                            background: "rgba(255,190,90,.06)",
                            color: "rgba(245,240,233,.86)",
                        }}
                    >
                        Список расчётов пуст. Проверь таблицу <b>calculation_products</b> и поля{" "}
                        <b>is_active = true</b>.
                    </div>
                )}

                <div
                    style={{
                        marginTop: 16,
                        display: "grid",
                        gap: 12,
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    }}
                >
                    {products.map((product) => {
                        const purchased = isPurchased(product.code);
                        const hasSaved =
                            product.code === "day"
                                ? !!savedMap.day && savedMap.day.target_date === targetDate
                                : !!savedMap[product.code];

                        return (
                            <div
                                key={product.code}
                                style={{
                                    padding: 16,
                                    borderRadius: 18,
                                    border: "1px solid rgba(224,197,143,.14)",
                                    background: "rgba(10,18,38,.18)",
                                    display: "grid",
                                    gap: 10,
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ fontWeight: 900, fontSize: 16 }}>{product.title}</div>

                                    <div
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: 999,
                                            fontSize: 12,
                                            fontWeight: 800,
                                            border: "1px solid rgba(224,197,143,.18)",
                                            background: product.is_free
                                                ? "rgba(90,220,150,.12)"
                                                : purchased
                                                    ? "rgba(110,170,255,.14)"
                                                    : "rgba(224,197,143,.10)",
                                            color: "rgba(245,240,233,.92)",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {product.is_free
                                            ? "Бесплатно"
                                            : purchased
                                                ? "Куплено"
                                                : `${product.price_rub} ₽`}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        color: "rgba(245,240,233,.72)",
                                        lineHeight: 1.5,
                                        minHeight: 44,
                                    }}
                                >
                                    {product.description || "Описание скоро будет добавлено"}
                                </div>

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {hasSaved && (
                                        <div style={tagStyle("rgba(90,220,150,.12)")}>Сохранено</div>
                                    )}
                                    {!product.is_free && purchased && (
                                        <div style={tagStyle("rgba(110,170,255,.14)")}>Доступ открыт</div>
                                    )}
                                </div>

                                <button
                                    disabled={!canRun || profileLoading || loading}
                                    onClick={() => handleAction(product.code)}
                                    style={btn()}
                                >
                                    {loading && activeKind === product.code
                                        ? "Выполняется…"
                                        : product.is_free || purchased
                                            ? hasSaved
                                                ? "Открыть результат"
                                                : "Выполнить расчёт"
                                            : `Купить за ${product.price_rub} ₽`}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

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

            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                    minHeight: "42vh",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        marginBottom: 12,
                    }}
                >
                    <div style={{ fontSize: 16, fontWeight: 950 }}>Результат</div>
                    {resultMeta.source && (
                        <div style={tagStyle(resultMeta.source === "saved" ? "rgba(90,220,150,.12)" : "rgba(110,170,255,.14)")}>
                            {resultMeta.source === "saved" ? "Сохранённый результат" : "Свежий расчёт"}
                            {resultMeta.updatedAt ? ` · ${new Date(resultMeta.updatedAt).toLocaleString("ru-RU")}` : ""}
                        </div>
                    )}
                </div>



                {loading && activeKind && (
                    <div
                        style={{
                            padding: 16,
                            borderRadius: 18,
                            border: "1px solid rgba(224,197,143,.12)",
                            background: "rgba(10,18,38,.18)",
                        }}
                    >
                        <div style={{ fontWeight: 900, fontSize: 16 }}>
                            {loadingLabels[activeKind][loadingStep]}
                            <AnimatedDots />
                        </div>
                        <div style={{ marginTop: 8, color: "rgba(245,240,233,.72)" }}>
                            Пожалуйста, подождите. После завершения результат автоматически
                            сохранится в кабинете.
                        </div>
                    </div>
                )}

                {result && !loading && (
                    <div style={{ display: "grid", gap: 12 }}>
                        {result.kind === "natal" ? (
                            <NatalResultView text={result.text} />
                        ) : (
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
                                    lineHeight: 1.6,
                                }}
                            >
                                {result.text}
                            </pre>
                        )}

                        <div
                            style={{
                                padding: 16,
                                borderRadius: 18,
                                border: "1px solid rgba(110,170,255,.18)",
                                background: "linear-gradient(180deg, rgba(74,120,255,.12), rgba(10,18,38,.18))",
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ fontWeight: 900, fontSize: 16 }}>ИИ-интерпретация</div>
                                <div style={tagStyle("rgba(110,170,255,.14)")}>{interpretation.model || "gpt-4.1-mini"}</div>
                            </div>
                            {interpretation.loading && <div style={{ color: "rgba(245,240,233,.78)" }}>Анализируем аспекты и собираем живую интерпретацию…</div>}
                            {!interpretation.loading && interpretation.error && <div style={{ color: "rgba(255,210,160,.9)", lineHeight: 1.6 }}>{interpretation.error}</div>}
                            {!interpretation.loading && interpretation.text && (
                                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "rgba(245,240,233,.94)" }}>{interpretation.text}</div>
                            )}
                        </div>

                        {"raw" in result && result.raw?.pdf_url && (
                            <a
                                href={result.raw.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: "inline-block",
                                    width: "fit-content",
                                    borderRadius: 14,
                                    padding: "11px 13px",
                                    border: "1px solid rgba(224,197,143,.18)",
                                    background: "rgba(224,197,143,.10)",
                                    color: "rgba(245,240,233,.92)",
                                    fontWeight: 950,
                                    textDecoration: "none",
                                }}
                            >
                                Скачать PDF
                            </a>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

function AnimatedDots() {
    const [dots, setDots] = useState(".");

    useEffect(() => {
        const timer = window.setInterval(() => {
            setDots((prev) => {
                if (prev === "...") return ".";
                return prev + ".";
            });
        }, 450);

        return () => window.clearInterval(timer);
    }, []);

    return <span>{dots}</span>;
}

function tagStyle(bg: string): React.CSSProperties {
    return {
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background: bg,
        color: "rgba(245,240,233,.92)",
    };
}

function btn(): React.CSSProperties {
    return {
        borderRadius: 14,
        padding: "11px 13px",
        border: "1px solid rgba(224,197,143,.18)",
        background: "rgba(224,197,143,.10)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: "pointer",
    };
}

function NatalResultView({ text }: { text: string }) {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const header = lines.find((line) => line.startsWith("Натальная карта"));
    const facts = lines.filter((line) => /^(📍|🕒|🗓|🌅|☊|☋)/.test(line));
    const personal = collectLines(lines, "👤 Личные планеты:");
    const social = collectLines(lines, "🏛 Социальные планеты:");
    const higher = collectLines(lines, "✨ Высшие планеты:");

    return (
        <div style={{ display: "grid", gap: 14 }}>
            {header && (
                <div style={{ padding: 18, borderRadius: 18, border: "1px solid rgba(224,197,143,.14)", background: "linear-gradient(180deg, rgba(224,197,143,.10), rgba(10,18,38,.18))", fontSize: 18, fontWeight: 900 }}>
                    {header}
                </div>
            )}
            {!!facts.length && (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    {facts.map((item) => (
                        <div key={item} style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(224,197,143,.12)", background: "rgba(10,18,38,.18)", lineHeight: 1.6 }}>
                            {item}
                        </div>
                    ))}
                </div>
            )}
            <PlanetSection title="Личные планеты" items={personal} />
            <PlanetSection title="Социальные планеты" items={social} />
            <PlanetSection title="Высшие планеты" items={higher} />
        </div>
    );
}

function PlanetSection({ title, items }: { title: string; items: string[] }) {
    if (!items.length) return null;

    return (
        <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(224,197,143,.12)", background: "rgba(10,18,38,.18)", display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                {items.map((item) => (
                    <div key={item} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(224,197,143,.10)", background: "rgba(17,34,80,.16)", lineHeight: 1.6 }}>
                        {item.replace(/^•\s*/, "")}
                    </div>
                ))}
            </div>
        </div>
    );
}

function collectLines(lines: string[], marker: string) {
    const startIndex = lines.indexOf(marker);
    if (startIndex === -1) return [];

    const items: string[] = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^(👤|🏛|✨)/.test(line)) break;
        if (line.startsWith("•")) items.push(line);
    }
    return items;
}
