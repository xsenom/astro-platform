"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
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

    interpretation_text?: string | null;
    interpretation_model?: string | null;
    interpretation_updated_at?: string | null;

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

type MarkdownSection = {
    title: string;
    body: string[];
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

function parseYmdToLocalDate(value: string | null) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map((x) => Number.parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function endOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
}

function getRowAnchorDate(row: SavedCalculationRow) {
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

function getExpirationDate(row: SavedCalculationRow) {
    if (row.kind === "natal") return null;

    const anchor = getRowAnchorDate(row);
    if (!anchor) return null;

    if (row.kind === "day") {
        return endOfDay(anchor);
    }

    if (row.kind === "week") {
        return endOfDay(addDays(anchor, 6));
    }

    if (row.kind === "month") {
        return endOfDay(addDays(anchor, 29));
    }

    if (row.kind === "big_calendar") {
        return endOfDay(addDays(anchor, 60));
    }

    return null;
}

function isSavedCalculationActive(row: SavedCalculationRow, now: Date) {
    if (row.kind === "natal") return true;

    const expiresAt = getExpirationDate(row);
    if (!expiresAt) return false;

    return now.getTime() <= expiresAt.getTime();
}

function formatExpiration(kind: CalcKind) {
    if (kind === "day") return "до 23:59 текущего дня";
    if (kind === "week") return "6 дней после даты прогноза";
    if (kind === "month") return "29 дней после даты прогноза";
    if (kind === "big_calendar") return "60 дней после даты прогноза";
    return "без ограничения";
}

const loadingLabels: Record<CalcKind, string[]> = {
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
};

export default function CalculationsPage() {
    const API =
        process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() || "http://127.0.0.1:8011";

    const [profileLoading, setProfileLoading] = useState(true);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [profile, setProfile] = useState<BirthProfile | null>(null);

    const [userId, setUserId] = useState<string | null>(null);
    const [adminState, setAdminState] = useState<AdminState>({
        isAdmin: false,
        isSuper: false,
    });

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
        expiresAt?: string | null;
    }>({ source: null, updatedAt: null, expiresAt: null });

    const [interpretation, setInterpretation] = useState<InterpretationState>({
        loading: false,
        text: null,
        error: null,
        model: null,
    });

    const interpretationRequestRef = useRef<string | null>(null);

    const [activeNatalInterpretationTitle, setActiveNatalInterpretationTitle] =
        useState<string | null>(null);

    const targetDate = toYMD(new Date());

    const dateParts = useMemo(
        () => parseBirthDate(profile?.birth_date ?? null),
        [profile?.birth_date]
    );

    const timeParts = useMemo(
        () => parseBirthTime(profile?.birth_time ?? null),
        [profile?.birth_time]
    );

    async function saveInterpretation(params: {
        kind: CalcKind;
        interpretationText: string;
        interpretationModel?: string | null;
        targetDate?: string | null;
    }) {
        if (!userId) return null;

        try {
            let query = supabase
                .from("saved_calculations")
                .select("id")
                .eq("user_id", userId)
                .eq("kind", params.kind);

            if (params.kind === "day") {
                query = query.eq("target_date", params.targetDate ?? null);
            }

            const { data: existing, error: selectError } = await query
                .order("updated_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (selectError) {
                console.error("saveInterpretation selectError:", selectError);
                setErr(`Ошибка сохранения интерпретации: ${selectError.message}`);
                return null;
            }

            if (!existing?.id) {
                console.warn(
                    "saveInterpretation: запись не найдена, сначала должен сохраниться расчёт"
                );
                return null;
            }

            const { error: updateError } = await supabase
                .from("saved_calculations")
                .update({
                    interpretation_text: params.interpretationText,
                    interpretation_model: params.interpretationModel ?? null,
                    interpretation_updated_at: new Date().toISOString(),
                })
                .eq("id", existing.id);

            if (updateError) {
                console.error("saveInterpretation updateError:", updateError);
                setErr(`Ошибка сохранения интерпретации: ${updateError.message}`);
                return null;
            }

            return await refreshAndGetSaved(params.kind);
        } catch (e: any) {
            console.error("saveInterpretation unexpected error:", e);
            setErr(
                `Ошибка сохранения интерпретации: ${
                    e?.message || "Неизвестная ошибка"
                }`
            );
            return null;
        }
    }

    const missingFields = useMemo(() => {
        const missing: string[] = [];
        if (!dateParts) missing.push("дата рождения");
        if (!timeParts) missing.push("время рождения");
        if (!profile?.birth_city?.trim()) missing.push("место рождения");
        return missing;
    }, [dateParts, timeParts, profile?.birth_city]);

    const canRun = missingFields.length === 0;

    const natalInterpretationSections = useMemo(
        () =>
            result?.kind === "natal" && interpretation.text
                ? extractMarkdownSections(interpretation.text)
                : [],
        [result?.kind, interpretation.text]
    );

    const activeNatalInterpretationSection =
        natalInterpretationSections.find(
            (section) => section.title === activeNatalInterpretationTitle
        ) ??
        natalInterpretationSections[0] ??
        null;

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

    useEffect(() => {
        setActiveNatalInterpretationTitle(null);
    }, [interpretation.text, result?.kind]);

    function buildSavedMap(rows: SavedCalculationRow[]) {
        const now = new Date();
        const nextSaved: Partial<Record<CalcKind, SavedCalculationRow>> = {};

        for (const row of rows) {
            if (!isSavedCalculationActive(row, now)) {
                continue;
            }

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

        return nextSaved;
    }

    async function loadSavedCalculations(uid: string) {
        const { data, error } = await supabase
            .from("saved_calculations")
            .select(
                "id, kind, target_date, result_text, result_json, input_params, updated_at, interpretation_text, interpretation_model, interpretation_updated_at, pdf_url, pdf_path, file_name"
            )
            .eq("user_id", uid)
            .order("updated_at", { ascending: false });

        if (error) throw new Error(error.message);

        const rows = (data ?? []) as SavedCalculationRow[];
        const nextSaved = buildSavedMap(rows);
        setSavedMap(nextSaved);
        return nextSaved;
    }

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

            const [profileResp, productsResp, accessResp, adminResp, savedResp] =
                await Promise.all([
                    supabase
                        .from("profiles")
                        .select("birth_date, birth_time, birth_city")
                        .eq("id", uid)
                        .maybeSingle(),

                    supabase
                        .from("calculation_products")
                        .select(
                            "code, title, description, price_rub, is_free, is_active, sort_order"
                        )
                        .eq("is_active", true)
                        .order("sort_order", { ascending: true }),

                    supabase
                        .from("user_calculation_access")
                        .select("product_code")
                        .eq("user_id", uid),

                    token
                        ? fetch("/api/admin/me", {
                            headers: { Authorization: `Bearer ${token}` },
                        }).then((res) => res.json().catch(() => null))
                        : Promise.resolve(null),

                    supabase
                        .from("saved_calculations")
                        .select(
                            "id, kind, target_date, result_text, result_json, input_params, updated_at, interpretation_text, interpretation_model, interpretation_updated_at, pdf_url, pdf_path, file_name"

                        )
                        .eq("user_id", uid)
                        .order("updated_at", { ascending: false }),
                ]);

            if (profileResp.error) {
                setProfileError(profileResp.error.message);
            } else {
                setProfile((profileResp.data ?? null) as BirthProfile | null);
            }

            if (productsResp.error) {
                setErr(
                    `Не удалось загрузить список расчётов: ${productsResp.error.message}`
                );
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
                setSavedMap(buildSavedMap(rows));
            }
        } finally {
            setProfileLoading(false);
        }
    }

    function isPurchased(kind: CalcKind) {
        return adminState.isAdmin || !!accessMap[kind];
    }

    function getSavedRow(kind: CalcKind) {
        const row = savedMap[kind];
        if (!row) return null;

        const now = new Date();
        if (!isSavedCalculationActive(row, now)) {
            return null;
        }

        if (kind === "day" && row.target_date !== targetDate) {
            return null;
        }

        return row;
    }

    function buildInterpretationKey(
        kind: CalcKind,
        rowOrData: {
            updated_at?: string | null;
            target_date?: string | null;
            result_text?: string | null;
        }
    ) {
        return [
            kind,
            rowOrData.updated_at ?? "",
            rowOrData.target_date ?? "",
            rowOrData.result_text ?? "",
        ].join("::");
    }

    async function loadInterpretation(
        kind: CalcKind,
        resultText: string,
        raw: any,
        options?: { targetDate?: string | null }
    ) {
        console.log("[loadInterpretation] AI interpretation request", { kind });

        setInterpretation({
            loading: true,
            text: null,
            error: null,
            model: "gpt-4.1-mini",
        });

        try {
            const res = await fetch("/api/astro/interpret", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, resultText, raw }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(
                    json?.error || "Не удалось получить ИИ-интерпретацию."
                );
            }

            if (json?.skipped) {
                setInterpretation({
                    loading: false,
                    text: null,
                    error:
                        "ИИ-интерпретация пока не настроена: добавьте OPENAI_API_KEY и при необходимости ASTRO_PROMPT_*.",
                    model: null,
                });
                return;
            }

            const interpretationText = json?.interpretation || null;
            const interpretationModel = json?.model || "gpt-4.1-mini";

            setInterpretation({
                loading: false,
                text: interpretationText,
                error: interpretationText
                    ? null
                    : "ИИ не вернул текст интерпретации.",
                model: interpretationModel,
            });

            if (interpretationText) {
                const savedRow = await saveInterpretation({
                    kind,
                    interpretationText,
                    interpretationModel,
                    targetDate: options?.targetDate ?? null,
                });

                if (savedRow) {
                    setSavedMap((prev) => ({
                        ...prev,
                        [kind]: savedRow,
                    }));
                }
            }
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

    async function refreshAndGetSaved(kind: CalcKind) {
        if (!userId) return null;

        const map = await loadSavedCalculations(userId);
        const row = map[kind];

        if (!row) return null;
        if (kind === "day" && row.target_date !== targetDate) return null;

        return row;
    }

    async function saveCalculation(params: {
        kind: CalcKind;
        resultText: string;
        resultJson: any;
        inputParams: any;
        targetDate?: string | null;
    }) {
        if (!userId) return null;

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
                    return null;
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
                        return null;
                    }

                    return await refreshAndGetSaved("day");
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
                    return null;
                }

                return await refreshAndGetSaved("day");
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
                return null;
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
                    return null;
                }

                return await refreshAndGetSaved(params.kind);
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
                return null;
            }

            return await refreshAndGetSaved(params.kind);
        } catch (e: any) {
            console.error("saveCalculation unexpected error:", e);
            setErr(
                `Ошибка сохранения расчёта: ${e?.message || "Неизвестная ошибка"}`
            );
            return null;
        }
    }

    function applySavedResult(kind: CalcKind, row: SavedCalculationRow) {
        const expiresAt = getExpirationDate(row);

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
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
        });

        if (row.interpretation_text?.trim()) {
            setInterpretation({
                loading: false,
                text: row.interpretation_text,
                error: null,
                model: row.interpretation_model ?? null,
            });
            return;
        }

        const key = buildInterpretationKey(kind, {
            updated_at: row.updated_at,
            target_date: row.target_date,
            result_text: row.result_text,
        });

        if (interpretationRequestRef.current === key) {
            return;
        }

        interpretationRequestRef.current = key;

        void loadInterpretation(kind, row.result_text, row.result_json, {
            targetDate: row.target_date ?? null,
        });
    }

    function showSaved(kind: CalcKind) {
        const row = getSavedRow(kind);
        if (!row) return false;

        console.log("[showSaved] open from saved_calculations", {
            kind,
            updated_at: row.updated_at,
            target_date: row.target_date,
            expires_at: getExpirationDate(row)?.toISOString() ?? null,
        });

        applySavedResult(kind, row);
        return true;
    }

    async function openPurchasedResult(kind: Exclude<CalcKind, "natal">) {
        setLoading(true);
        setActiveKind(kind);
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null, expiresAt: null });
        setInterpretation({
            loading: false,
            text: null,
            error: null,
            model: null,
        });

        try {
            if (showSaved(kind)) return;

            let currentUserId = userId;
            if (!currentUserId) {
                const { data: userData, error } = await supabase.auth.getUser();
                if (error || !userData.user) {
                    window.location.href = "/login";
                    return;
                }
                currentUserId = userData.user.id;
                setUserId(currentUserId);
            }

            console.log("[openPurchasedResult] try open saved result", { kind });

            const savedQuery = supabase
                .from("saved_calculations")
                .select(
                    "id, kind, target_date, result_text, result_json, input_params, updated_at, interpretation_text, interpretation_model, interpretation_updated_at, pdf_url, pdf_path, file_name"

                )
                .eq("user_id", currentUserId)
                .eq("kind", kind)
                .order("updated_at", { ascending: false })
                .limit(20);

            const { data, error } =
                kind === "day"
                    ? await savedQuery.eq("target_date", targetDate)
                    : await savedQuery;

            if (error) {
                throw new Error(error.message);
            }

            const rows = (data ?? []) as SavedCalculationRow[];
            const activeRow = rows.find((row) =>
                isSavedCalculationActive(row, new Date())
            );

            if (!activeRow) {
                throw new Error(
                    `Сохранённый результат для "${kind}" уже истёк или ещё не создан. Для этого типа срок хранения: ${formatExpiration(
                        kind
                    )}.`
                );
            }

            setSavedMap((prev) => ({ ...prev, [kind]: activeRow }));
            applySavedResult(kind, activeRow);
        } catch (e: any) {
            setErr(e?.message || "Не удалось открыть сохранённый результат");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
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
        setResultMeta({ source: null, updatedAt: null, expiresAt: null });
        setInterpretation({
            loading: false,
            text: null,
            error: null,
            model: null,
        });

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

            setResultMeta({ source: "fresh", updatedAt: null, expiresAt: null });

            const savedRow = await saveCalculation({
                kind: "natal",
                resultText: text,
                resultJson: json,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                },
            });

            if (savedRow) {
                setSavedMap((prev) => ({
                    ...prev,
                    natal: savedRow,
                }));
            }

            const key = buildInterpretationKey("natal", {
                updated_at: new Date().toISOString(),
                target_date: null,
                result_text: text,
            });

            interpretationRequestRef.current = key;

            void loadInterpretation("natal", text, json, {
                targetDate: null,
            });
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

        if (!isPurchased(kind)) {
            void openPayment(kind);
            return;
        }

        void openPurchasedResult(kind);
    }

    const showNatalResultBlock =
        (loading && activeKind === "natal") || result?.kind === "natal";

    const regularProducts = products.filter((p) => p.code !== "big_calendar");
    const bigCalendarProduct = products.find((p) => p.code === "big_calendar") ?? null;

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
                        Список расчётов пуст. Проверь таблицу <b>calculation_products</b> и поле <b>is_active = true</b>.
                    </div>
                )}

                {regularProducts.length > 0 && (
                    <div
                        style={{
                            marginTop: 16,
                            display: "grid",
                            gap: 12,
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                            alignItems: "stretch",
                        }}
                    >
                        {regularProducts.map((product) => {
                            const purchased = isPurchased(product.code);
                            const hasSaved =
                                product.code === "day"
                                    ? !!savedMap.day && savedMap.day.target_date === targetDate
                                    : !!savedMap[product.code];

                            return (
                                <div key={product.code} style={productCardStyle()}>
                                    <div style={cardTopRowStyle}>
                                        <div style={cardTitleStyle}>{product.title}</div>

                                        <div
                                            style={topBadgeStyle(
                                                product.is_free
                                                    ? "free"
                                                    : purchased
                                                        ? "bought"
                                                        : "price"
                                            )}
                                        >
                                            {product.is_free
                                                ? "Бесплатно"
                                                : purchased
                                                    ? "Куплено"
                                                    : `${product.price_rub} ₽`}
                                        </div>
                                    </div>

                                    <div style={cardDescriptionStyle}>
                                        {product.description ||
                                            "Описание скоро будет добавлено"}
                                    </div>

                                    <div style={cardTagsRowStyle}>
                                        {hasSaved && (
                                            <div style={tagStyle("rgba(90,220,150,.12)")}>
                                                Сохранено
                                            </div>
                                        )}
                                        {!product.is_free && purchased && (
                                            <div style={tagStyle("rgba(110,170,255,.14)")}>
                                                Доступ открыт
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        disabled={!canRun || profileLoading || loading}
                                        onClick={() => handleAction(product.code)}
                                        style={{ ...btn(), width: "100%", marginTop: "auto" }}
                                    >
                                        {loading && activeKind === product.code
                                            ? purchased && !product.is_free
                                                ? "Открываем…"
                                                : "Выполняется…"
                                            : product.is_free
                                                ? hasSaved
                                                    ? "Открыть результат"
                                                    : "Выполнить расчёт"
                                                : purchased
                                                    ? "Открыть результат"
                                                    : `Купить за ${product.price_rub} ₽`}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {bigCalendarProduct && (
                    <div
                        style={{
                            marginTop: 12,
                            display: "flex",
                            justifyContent: "center",
                        }}
                    >
                        {(() => {
                            const product = bigCalendarProduct;
                            const purchased = isPurchased(product.code);
                            const hasSaved = !!savedMap[product.code];

                            return (
                                <div
                                    style={{
                                        ...bigCalendarCardStyle,
                                        width: "100%",
                                        maxWidth: 680,
                                    }}
                                >
                                    <div style={bigCalendarTopRowStyle}>
                                        <div style={bigCalendarTitleStyle}>
                                            {product.title}
                                        </div>

                                        <div
                                            style={topBadgeStyle(
                                                product.is_free
                                                    ? "free"
                                                    : purchased
                                                        ? "bought"
                                                        : "price"
                                            )}
                                        >
                                            {product.is_free
                                                ? "Бесплатно"
                                                : purchased
                                                    ? "Куплено"
                                                    : `${product.price_rub} ₽`}
                                        </div>
                                    </div>

                                    <div style={bigCalendarDescriptionStyle}>
                                        {product.description ||
                                            "Описание скоро будет добавлено"}
                                    </div>

                                    <div style={bigCalendarTagsRowStyle}>
                                        {hasSaved && (
                                            <div style={tagStyle("rgba(90,220,150,.12)")}>
                                                Сохранено
                                            </div>
                                        )}
                                        {!product.is_free && purchased && (
                                            <div style={tagStyle("rgba(110,170,255,.14)")}>
                                                Доступ открыт
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        disabled={!canRun || profileLoading || loading}
                                        onClick={() => handleAction(product.code)}
                                        style={{
                                            ...btn(),
                                            minWidth: 240,
                                            alignSelf: "center",
                                            marginTop: "auto",
                                        }}
                                    >
                                        {loading && activeKind === product.code
                                            ? purchased && !product.is_free
                                                ? "Открываем…"
                                                : "Выполняется…"
                                            : product.is_free
                                                ? hasSaved
                                                    ? "Открыть результат"
                                                    : "Выполнить расчёт"
                                                : purchased
                                                    ? "Открыть результат"
                                                    : `Купить за ${product.price_rub} ₽`}
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}



                {result && !loading && (
                    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>

                        {result.kind === "natal" &&
                            !!natalInterpretationSections.length && (
                                <div
                                    style={{
                                        padding: 12,
                                        borderRadius: 18,
                                        border: "1px solid rgba(224,197,143,.14)",
                                        background: "rgba(17,34,80,.16)",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "grid",
                                            gap: 8,
                                            gridTemplateColumns:
                                                "repeat(auto-fit, minmax(220px, 1fr))",
                                        }}
                                    >
                                        {natalInterpretationSections.map((section) => {
                                            const active =
                                                section.title ===
                                                (activeNatalInterpretationSection?.title ?? null);

                                            return (
                                                <button
                                                    key={section.title}
                                                    onClick={() =>
                                                        setActiveNatalInterpretationTitle(
                                                            section.title
                                                        )
                                                    }
                                                    style={{
                                                        textAlign: "left",
                                                        borderRadius: 16,
                                                        padding: "14px 16px",
                                                        border: active
                                                            ? "1px solid rgba(214,244,157,.38)"
                                                            : "1px solid rgba(214,244,157,.18)",
                                                        background: active
                                                            ? "linear-gradient(180deg, rgba(174,210,113,.28), rgba(124,159,75,.34))"
                                                            : "linear-gradient(180deg, rgba(174,210,113,.18), rgba(124,159,75,.24))",
                                                        color: "rgba(255,255,255,.96)",
                                                        fontWeight: 900,
                                                        cursor: "pointer",
                                                        lineHeight: 1.4,
                                                        boxShadow: active
                                                            ? "0 10px 30px rgba(109, 141, 56, .22)"
                                                            : "none",
                                                    }}
                                                >
                                                    {section.title}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                        <div
                            style={{
                                padding: 16,
                                borderRadius: 18,
                                border: "1px solid rgba(110,170,255,.18)",
                                background:
                                    "linear-gradient(180deg, rgba(74,120,255,.12), rgba(10,18,38,.18))",
                                display: "grid",
                                gap: 10,
                            }}
                        >
                            {interpretation.loading && <AstroLoading />}

                            {!interpretation.loading && interpretation.error && (
                                <div
                                    style={{
                                        color: "rgba(255,210,160,.9)",
                                        lineHeight: 1.6,
                                    }}
                                >
                                    {interpretation.error}
                                </div>
                            )}

                            {!interpretation.loading &&
                                interpretation.text &&
                                (result.kind === "natal" ? (
                                    <MarkdownCard
                                        text={
                                            activeNatalInterpretationSection?.body
                                                .join("\n")
                                                .trim() || interpretation.text
                                        }
                                    />
                                ) : (
                                    <MarkdownCard text={interpretation.text} />
                                ))}
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

            {showNatalResultBlock && (
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
                        <div style={{ fontSize: 16, fontWeight: 950 }}>
                            Натальная карта
                        </div>
                    </div>

                    {loading && activeKind === "natal" && (
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
                            <div
                                style={{
                                    marginTop: 8,
                                    color: "rgba(245,240,233,.72)",
                                }}
                            >
                                Пожалуйста, подождите. После завершения результат автоматически сохранится в кабинете.
                            </div>
                        </div>
                    )}

                    {result?.kind === "natal" && !loading && (
                        <div style={{ display: "grid", gap: 12 }}>
                            <NatalResultView text={result.text} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const cardTopRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "start",
};

const cardTitleStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    lineHeight: 1.25,
    minHeight: 40,
};

const cardDescriptionStyle: CSSProperties = {
    color: "rgba(245,240,233,.72)",
    lineHeight: 1.5,
    minHeight: 72,
};

const cardTagsRowStyle: CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    minHeight: 36,
    marginBottom: 12,
};

function productCardStyle(): CSSProperties {
    return {
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(224,197,143,.14)",
        background: "rgba(10,18,38,.18)",
        display: "flex",
        flexDirection: "column",
        minHeight: 266,
    };
}

const bigCalendarCardStyle: CSSProperties = {
    padding: 20,
    borderRadius: 20,
    border: "1px solid rgba(224,197,143,.18)",
    background: "linear-gradient(180deg, rgba(20,35,75,.26), rgba(10,18,38,.22))",
    display: "flex",
    flexDirection: "column",
    minHeight: 244,
};

const bigCalendarTopRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "start",
};

const bigCalendarTitleStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: 18,
    lineHeight: 1.25,
    textAlign: "center",
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 44,
};

const bigCalendarDescriptionStyle: CSSProperties = {
    color: "rgba(245,240,233,.72)",
    lineHeight: 1.5,
    minHeight: 62,
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const bigCalendarTagsRowStyle: CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    marginBottom: 12,
};

function topBadgeStyle(mode: "free" | "bought" | "price"): CSSProperties {
    const background =
        mode === "free"
            ? "rgba(90,220,150,.12)"
            : mode === "bought"
                ? "rgba(110,170,255,.14)"
                : "rgba(224,197,143,.10)";

    return {
        minWidth: 114,
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background,
        color: "rgba(245,240,233,.92)",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1,
        flexShrink: 0,
    };
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

function AstroLoading() {
    const phrases = useMemo(
        () => [
            "Сопоставляем положения планет и раскрываем главные смыслы…",
            "Считываем взаимосвязи планет и выделяем главное…",
            "Изучаем астрологические акценты и формируем ваш разбор…",
            "Соединяем положения планет в цельную картину…",
            "Выделяем сильные акценты карты и ключевые тенденции…",
            "Анализируем небесные влияния и собираем персональный разбор…",
            "Рассматриваем аспекты планет и ищем важные подсказки…",
            "Выявляем ведущие темы периода и основные энергии…",
            "Собираем ключевые астрологические акценты вашего прогноза…",
            "Определяем, какие влияния сейчас выходят на первый план…",
        ],
        []
    );

    const [phraseIndex, setPhraseIndex] = useState(() =>
        Math.floor(Math.random() * phrases.length)
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            setPhraseIndex((prev) => {
                if (phrases.length <= 1) return prev;

                let next = prev;
                while (next === prev) {
                    next = Math.floor(Math.random() * phrases.length);
                }
                return next;
            });
        }, 3000);

        return () => window.clearInterval(timer);
    }, [phrases]);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                color: "rgba(245,240,233,.88)",
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: 54,
                    height: 54,
                    flex: "0 0 54px",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: "1px solid rgba(224,197,143,.22)",
                        animation: "astroOrbit 5.5s linear infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        inset: 8,
                        borderRadius: "50%",
                        border: "1px solid rgba(110,170,255,.22)",
                        animation: "astroOrbitReverse 4.2s linear infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: 10,
                        height: 10,
                        marginLeft: -5,
                        marginTop: -5,
                        borderRadius: "50%",
                        background: "rgba(224,197,143,.95)",
                        boxShadow: "0 0 16px rgba(224,197,143,.45)",
                        animation: "astroPulse 1.8s ease-in-out infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: 1,
                        width: 6,
                        height: 6,
                        marginLeft: -3,
                        borderRadius: "50%",
                        background: "rgba(214,244,157,.95)",
                        boxShadow: "0 0 10px rgba(214,244,157,.35)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        right: 7,
                        top: "50%",
                        width: 5,
                        height: 5,
                        marginTop: -2.5,
                        borderRadius: "50%",
                        background: "rgba(110,170,255,.95)",
                        boxShadow: "0 0 10px rgba(110,170,255,.35)",
                    }}
                />
            </div>

            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 900 }}>Анализируем аспекты</div>
                <div
                    key={phraseIndex}
                    style={{
                        color: "rgba(245,240,233,.62)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        animation: "astroFade 0.45s ease",
                    }}
                >
                    {phrases[phraseIndex]}
                </div>
            </div>

            <style jsx>{`
                @keyframes astroOrbit {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                @keyframes astroOrbitReverse {
                    from {
                        transform: rotate(360deg);
                    }
                    to {
                        transform: rotate(0deg);
                    }
                }

                @keyframes astroPulse {
                    0%,
                    100% {
                        transform: scale(0.9);
                        opacity: 0.85;
                    }
                    50% {
                        transform: scale(1.18);
                        opacity: 1;
                    }
                }

                @keyframes astroFade {
                    from {
                        opacity: 0;
                        transform: translateY(4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

function tagStyle(bg: string): CSSProperties {
    return {
        minWidth: 116,
        height: 28,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background: bg,
        color: "rgba(245,240,233,.92)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1,
        whiteSpace: "nowrap",
    };
}

function btn(): CSSProperties {
    return {
        borderRadius: 14,
        padding: "13px 16px",
        border: "1px solid rgba(224,197,143,.18)",
        background: "rgba(224,197,143,.10)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: "pointer",
        textAlign: "center",
    };
}

function NatalResultView({ text }: { text: string }) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const facts = lines.filter((line) => /^(🌅|☊|☋)/.test(line));
    const personal = collectLines(lines, "👤 Личные планеты:");
    const social = collectLines(lines, "🏛 Социальные планеты:");
    const higher = collectLines(lines, "✨ Высшие планеты:");

    return (
        <div style={{ display: "grid", gap: 14 }}>
            {!!facts.length && (
                <div
                    style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    }}
                >
                    {facts.map((item) => (
                        <div
                            key={item}
                            style={{
                                padding: 14,
                                borderRadius: 16,
                                border: "1px solid rgba(224,197,143,.12)",
                                background: "rgba(10,18,38,.18)",
                                lineHeight: 1.6,
                            }}
                        >
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
        <div
            style={{
                padding: 16,
                borderRadius: 18,
                border: "1px solid rgba(224,197,143,.12)",
                background: "rgba(10,18,38,.18)",
                display: "grid",
                gap: 10,
            }}
        >
            <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
            <div
                style={{
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                }}
            >
                {items.map((item) => (
                    <div
                        key={item}
                        style={{
                            padding: 12,
                            borderRadius: 14,
                            border: "1px solid rgba(224,197,143,.10)",
                            background: "rgba(17,34,80,.16)",
                            lineHeight: 1.6,
                        }}
                    >
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

function MarkdownCard({ text }: { text: string }) {
    const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

    return (
        <div style={{ display: "grid", gap: 12, color: "rgba(245,240,233,.94)" }}>
            {blocks.map((block, index) => {
                if (block.type === "heading") {
                    return (
                        <div
                            key={`${block.type}-${index}`}
                            style={{ fontWeight: 900, fontSize: 18 }}
                        >
                            {renderInlineMarkdown(block.text)}
                        </div>
                    );
                }

                if (block.type === "ordered") {
                    return (
                        <ol
                            key={`${block.type}-${index}`}
                            style={{
                                margin: 0,
                                paddingLeft: 22,
                                display: "grid",
                                gap: 10,
                                lineHeight: 1.75,
                            }}
                        >
                            {block.items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`}>
                                    {renderInlineMarkdown(item)}
                                </li>
                            ))}
                        </ol>
                    );
                }

                if (block.type === "unordered") {
                    return (
                        <ul
                            key={`${block.type}-${index}`}
                            style={{
                                margin: 0,
                                paddingLeft: 20,
                                display: "grid",
                                gap: 8,
                                lineHeight: 1.7,
                            }}
                        >
                            {block.items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`}>
                                    {renderInlineMarkdown(item)}
                                </li>
                            ))}
                        </ul>
                    );
                }

                return (
                    <p
                        key={`${block.type}-${index}`}
                        style={{ margin: 0, lineHeight: 1.75 }}
                    >
                        {renderInlineMarkdown(block.text)}
                    </p>
                );
            })}
        </div>
    );
}

function renderInlineMarkdown(text: string) {
    const normalized = text.replace(/\*\*\*/g, "**").replace(/###\s*/g, "");
    const parts = normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function extractMarkdownSections(text: string): MarkdownSection[] {
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

function parseMarkdownBlocks(text: string) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const blocks: Array<
        | { type: "heading"; text: string }
        | { type: "paragraph"; text: string }
        | { type: "ordered"; items: string[] }
        | { type: "unordered"; items: string[] }
    > = [];

    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (/^#{1,3}\s+/.test(line)) {
            blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s+/, "") });
            index += 1;
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\d+\.\s+/, ""));
                index += 1;
            }
            blocks.push({ type: "ordered", items });
            continue;
        }

        if (/^[-•]\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^[-•]\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^[-•]\s+/, ""));
                index += 1;
            }
            blocks.push({ type: "unordered", items });
            continue;
        }

        const paragraphLines: string[] = [];
        while (
            index < lines.length &&
            !/^#{1,3}\s+/.test(lines[index]) &&
            !/^\d+\.\s+/.test(lines[index]) &&
            !/^[-•]\s+/.test(lines[index])
            ) {
            paragraphLines.push(lines[index]);
            index += 1;
        }

        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }

    return blocks;
}