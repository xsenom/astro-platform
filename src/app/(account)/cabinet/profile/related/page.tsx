"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getZodiacSign, ZODIAC_LABELS } from "@/lib/astro/zodiac";

type RelatedProfileRow = {
    id: string;
    full_name: string | null;
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
    relation_label: string | null;
    notes: string | null;
};

type ProfileMarketingRow = {
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_term: string | null;
    utm_content: string | null;
    utm_referrer: string | null;
    marketing_email_opt_in: boolean | null;
};

export default function RelatedProfilesPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<RelatedProfileRow[]>([]);

    const [fullName, setFullName] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");
    const [relationLabel, setRelationLabel] = useState("");
    const [notes, setNotes] = useState("");

    const [utmSource, setUtmSource] = useState("");
    const [utmMedium, setUtmMedium] = useState("");
    const [utmCampaign, setUtmCampaign] = useState("");
    const [utmTerm, setUtmTerm] = useState("");
    const [utmContent, setUtmContent] = useState("");
    const [utmReferrer, setUtmReferrer] = useState("");
    const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(true);

    async function load() {
        setLoading(true);
        setError(null);

        const { data: userData, error: userError } = await supabase.auth.getUser();
        const user = userData.user;
        if (userError || !user) {
            window.location.href = "/login";
            return;
        }

        const [{ data: relatedRows, error: relatedError }, { data: profile, error: profileError }] = await Promise.all([
            supabase
                .from("user_related_profiles")
                .select("id, full_name, birth_date, birth_time, birth_city, relation_label, notes")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
            supabase
                .from("profiles")
                .select("utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_referrer, marketing_email_opt_in")
                .eq("id", user.id)
                .maybeSingle(),
        ]);

        if (relatedError) setError(relatedError.message);
        if (profileError) setError(profileError.message);

        setRows((relatedRows ?? []) as RelatedProfileRow[]);
        const profileRow = (profile ?? null) as ProfileMarketingRow | null;
        setUtmSource(profileRow?.utm_source ?? "");
        setUtmMedium(profileRow?.utm_medium ?? "");
        setUtmCampaign(profileRow?.utm_campaign ?? "");
        setUtmTerm(profileRow?.utm_term ?? "");
        setUtmContent(profileRow?.utm_content ?? "");
        setUtmReferrer(profileRow?.utm_referrer ?? "");
        setMarketingEmailOptIn(profileRow?.marketing_email_opt_in !== false);
        setLoading(false);
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            void load();
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    async function saveUtm() {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { error: updateError } = await supabase.from("profiles").update({
            utm_source: utmSource.trim() || null,
            utm_medium: utmMedium.trim() || null,
            utm_campaign: utmCampaign.trim() || null,
            utm_term: utmTerm.trim() || null,
            utm_content: utmContent.trim() || null,
            utm_referrer: utmReferrer.trim() || null,
            marketing_email_opt_in: marketingEmailOptIn,
            updated_at: new Date().toISOString(),
        }).eq("id", user.id);

        if (updateError) {
            setError(updateError.message);
        }
    }

    async function addRow() {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) return;

        const { error: insertError } = await supabase.from("user_related_profiles").insert({
            user_id: user.id,
            full_name: fullName.trim() || null,
            birth_date: birthDate || null,
            birth_time: birthTime ? `${birthTime}:00` : null,
            birth_city: birthCity.trim() || null,
            relation_label: relationLabel.trim() || null,
            notes: notes.trim() || null,
            updated_at: new Date().toISOString(),
        });

        if (insertError) {
            setError(insertError.message);
            return;
        }

        setFullName("");
        setBirthDate("");
        setBirthTime("");
        setBirthCity("");
        setRelationLabel("");
        setNotes("");
        await load();
    }

    async function removeRow(id: string) {
        const { error: deleteError } = await supabase.from("user_related_profiles").delete().eq("id", id);
        if (deleteError) {
            setError(deleteError.message);
            return;
        }

        setRows((prev) => prev.filter((item) => item.id !== id));
    }

    if (loading) return null;

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)", display: "grid", gap: 10 }}>
                <div style={{ fontSize: 24, fontWeight: 950 }}>Анкета: дополнительные пользователи</div>
                <div style={{ opacity: 0.8, fontSize: 13 }}>Эти данные не участвуют в расчётах. Их видит только админ и владелец кабинета.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Имя" style={{ padding: 10, borderRadius: 10 }} />
                    <input value={relationLabel} onChange={(e) => setRelationLabel(e.target.value)} placeholder="Кем приходится" style={{ padding: 10, borderRadius: 10 }} />
                    <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} style={{ padding: 10, borderRadius: 10 }} />
                    <input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} style={{ padding: 10, borderRadius: 10 }} />
                    <input value={birthCity} onChange={(e) => setBirthCity(e.target.value)} placeholder="Город рождения" style={{ padding: 10, borderRadius: 10 }} />
                    <input value={birthDate ? (ZODIAC_LABELS[getZodiacSign(birthDate) || "aries"] || "") : ""} readOnly placeholder="Знак зодиака" style={{ padding: 10, borderRadius: 10 }} />
                </div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Заметки для админа" style={{ padding: 10, borderRadius: 10 }} />
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => void addRow()} style={{ borderRadius: 10, padding: "10px 12px" }}>Добавить анкету</button>
                    <a href="/cabinet/profile" style={{ borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(224,197,143,.2)", textDecoration: "none", color: "inherit" }}>Назад</a>
                </div>
            </div>

            <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)", display: "grid", gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>UTM метки и рассылка</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    {[ ["utm_source", utmSource, setUtmSource], ["utm_medium", utmMedium, setUtmMedium], ["utm_campaign", utmCampaign, setUtmCampaign], ["utm_term", utmTerm, setUtmTerm], ["utm_content", utmContent, setUtmContent], ["utm_referrer", utmReferrer, setUtmReferrer] ].map(([label, value, setter]) => (
                        <input key={String(label)} value={String(value)} onChange={(e) => (setter as (value: string) => void)(e.target.value)} placeholder={String(label)} style={{ padding: 10, borderRadius: 10 }} />
                    ))}
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                    <input type="checkbox" checked={marketingEmailOptIn} onChange={(e) => setMarketingEmailOptIn(e.target.checked)} />
                    Получать email-рассылки
                </label>
                <button onClick={() => void saveUtm()} style={{ borderRadius: 10, padding: "10px 12px", width: "fit-content" }}>Сохранить UTM</button>
            </div>

            <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)", display: "grid", gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>Список анкет ({rows.length})</div>
                {rows.map((row) => (
                    <div key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid rgba(224,197,143,.14)", borderRadius: 12, padding: 10 }}>
                        <div>
                            <div style={{ fontWeight: 800 }}>{row.full_name || "Без имени"} {row.relation_label ? `(${row.relation_label})` : ""}</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>{row.birth_date || ""} {row.birth_city || ""}</div>
                        </div>
                        <button onClick={() => void removeRow(row.id)} style={{ borderRadius: 10, border: "1px solid rgba(255,110,90,.22)", background: "rgba(255,110,90,.08)", color: "#fff" }}>Удалить</button>
                    </div>
                ))}
                {error && <div style={{ color: "#ffb4b4", fontSize: 13 }}>{error}</div>}
            </div>
        </div>
    );
}
