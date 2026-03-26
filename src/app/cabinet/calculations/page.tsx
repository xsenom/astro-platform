"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    AnimatedDots,
    AstroLoading,
    MarkdownCard,
    NatalResultView,
} from "@/components/cabinet/calculations/display";
import {
    btn,
    cardDescriptionStyle,
    cardTagsRowStyle,
    cardTitleStyle,
    cardTopRowStyle,
    productCardStyle,
    tagStyle,
    topBadgeStyle,
} from "@/components/cabinet/calculations/styles";
import type {
    AccessRow,
    AdminState,
    ApiResult,
    BirthProfile,
    CalcKind,
    InterpretationState,
    ProductRow,
    SavedCalculationRow,
} from "@/components/cabinet/calculations/types";
import {
    extractMarkdownSections,
    formatExpiration,
    getExpirationDate,
    isSavedCalculationActive,
    loadingLabels,
    parseBirthDate,
    parseBirthTime,
    toYMD,
} from "@/components/cabinet/calculations/utils";
import { supabase } from "@/lib/supabase/client";

const URANUS_GEMINI_PRODUCT: ProductRow = {
    code: "uranus_gemini",
    title: "Уран в Близнецах",
    description: "Персональный расчёт периода Урана в Близнецах через backend.",
    price_rub: 3900,
    is_free: false,
    is_active: true,
    sort_order: 999,
};

