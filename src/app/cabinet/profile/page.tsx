"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCabinetLoading } from "@/components/cabinet/cabinetLoading";

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

function isProfileFilled(p: ProfileRow | null) {
    if (!p) return false;
    return Boolean(p.full_name || p.birth_date || p.birth_time || p.birth_city);
}

export default function ProfileDataPage() {
    const { startLoading, stopLoading } = useCabinetLoading();


    const [loading, setLoading] = useState(true);
    const [userEmail, setUserEmail] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const [profile, setProfile] = useState<ProfileRow | null>(null);

    const [fullName, setFullName] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");
    const [saving, setSaving] = useState(false);

    const [canEdit, setCanEdit] = useState(true);
    const [needPay, setNeedPay] = useState(false);
    const [usableOrderId, setUsableOrderId] = useState<string | null>(null);

    const filled = useMemo(() => isProfileFilled(profile), [profile]);

    async function getUsablePaidOrder(kind: "profile_update" | "add_person") {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return null;

        // paid = status='paid' ИЛИ paid_at заполнен
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

        return (data as any)?.id ?? null;
    }

    async function refreshAccess(prof: ProfileRow | null) {
        const isFilled = isProfileFilled(prof);

        // 1) профиль пустой — всегда можно сохранять бесплатно
        if (!isFilled) {
            setCanEdit(true);
            setNeedPay(false);
            setUsableOrderId(null);
            return;
        }

        // 2) профиль заполнен — проверяем бесплатное изменение
        const freeUsed = Boolean((prof as any)?.free_profile_update_used);
        if (!freeUsed) {
            setCanEdit(true);
            setNeedPay(false);
            setUsableOrderId(null);
            return;
        }

        // 3) бесплатное уже использовано — ищем оплаченный заказ
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

    async function load() {
        startLoading()
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
            }

            await refreshAccess(p);
        } finally {
            setLoading(false);
            stopLoading();
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function createPendingGCOrder(kind: "profile_update" | "add_person") {
        setErr(null);

        // если хочешь, чтобы при создании заказа тоже была луна — включаем:
        startLoading()
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

            return (data as any).id as string;
        } finally {
          stopLoading();
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

        // ✅ пусть луна висит на сохранении тоже
        startLoading();

        try {
            if (!canEdit) {
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
            const freeUsed = Boolean((profile as any)?.free_profile_update_used);

            const payload: any = {
                id: user.id,
                email: user.email ?? null,
                full_name: fullName.trim() || null,
                birth_date: birthDate || null,
                birth_time: birthTime ? `${birthTime}:00` : null,
                birth_city: birthCity.trim() || null,
                updated_at: new Date().toISOString(),
            };

            // если это первое изменение после заполнения и бесплатное ещё не использовано — фиксируем
            if (wasFilled && !freeUsed && !usableOrderId) {
                payload.free_profile_update_used = true;
            }

            const { error } = await supabase.from("profiles").upsert(payload);
            if (error) {
                setErr(error.message);
                return;
            }

            // если редактирование было платным — гасим заказ
            if (usableOrderId) {
                const { error: cErr } = await supabase
                    .from("orders")
                    .update({ consumed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq("id", usableOrderId);

                if (cErr) {
                    setErr("Профиль сохранён, но не удалось погасить оплату. Напиши мне — поправим политику/права.");
                }
            }

            await load();
        } finally {
            setSaving(false);
            stopLoading();
        }
    }

    // ✅ убираем “Загрузка…” — вместо этого луна сверху
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

                    {filled && !Boolean((profile as any)?.free_profile_update_used) && (
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

                    {needPay && (
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
                }}
            >
                <div style={{ fontSize: 18, fontWeight: 950 }}>Данные для расчётов</div>

                <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
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
                            disabled={!canEdit || saving}
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
                            disabled={!canEdit || saving}
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
                            disabled={!canEdit || saving}
                        />
                    </div>

                    <div style={{ gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Город рождения</div>
                        <input
                            value={birthCity}
                            onChange={(e) => setBirthCity(e.target.value)}
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
                            disabled={!canEdit || saving}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                        onClick={saveProfile}
                        disabled={!canEdit || saving}
                        style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            border: "1px solid rgba(224,197,143,.20)",
                            background: canEdit ? "rgba(224,197,143,.12)" : "rgba(17,34,80,.16)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 950,
                            cursor: canEdit ? "pointer" : "not-allowed",
                        }}
                    >
                        {saving ? "Сохранение…" : "Сохранить"}
                    </button>

                    {needPay && (
                        <button
                            onClick={async () => {
                                const localOrderId = await createPendingGCOrder("profile_update");
                                if (!localOrderId) return;

                                const url = getGetCoursePayUrl({ localOrderId, kind: "profile_update" });
                                if (!url) {
                                    alert("Заказ создан (pending), но не задана ссылка GetCourse. Добавь NEXT_PUBLIC_GC_PROFILE_UPDATE_URL в .env.local");
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
