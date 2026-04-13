"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCabinetLoading } from "@/components/cabinet/cabinetLoading";

type SexOption = "female" | "male";
type GoalOption = "lose" | "maintain" | "gain";
type ActivityOption = "low" | "medium" | "high";

type BjuApiResponse = {
    calories?: number | string | null;
    kcal?: number | string | null;
    protein?: number | string | null;
    proteins?: number | string | null;
    fat?: number | string | null;
    fats?: number | string | null;
    carb?: number | string | null;
    carbs?: number | string | null;
    carbohydrates?: number | string | null;
    water?: number | string | null;
    bmi?: number | string | null;
    meta?: Record<string, unknown> | null;
};

type BjuResult = {
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
    water: number | null;
    bmi: number | null;
    raw: BjuApiResponse | null;
};

type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
    free_profile_update_used?: boolean | null;
};

function toHHMM(v: string | null) {
    if (!v) return "";
    return v.slice(0, 5);
}

async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

function getAgeFromBirthDate(value: string) {
    if (!value) return null;
    const birth = new Date(`${value}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;

    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const hasBirthdayPassed =
        now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());

    if (!hasBirthdayPassed) age -= 1;
    return age > 0 ? age : null;
}

function toNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const normalized = value.replace(",", ".").trim();
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function pickFirstNumber(...values: unknown[]) {
    for (const value of values) {
        const parsed = toNumber(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function normalizeBjuResponse(payload: BjuApiResponse | null): BjuResult {
    return {
        calories: pickFirstNumber(payload?.calories, payload?.kcal),
        protein: pickFirstNumber(payload?.protein, payload?.proteins),
        fat: pickFirstNumber(payload?.fat, payload?.fats),
        carbs: pickFirstNumber(payload?.carb, payload?.carbs, payload?.carbohydrates),
        water: pickFirstNumber(payload?.water),
        bmi: pickFirstNumber(payload?.bmi),
        raw: payload,
    };
}

function getBjuEndpoint() {
    const directUrl = process.env.NEXT_PUBLIC_BJU_API_URL?.trim();
    if (directUrl) return directUrl;

    const baseUrl = process.env.NEXT_PUBLIC_BJU_API_BASE?.trim();
    if (!baseUrl) return null;

    return `${baseUrl.replace(/\/$/, "")}/bju/calculate`;
}

function isProfileFilled(p: ProfileRow | null) {
    if (!p) return false;
    return Boolean(p.full_name || p.birth_date || p.birth_time || p.birth_city);
}

export default function ProfileDataPage() {
    const { startLoading } = useCabinetLoading();

    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const [isAdmin, setIsAdmin] = useState(false);
    const [profile, setProfile] = useState<ProfileRow | null>(null);

    const [fullName, setFullName] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");
    const [saving, setSaving] = useState(false);

    const [bjuSex, setBjuSex] = useState<SexOption>("female");
    const [bjuHeight, setBjuHeight] = useState("170");
    const [bjuWeight, setBjuWeight] = useState("");
    const [bjuAge, setBjuAge] = useState("");
    const [bjuGoal, setBjuGoal] = useState<GoalOption>("maintain");
    const [bjuActivity, setBjuActivity] = useState<ActivityOption>("medium");
    const [bjuLoading, setBjuLoading] = useState(false);
    const [bjuError, setBjuError] = useState<string | null>(null);
    const [bjuResult, setBjuResult] = useState<BjuResult | null>(null);

    const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
    const [citySuggestionsOpen, setCitySuggestionsOpen] = useState(false);
    const [citySuggestionsLoading, setCitySuggestionsLoading] = useState(false);
    const citySuggestAbortRef = useRef<AbortController | null>(null);

    const [canEdit, setCanEdit] = useState(true);
    const [needPay, setNeedPay] = useState(false);
    const [usableOrderId, setUsableOrderId] = useState<string | null>(null);

    const filled = useMemo(() => isProfileFilled(profile), [profile]);
    const bjuEndpoint = useMemo(() => getBjuEndpoint(), []);

    const effectiveCanEdit = isAdmin || canEdit;
    const effectiveNeedPay = !isAdmin && needPay;

    async function getUsablePaidOrder(kind: "profile_update" | "add_person") {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return null;

        const { data } = await supabase
            .from("orders")
            .select("id")
            .eq("user_id", user.id)
            .eq("kind", kind)
            .is("consumed_at", null)
            .or("status.eq.paid,paid_at.not.is.null")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        return (data as { id?: string } | null)?.id ?? null;
    }

    async function refreshAccess(prof: ProfileRow | null) {
        const isFilled = isProfileFilled(prof);

        if (!isFilled) {
            setCanEdit(true);
            setNeedPay(false);
            setUsableOrderId(null);
            return;
        }

        const freeUsed = Boolean(prof?.free_profile_update_used);
        if (!freeUsed) {
            setCanEdit(true);
            setNeedPay(false);
            setUsableOrderId(null);
            return;
        }

        const orderId = await getUsablePaidOrder("profile_update");
        if (orderId) {
            setCanEdit(true);
            setNeedPay(false);
            setUsableOrderId(orderId);
        } else {
            setCanEdit(false);
            setNeedPay(true);
            setUsableOrderId(null);
        }
    }

    async function loadAdminFlag() {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const res = await fetch("/api/admin/me", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const json = await res.json().catch(() => null);
            setIsAdmin(Boolean(res.ok && json?.ok));
        } catch {
            setIsAdmin(false);
        }
    }

    async function load() {
        const doneLoading = startLoading({ message: "Загружаем данные профиля" });
        setLoading(true);
        setErr(null);

        try {
            const { data: userData, error: userErr } = await supabase.auth.getUser();
            if (userErr || !userData.user) {
                window.location.href = "/login";
                return;
            }

            const user = userData.user;
            setUserEmail(user.email ?? "");

            const { data: prof, error: profErr } = await supabase
                .from("profiles")
                .select("id, email, full_name, birth_date, birth_time, birth_city, free_profile_update_used")
                .eq("id", user.id)
                .maybeSingle();

            if (profErr) {
                setErr(profErr.message);
                return;
            }

            const p = (prof ?? null) as ProfileRow | null;
            setProfile(p);

            if (p) {
                setFullName(p.full_name ?? "");
                setBirthDate(p.birth_date ?? "");
                setBirthTime(toHHMM(p.birth_time));
                setBirthCity(p.birth_city ?? "");
                setBjuAge(String(getAgeFromBirthDate(p.birth_date ?? "") ?? ""));
            }

            await refreshAccess(p);
        } finally {
            setLoading(false);
            doneLoading();
        }
    }

    useEffect(() => {
        void loadAdminFlag();
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createPendingGCOrder(kind: "profile_update" | "add_person") {
        setErr(null);
        const doneLoading = startLoading({ message: "Подготавливаем оплату профиля" });

        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) {
                window.location.href = "/login";
                return null;
            }

            const { data, error } = await supabase
                .from("orders")
                .insert({
                    user_id: user.id,
                    status: "pending",
                    amount_cents: 49000,
                    currency: "RUB",
                    customer_email: user.email ?? null,
                    provider: "getcourse",
                    provider_order_id: null,
                    paid_at: null,
                    kind,
                    meta: { purpose: kind },
                    consumed_at: null,
                    updated_at: new Date().toISOString(),
                })
                .select("id")
                .single();

            if (error) {
                setErr(error.message);
                return null;
            }

            return (data as { id?: string } | null)?.id ?? null;
        } finally {
            doneLoading();
        }
    }

    function getGetCoursePayUrl(params: { localOrderId: string; kind: "profile_update" | "add_person" }) {
        const base =
            params.kind === "profile_update"
                ? process.env.NEXT_PUBLIC_GC_PROFILE_UPDATE_URL
                : process.env.NEXT_PUBLIC_GC_ADD_PERSON_URL;

        if (!base) return "";

        const u = new URL(base);
        if (userEmail) u.searchParams.set("email", userEmail);
        u.searchParams.set("local_order_id", params.localOrderId);
        u.searchParams.set("kind", params.kind);
        return u.toString();
    }

    async function saveProfile() {
        setSaving(true);
        setErr(null);
        const doneLoading = startLoading({ message: "Сохраняем данные профиля" });

        try {
            if (!effectiveCanEdit) {
                setErr("Бесплатное изменение использовано. Для следующего изменения нужна оплата 490 ₽.");
                return;
            }

            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) {
                window.location.href = "/login";
                return;
            }

            const wasFilled = isProfileFilled(profile);
            const freeUsed = Boolean(profile?.free_profile_update_used);

            const payload: Record<string, unknown> = {
                id: user.id,
                email: user.email ?? null,
                full_name: fullName.trim() || null,
                birth_date: birthDate || null,
                birth_time: birthTime ? `${birthTime}:00` : null,
                birth_city: birthCity.trim() || null,
                updated_at: new Date().toISOString(),
            };

            if (wasFilled && !freeUsed && !usableOrderId && !isAdmin) {
                payload.free_profile_update_used = true;
            }

            const { error } = await supabase.from("profiles").upsert(payload);
            if (error) {
                setErr(error.message);
                return;
            }

            if (usableOrderId && !isAdmin) {
                const { error: consumeError } = await supabase
                    .from("orders")
                    .update({
                        consumed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", usableOrderId);

                if (consumeError) {
                    setErr("Профиль сохранён, но не удалось погасить оплату. Напиши мне — поправим политику/права.");
                }
            }

            await load();
        } finally {
            setSaving(false);
            doneLoading();
        }
    }

    async function fetchCitySuggestions(query: string) {
        const q = query.trim();

        if (q.length < 2) {
            setCitySuggestions([]);
            setCitySuggestionsOpen(false);
            return;
        }

        citySuggestAbortRef.current?.abort();
        const controller = new AbortController();
        citySuggestAbortRef.current = controller;

        setCitySuggestionsLoading(true);

        try {
            const url = new URL("/api/cities/search", window.location.origin);
            url.searchParams.set("q", q);

            const res = await fetch(url.toString(), {
                method: "GET",
                signal: controller.signal,
                cache: "no-store",
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || `HTTP ${res.status}`);
            }

            const items = Array.isArray(json?.cities)
                ? json.cities.map((item: unknown) => String(item || "").trim()).filter(Boolean)
                : [];

            setCitySuggestions(items.slice(0, 8));
            setCitySuggestionsOpen(items.length > 0);
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return;
            setCitySuggestions([]);
            setCitySuggestionsOpen(false);
        } finally {
            setCitySuggestionsLoading(false);
        }
    }

    async function calculateBju() {
        setBjuLoading(true);
        setBjuError(null);

        try {
            if (!bjuEndpoint) {
                throw new Error("Не задан NEXT_PUBLIC_BJU_API_URL или NEXT_PUBLIC_BJU_API_BASE.");
            }

            const age = Number.parseInt(bjuAge, 10);
            const height = Number.parseFloat(bjuHeight.replace(",", "."));
            const weight = Number.parseFloat(bjuWeight.replace(",", "."));

            if (!Number.isFinite(age) || age <= 0) {
                throw new Error("Укажи корректный возраст.");
            }
            if (!Number.isFinite(height) || height <= 0) {
                throw new Error("Укажи корректный рост в сантиметрах.");
            }
            if (!Number.isFinite(weight) || weight <= 0) {
                throw new Error("Укажи корректный вес в килограммах.");
            }

            const payload = {
                sex: bjuSex,
                gender: bjuSex,
                age,
                height,
                height_cm: height,
                weight,
                weight_kg: weight,
                goal: bjuGoal,
                target: bjuGoal,
                activity: bjuActivity,
                activity_level: bjuActivity,
            };

            const res = await fetch(bjuEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const json = (await res.json().catch(() => null)) as BjuApiResponse | null;

            if (!res.ok) {
                const message =
                    (json as { detail?: string; message?: string } | null)?.detail ||
                    (json as { detail?: string; message?: string } | null)?.message ||
                    `HTTP ${res.status}`;
                throw new Error(message);
            }

            setBjuResult(normalizeBjuResponse(json));
        } catch (error) {
            setBjuResult(null);
            setBjuError(error instanceof Error ? error.message : "Не удалось рассчитать БЖУ.");
        } finally {
            setBjuLoading(false);
        }
    }

    if (loading) return null;

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
                <div style={{ fontSize: 26, fontWeight: 950 }}>Ваши данные</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>
                    Заполни данные один раз — они нужны для натальной карты и остальных расчётов.
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <div
                        style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "rgba(10,18,38,.25)",
                            color: "rgba(245,240,233,.82)",
                            fontSize: 12,
                            fontWeight: 800,
                        }}
                    >
                        Пользователь: {userEmail || "—"}
                    </div>

                    {isAdmin && (
                        <div
                            style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(120,230,255,.20)",
                                background: "rgba(120,230,255,.08)",
                                color: "rgba(245,240,233,.88)",
                                fontSize: 12,
                                fontWeight: 800,
                            }}
                        >
                            Режим администратора: редактирование без ограничений
                        </div>
                    )}

                    {!isAdmin && filled && !Boolean(profile?.free_profile_update_used) && (
                        <div
                            style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(120,230,255,.20)",
                                background: "rgba(120,230,255,.08)",
                                color: "rgba(245,240,233,.88)",
                                fontSize: 12,
                                fontWeight: 800,
                            }}
                        >
                            Доступно 1 бесплатное изменение
                        </div>
                    )}

                    {effectiveNeedPay && (
                        <div
                            style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,110,90,.22)",
                                background: "rgba(255,110,90,.08)",
                                color: "rgba(245,240,233,.88)",
                                fontSize: 12,
                                fontWeight: 800,
                            }}
                        >
                            Требуется оплата 490 ₽
                        </div>
                    )}

                    <a
                        href="/cabinet/profile/related"
                        style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(224,197,143,.18)",
                            background: "rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.9)",
                            fontSize: 12,
                            fontWeight: 800,
                            textDecoration: "none",
                        }}
                    >
                        Добавить анкету
                    </a>
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
                }}
            >
                <div style={{ fontSize: 18, fontWeight: 950 }}>Данные для расчётов</div>

                <div
                    style={{
                        marginTop: 12,
                        display: "grid",
                        gap: 12,
                        gridTemplateColumns: "1fr 1fr",
                    }}
                >
                    <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Имя</div>
                        <input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Например: Илья"
                            style={{
                                marginTop: 6,
                                width: "100%",
                                padding: "12px 12px",
                                borderRadius: 14,
                                border: "1px solid rgba(224,197,143,.14)",
                                background: "rgba(10,18,38,.28)",
                                color: "rgba(245,240,233,.92)",
                                outline: "none",
                            }}
                            disabled={!effectiveCanEdit || saving}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Дата рождения</div>
                        <input
                            value={birthDate}
                            onChange={(e) => setBirthDate(e.target.value)}
                            type="date"
                            style={{
                                marginTop: 6,
                                width: "100%",
                                padding: "12px 12px",
                                borderRadius: 14,
                                border: "1px solid rgba(224,197,143,.14)",
                                background: "rgba(10,18,38,.28)",
                                color: "rgba(245,240,233,.92)",
                                outline: "none",
                            }}
                            disabled={!effectiveCanEdit || saving}
                        />
                    </div>

                    <div>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Время рождения</div>
                        <input
                            value={birthTime}
                            onChange={(e) => setBirthTime(e.target.value)}
                            type="time"
                            style={{
                                marginTop: 6,
                                width: "100%",
                                padding: "12px 12px",
                                borderRadius: 14,
                                border: "1px solid rgba(224,197,143,.14)",
                                background: "rgba(10,18,38,.28)",
                                color: "rgba(245,240,233,.92)",
                                outline: "none",
                            }}
                            disabled={!effectiveCanEdit || saving}
                        />
                    </div>

                    <div style={{ gridColumn: "1 / -1", position: "relative" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Город рождения</div>
                        <input
                            value={birthCity}
                            onChange={(e) => {
                                const value = e.target.value;
                                setBirthCity(value);
                                void fetchCitySuggestions(value);
                            }}
                            onFocus={() => {
                                if (citySuggestions.length) setCitySuggestionsOpen(true);
                            }}
                            onBlur={() => {
                                window.setTimeout(() => setCitySuggestionsOpen(false), 150);
                            }}
                            placeholder="Например: Тюмень"
                            style={{
                                marginTop: 6,
                                width: "100%",
                                padding: "12px 12px",
                                borderRadius: 14,
                                border: "1px solid rgba(224,197,143,.14)",
                                background: "rgba(10,18,38,.28)",
                                color: "rgba(245,240,233,.92)",
                                outline: "none",
                            }}
                            disabled={!effectiveCanEdit || saving}
                            autoComplete="off"
                        />

                        {citySuggestionsLoading && (
                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                                Ищем варианты...
                            </div>
                        )}

                        {citySuggestionsOpen && citySuggestions.length > 0 && (
                            <div
                                style={{
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    right: 0,
                                    marginTop: 6,
                                    borderRadius: 14,
                                    border: "1px solid rgba(224,197,143,.14)",
                                    background: "rgba(8,18,47,.98)",
                                    boxShadow: "0 16px 40px rgba(0,0,0,.28)",
                                    overflow: "hidden",
                                    zIndex: 20,
                                }}
                            >
                                {citySuggestions.map((city) => (
                                    <button
                                        key={city}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            setBirthCity(city);
                                            setCitySuggestionsOpen(false);
                                            setCitySuggestions([]);
                                        }}
                                        style={{
                                            width: "100%",
                                            textAlign: "left",
                                            padding: "10px 12px",
                                            border: "none",
                                            borderBottom: "1px solid rgba(224,197,143,.08)",
                                            background: "transparent",
                                            color: "rgba(245,240,233,.92)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {city}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        onClick={saveProfile}
                        disabled={!effectiveCanEdit || saving}
                        style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            border: "1px solid rgba(224,197,143,.20)",
                            background: effectiveCanEdit
                                ? "rgba(224,197,143,.12)"
                                : "rgba(17,34,80,.16)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 950,
                            cursor: effectiveCanEdit ? "pointer" : "not-allowed",
                        }}
                    >
                        {saving ? "Сохранение…" : "Сохранить"}
                    </button>

                    {effectiveNeedPay && (
                        <button
                            onClick={async () => {
                                const localOrderId = await createPendingGCOrder("profile_update");
                                if (!localOrderId) return;

                                const url = getGetCoursePayUrl({
                                    localOrderId,
                                    kind: "profile_update",
                                });

                                if (!url) {
                                    alert(
                                        "Заказ создан (pending), но не задана ссылка GetCourse. Добавь NEXT_PUBLIC_GC_PROFILE_UPDATE_URL в .env.local"
                                    );
                                    return;
                                }

                                window.location.href = url;
                            }}
                            style={{
                                borderRadius: 14,
                                padding: "12px 14px",
                                border: "1px solid rgba(120,230,255,.22)",
                                background: "rgba(120,230,255,.10)",
                                color: "rgba(245,240,233,.92)",
                                fontWeight: 950,
                                cursor: "pointer",
                            }}
                        >
                            Оплатить 490 ₽ и изменить
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}