export default function CalculationsPage() {
    const searchParams = useSearchParams();
    const API =
        process.env.NEXT_PUBLIC_ASTRO_API_BASE?.trim() || "http://127.0.0.1:8011";
    const URANUS_GEMINI_BANNER_PATH = "/banners/uranus-gemini-pdf-banner.jpg";

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
        uranus_gemini: false,
    });

    const [savedMap, setSavedMap] = useState<
        Partial<Record<CalcKind, SavedCalculationRow>>
    >({});

    const [loading, setLoading] = useState(false);
    const [activeKind, setActiveKind] = useState<CalcKind | null>(null);
    const [loadingStep, setLoadingStep] = useState(0);
    const [bigCalendarStatus, setBigCalendarStatus] = useState<string | null>(null);

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
    const autoLaunchCalcRef = useRef<string | null>(null);

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

    function resetResultState() {
        setErr(null);
        setResult(null);
        setResultMeta({ source: null, updatedAt: null, expiresAt: null });
        setInterpretation({
            loading: false,
            text: null,
            error: null,
            model: null,
        });
    }

    function getBigCalendarPdfFileName(
        pdfPayload?: Record<string, unknown> | null,
        fallbackFileName?: string | null
    ) {
        if (
            pdfPayload &&
            typeof pdfPayload.file_name === "string" &&
            pdfPayload.file_name.trim()
        ) {
            return pdfPayload.file_name.trim();
        }

        if (fallbackFileName?.trim()) {
            return fallbackFileName.trim();
        }

        return `БЖК_${profile?.birth_date ?? targetDate}.pdf`;
    }

    async function fetchBigCalendarPdfBlob(pdfPayload: Record<string, unknown>) {
        const renderEndpoint =
            typeof pdfPayload.render_endpoint === "string" &&
            pdfPayload.render_endpoint.trim()
                ? pdfPayload.render_endpoint.trim()
                : "/api/astro/big-calendar/pdf";
        const res = await fetch(renderEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pdfPayload),
        });

        if (!res.ok) {
            const json = await res.json().catch(() => null);
            throw new Error(json?.error || "Не удалось собрать PDF-файл.");
        }

        return await res.blob();
    }

    function forceDownloadBlob(blob: Blob, fileName: string) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 1000);
    }

    function openBlobInNewTab(blob: Blob) {
        const url = window.URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");

        window.setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 60_000);
    }

    async function downloadBigCalendarPdf(pdfPayload: Record<string, unknown>) {
        const blob = await fetchBigCalendarPdfBlob(pdfPayload);
        const fileName = getBigCalendarPdfFileName(pdfPayload, null);
        forceDownloadBlob(blob, fileName);
    }

    async function openBigCalendarPdf(pdfPayload: Record<string, unknown>) {
        const blob = await fetchBigCalendarPdfBlob(pdfPayload);
        openBlobInNewTab(blob);
    }

    async function handleBigCalendarPdfDownload(pdfPayload: Record<string, unknown>) {
        try {
            await downloadBigCalendarPdf(pdfPayload);
        } catch (e: any) {
            setErr(e?.message || "Не удалось скачать PDF-файл.");
        }
    }

    async function handleBigCalendarPdfOpen(pdfPayload: Record<string, unknown>) {
        try {
            await openBigCalendarPdf(pdfPayload);
        } catch (e: any) {
            setErr(e?.message || "Не удалось открыть PDF-файл.");
        }
    }

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

    useEffect(() => {
        const calcCode = searchParams.get("calc");
        if (!calcCode) return;
        if (profileLoading || loading) return;
        if (autoLaunchCalcRef.current === calcCode) return;

        if (calcCode !== "uranus_gemini") return;
        if (!isPurchased("uranus_gemini")) return;

        autoLaunchCalcRef.current = calcCode;
        void runUranusGeminiCalculation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, profileLoading, loading, accessMap.uranus_gemini]);

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
                setProducts([URANUS_GEMINI_PRODUCT]);
            } else {
                const productRows = (productsResp.data ?? []) as ProductRow[];
                const withUranus = productRows.some(
                    (product) => product.code === "uranus_gemini"
                )
                    ? productRows
                    : [...productRows, URANUS_GEMINI_PRODUCT];

                setProducts(withUranus);
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
                uranus_gemini: false,
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
                nextAccess.uranus_gemini = true;
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
        resetResultState();

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
        resetResultState();

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

    async function runTransitCalculation(kind: "day" | "week" | "month") {
        if (!requireProfile()) return;

        setLoading(true);
        setActiveKind(kind);
        resetResultState();

        try {
            const commonQuery = new URLSearchParams({
                year: String(dateParts!.year),
                month: String(dateParts!.month),
                day: String(dateParts!.day),
                hour: timeParts!.hour,
                minute: timeParts!.minute,
                city_name: profile!.birth_city!.trim(),
            });

            let endpoint = "";
            if (kind === "day") {
                commonQuery.set("target_date", targetDate);
                endpoint = "/transits_day";
            } else if (kind === "week") {
                endpoint = "/transits_week_theme";
            } else {
                endpoint = "/transits_month";
            }

            const json = await callJson(`${API}${endpoint}?${commonQuery.toString()}`);

            let text = "Пустой ответ";
            if (kind === "day") {
                const item = Array.isArray(json) ? json[0] : json;
                const lines: string[] = [];
                if (item?.day_summary) lines.push(item.day_summary);
                if (Array.isArray(item?.aspects_text)) lines.push("", ...item.aspects_text);
                text = lines.join("\n").trim() || "Пустой ответ";
            } else if (kind === "week") {
                const arr = json?.weekly_theme_forecast || [];
                text = Array.isArray(arr)
                    ? arr.map((x: { summary_text?: string }) => x.summary_text || "")
                        .filter(Boolean)
                        .join("\n\n")
                    : JSON.stringify(json, null, 2);
            } else {
                const arr = json?.month_transits || [];
                text = Array.isArray(arr) && arr.length
                    ? arr
                        .slice(0, 200)
                        .map((x: { date?: string; description?: string }) =>
                            `${x.date || "дата не указана"} — ${x.description || ""}`
                        )
                        .join("\n")
                    : "Нет точных благоприятных аспектов в ближайшие 30 дней.";
            }

            setResult({
                kind,
                text: text || "Пустой ответ",
                raw: json,
            });
            setResultMeta({
                source: "fresh",
                updatedAt: new Date().toISOString(),
                expiresAt: null,
            });

            const savedRow = await saveCalculation({
                kind,
                resultText: text || "Пустой ответ",
                resultJson: json,
                targetDate: kind === "day" ? targetDate : null,
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                    target_date: kind === "day" ? targetDate : null,
                },
            });

            if (savedRow) {
                setSavedMap((prev) => ({
                    ...prev,
                    [kind]: savedRow,
                }));
            }

            const key = buildInterpretationKey(kind, {
                updated_at: new Date().toISOString(),
                target_date: targetDate,
                result_text: text,
            });

            interpretationRequestRef.current = key;
            void loadInterpretation(kind, text, json, {
                targetDate,
            });
        } catch (e: any) {
            setErr(e?.message || "Ошибка расчёта");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function runUranusGeminiCalculation() {
        if (!requireProfile()) return;

        setLoading(true);
        setActiveKind("uranus_gemini");
        resetResultState();

        try {
            const res = await fetch("/api/astro/uranus-gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    year: dateParts?.year,
                    month: dateParts?.month,
                    day: dateParts?.day,
                    hour: Number.parseInt(timeParts?.hour ?? "12", 10),
                    minute: Number.parseInt(timeParts?.minute ?? "0", 10),
                    city_name: profile?.birth_city ?? "",
                    orb: 1.0,
                    step_hours: 12,
                }),
            });

            const json = (await res.json().catch(() => null)) as
                | {
                ok?: boolean;
                error?: string;
                data?: unknown;
            }
                | null;

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }

            const payloadData = json.data;
            const text =
                typeof payloadData === "string"
                    ? payloadData
                    : typeof payloadData === "object" &&
                        payloadData &&
                        "text" in payloadData &&
                        typeof (payloadData as Record<string, unknown>).text === "string"
                        ? String((payloadData as Record<string, unknown>).text ?? "")
                        : JSON.stringify(payloadData, null, 2);
            const uranusRaw =
                payloadData && typeof payloadData === "object"
                    ? (payloadData as Record<string, unknown>)
                    : {};
            const uranusPdfPayload = {
                template: "uranus_gemini",
                title: "Уран в Близнецах",
                content: text,
                general_p2: text,
                name: "Клиент",
                birth_date: profile?.birth_date ?? targetDate,
                birth_time: profile?.birth_time ?? "12:00",
                banner_url: URANUS_GEMINI_BANNER_PATH,
                file_name: `Уран_в_Близнецах_${profile?.birth_date ?? targetDate}.pdf`,
                render_endpoint: "/api/astro/big-calendar/pdf",
            };

            if (!text) {
                throw new Error("Backend не вернул текст расчёта");
            }

            setResult({
                kind: "uranus_gemini",
                text,
                raw: {
                    ...uranusRaw,
                    pdf_payload: uranusPdfPayload,
                },
            });

            setInterpretation({
                loading: false,
                text,
                error: null,
                model: "backend",
            });

            setResultMeta({
                source: "fresh",
                updatedAt: new Date().toISOString(),
                expiresAt: null,
            });

            const savedRow = await saveCalculation({
                kind: "uranus_gemini",
                resultText: text,
                resultJson: {
                    ...uranusRaw,
                    pdf_payload: uranusPdfPayload,
                },
                inputParams: {
                    birth_date: profile?.birth_date ?? null,
                    birth_time: profile?.birth_time ?? null,
                    birth_city: profile?.birth_city ?? null,
                },
            });

            if (savedRow) {
                setSavedMap((prev) => ({
                    ...prev,
                    uranus_gemini: savedRow,
                }));
            }
        } catch (e: any) {
            setErr(e?.message || "Ошибка расчёта Урана в Близнецах");
        } finally {
            setLoading(false);
            setActiveKind(null);
        }
    }

    async function runBigCalendar(forceFresh = false) {
        if (!requireProfile()) return;

        setLoading(true);
        setActiveKind("big_calendar");
        setBigCalendarStatus("Собираем астроданные…");
        resetResultState();

        try {
            if (!forceFresh && showSaved("big_calendar")) return;

            const payload = {
                birth_date: profile?.birth_date,
                birth_time: profile?.birth_time,
                birth_city: profile?.birth_city,
                months: 3,
            };

            console.log("[runBigCalendar] payload:", payload);

            setBigCalendarStatus("Анализируем благоприятные периоды…");

            const res = await fetch("/api/astro/big-calendar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const rawText = await res.text();
            let json: any = null;

            try {
                json = rawText ? JSON.parse(rawText) : null;
            } catch {
                json = null;
            }

            console.log("[runBigCalendar] status:", res.status);
            console.log("[runBigCalendar] raw response:", rawText);
            console.log("[runBigCalendar] parsed response:", json);

            if (!res.ok) {
                throw new Error(
                    json?.error ||
                    json?.detail ||
                    rawText ||
                    "Не удалось сформировать большой женский календарь."
                );
            }

            setBigCalendarStatus("Готовим персональную интерпретацию…");

            const pdfPayload = {
                ...(json?.pdfPayload || {}),
                file_name: `БЖК_${profile?.birth_date ?? targetDate}.pdf`,
            };

            setResult({
                kind: "big_calendar",
                text: json?.reportText || "Пустой ответ",
                raw: {
                    ...(json?.rawCalendar || {}),
                    pdf_payload: pdfPayload,
                },
            });

            setResultMeta({ source: "fresh", updatedAt: null, expiresAt: null });

            setInterpretation({
                loading: false,
                text: json?.summaryText || null,
                error: null,
                model: json?.model || null,
            });

            setBigCalendarStatus("Сохраняем результат в кабинет…");

            const savedRow = await saveCalculation({
                kind: "big_calendar",
                resultText: json?.reportText || "Пустой ответ",
                resultJson: {
                    ...(json?.rawCalendar || {}),
                    pdf_payload: pdfPayload,
                    summary_text: json?.summaryText || null,
                },
                inputParams: {
                    birth_date: profile?.birth_date,
                    birth_time: profile?.birth_time,
                    birth_city: profile?.birth_city,
                    months: 3,
                },
            });

            const interpretedSavedRow = json?.summaryText
                ? await saveInterpretation({
                    kind: "big_calendar",
                    interpretationText: json.summaryText,
                    interpretationModel: json?.model || null,
                })
                : null;

            const nextSavedRow = interpretedSavedRow || savedRow;

            if (nextSavedRow) {
                setSavedMap((prev) => ({
                    ...prev,
                    big_calendar: nextSavedRow,
                }));
            }
        } catch (e: any) {
            console.error("[runBigCalendar] error:", e);
            setErr(e?.message || "Не удалось сформировать большой женский календарь");
        } finally {
            setLoading(false);
            setActiveKind(null);
            setBigCalendarStatus(null);
        }
    }

    function openBigCalendarSaved() {
        resetResultState();

        const opened = showSaved("big_calendar");
        if (!opened) {
            setErr("Сохранённый большой женский календарь не найден или уже истёк.");
            return;
        }

        window.setTimeout(() => {
            const resultBlock = document.getElementById("calculation-result-block");
            if (resultBlock) {
                resultBlock.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 50);
    }

    async function downloadSavedBigCalendarPdf() {
        const row = getSavedRow("big_calendar");

        if (!row) {
            setErr("Сохранённый PDF для большого женского календаря не найден.");
            return;
        }

        const raw = row.result_json || {};
        const pdfPayload =
            raw?.pdf_payload ||
            (row.pdf_url
                ? null
                : {
                    ...(raw || {}),
                    file_name:
                        row.file_name ||
                        `БЖК_${profile?.birth_date ?? targetDate}.pdf`,
                });

        if (row.pdf_url) {
            const response = await fetch(row.pdf_url);
            if (!response.ok) {
                throw new Error("Не удалось скачать сохранённый PDF-файл.");
            }

            const blob = await response.blob();
            const fileName = getBigCalendarPdfFileName(
                pdfPayload,
                row.file_name || null
            );
            forceDownloadBlob(blob, fileName);
            return;
        }

        if (!pdfPayload) {
            setErr("PDF для большого женского календаря пока недоступен.");
            return;
        }

        await handleBigCalendarPdfDownload(pdfPayload);
    }

    async function openPayment(
        kind: "day" | "week" | "month" | "big_calendar" | "uranus_gemini"
    ) {
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

    async function openSavedBigCalendarPdf() {
        const row = getSavedRow("big_calendar");

        if (!row) {
            setErr("Сохранённый PDF для большого женского календаря не найден.");
            return;
        }

        const raw = row.result_json || {};
        const pdfPayload =
            raw?.pdf_payload ||
            (row.pdf_url
                ? null
                : {
                    ...(raw || {}),
                    file_name:
                        row.file_name ||
                        `БЖК_${profile?.birth_date ?? targetDate}.pdf`,
                });

        if (row.pdf_url) {
            window.open(row.pdf_url, "_blank", "noopener,noreferrer");
            return;
        }

        if (!pdfPayload) {
            setErr("PDF для большого женского календаря пока недоступен.");
            return;
        }

        await handleBigCalendarPdfOpen(pdfPayload);
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

        if (kind === "big_calendar") {
            void runBigCalendar(true);
            return;
        }

        if (kind === "uranus_gemini") {
            void runUranusGeminiCalculation();
            return;
        }

        void runTransitCalculation(kind);
    }

    const showNatalResultBlock =
        (loading && activeKind === "natal") || result?.kind === "natal";

    const regularProducts = products;

    const resultPdfUrl =
        result && "raw" in result ? result.raw?.pdf_url ?? null : null;

    const resultPdfPayload =
        result && "raw" in result ? result.raw?.pdf_payload ?? null : null;

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
                        Список расчётов пуст. Проверь таблицу <b>calculation_products</b> и
                        поле <b>is_active = true</b>.
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
                                                    ? "Сделать расчёт"
                                                    : `Купить за ${product.price_rub} ₽`}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {result && !loading && (
                    <div
                        id="calculation-result-block"
                        style={{ marginTop: 16, display: "grid", gap: 12 }}
                    >
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

                        {"raw" in result && (resultPdfUrl || resultPdfPayload) && (
                            <div
                                style={{
                                    display: "flex",
                                    gap: 10,
                                    flexWrap: "wrap",
                                }}
                            >
                                {resultPdfUrl ? (
                                    <>
                                        <a
                                            href={resultPdfUrl}
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
                                            Открыть PDF
                                        </a>

                                        <button
                                            onClick={() => void downloadSavedBigCalendarPdf()}
                                            style={{
                                                ...btn(),
                                                width: "fit-content",
                                            }}
                                        >
                                            Скачать PDF
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() =>
                                                void handleBigCalendarPdfOpen(resultPdfPayload)
                                            }
                                            style={{
                                                ...btn(),
                                                width: "fit-content",
                                            }}
                                        >
                                            Открыть PDF
                                        </button>

                                        <button
                                            onClick={() =>
                                                void handleBigCalendarPdfDownload(
                                                    resultPdfPayload
                                                )
                                            }
                                            style={{
                                                ...btn(),
                                                width: "fit-content",
                                            }}
                                        >
                                            Скачать PDF
                                        </button>
                                    </>
                                )}
                            </div>
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
                                Пожалуйста, подождите. После завершения результат
                                автоматически сохранится в кабинете.
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
