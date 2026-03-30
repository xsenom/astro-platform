"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function FavorableDaysMonthPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");
    const [status, setStatus] = useState<SubmitState>("idle");
    const [errorText, setErrorText] = useState("");

    const canSubmit = useMemo(() => {
        return Boolean(
            fullName.trim() &&
            /.+@.+\..+/.test(email.trim()) &&
            birthDate.trim() &&
            birthTime.trim() &&
            birthCity.trim()
        );
    }, [fullName, email, birthDate, birthTime, birthCity]);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!canSubmit || status === "loading") return;

        setStatus("loading");
        setErrorText("");

        const res = await fetch("/api/marketing/favorable-days-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: fullName.trim(),
                email: email.trim(),
                birth_date: birthDate.trim(),
                birth_time: birthTime.trim(),
                birth_city: birthCity.trim(),
                months: 1,
            }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            setStatus("error");
            setErrorText(json?.error || "Не удалось отправить расчёт.");
            return;
        }

        setStatus("success");
    }

    return (
        <main className="shell">
            <section className="card ambient" style={{ maxWidth: 660, margin: "0 auto", display: "grid", gap: 14 }}>
                <h1 className="h1" style={{ margin: 0 }}>Благоприятные дни на месяц</h1>
                <p className="muted" style={{ margin: 0 }}>Заполните данные для расчёта. Результат обязательно отправим на вашу почту.</p>

                {status !== "success" ? (
                    <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
                        <input className="input" placeholder="Имя" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                        <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input className="input" placeholder="Дата рождения (ДД.ММ.ГГГГ)" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
                        <input className="input" placeholder="Время рождения (HH:MM)" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} required />
                        <input className="input" placeholder="Город рождения" value={birthCity} onChange={(e) => setBirthCity(e.target.value)} required />
                        <button className="btn btnPrimary" type="submit" disabled={!canSubmit || status === "loading"}>
                            {status === "loading" ? "Рассчитываем..." : "Получить благоприятные дни"}
                        </button>
                    </form>
                ) : (
                    <div style={{ color: "rgba(245,240,233,.92)" }}>
                        Готово! Расчёт отправлен на вашу почту.
                    </div>
                )}

                {status === "error" && <p style={{ color: "#ff8d8d", margin: 0 }}>{errorText}</p>}
            </section>
        </main>
    );
}
