"use client";

import { FormEvent, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidBirthDate(value: string) {
    if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/.test(value)) {
        return false;
    }

    const [dayRaw, monthRaw, yearRaw] = value.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function isValidBirthTime(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidBirthCity(value: string) {
    return /^[\p{L}\s-]{2,}$/u.test(value);
}

function formatBirthDateInput(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    const day = digits.slice(0, 2);
    const month = digits.slice(2, 4);
    const year = digits.slice(4, 8);

    if (digits.length <= 2) return day;
    if (digits.length <= 4) return `${day}.${month}`;
    return `${day}.${month}.${year}`;
}

function formatBirthTimeInput(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    const hours = digits.slice(0, 2);
    const minutes = digits.slice(2, 4);

    if (digits.length <= 2) return hours;
    return `${hours}:${minutes}`;
}

export default function FavorableDaysMonthPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");
    const [status, setStatus] = useState<SubmitState>("idle");
    const [errorText, setErrorText] = useState("");

    const fullNameValue = fullName.trim();
    const emailValue = email.trim();
    const birthDateValue = birthDate.trim();
    const birthTimeValue = birthTime.trim();
    const birthCityValue = birthCity.trim();

    const emailInvalid = emailValue.length > 0 && !isValidEmail(emailValue);
    const birthDateInvalid = birthDateValue.length > 0 && !isValidBirthDate(birthDateValue);
    const birthTimeInvalid = birthTimeValue.length > 0 && !isValidBirthTime(birthTimeValue);
    const birthCityInvalid = birthCityValue.length > 0 && !isValidBirthCity(birthCityValue);

    const canSubmit = useMemo(() => {
        return Boolean(
            fullNameValue &&
            isValidEmail(emailValue) &&
            isValidBirthDate(birthDateValue) &&
            isValidBirthTime(birthTimeValue) &&
            isValidBirthCity(birthCityValue)
        );
    }, [fullNameValue, emailValue, birthDateValue, birthTimeValue, birthCityValue]);

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
        <main className="shell favorableDaysShell">
            <section className="card ambient" style={{ maxWidth: 660, margin: "0 auto", display: "grid", gap: 14 }}>
                <h1 className="h1" style={{ margin: 0 }}>Благоприятные дни на месяц</h1>
                <p className="muted" style={{ margin: 0 }}>Заполните данные для расчёта. Результат обязательно отправим на вашу почту.</p>

                {status !== "success" ? (
                    <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
                        <input className="input" placeholder="Имя" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                        <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input
                            className="input"
                            placeholder="Дата рождения (ДД.ММ.ГГГГ)"
                            value={birthDate}
                            onChange={(e) => setBirthDate(formatBirthDateInput(e.target.value))}
                            inputMode="numeric"
                            maxLength={10}
                            required
                        />
                        <input
                            className="input"
                            placeholder="Время рождения (HH:MM)"
                            value={birthTime}
                            onChange={(e) => setBirthTime(formatBirthTimeInput(e.target.value))}
                            inputMode="numeric"
                            maxLength={5}
                            required
                        />
                        <input className="input" placeholder="Город рождения" value={birthCity} onChange={(e) => setBirthCity(e.target.value)} required />
                        {emailInvalid && <p style={{ color: "#ff8d8d", margin: 0 }}>Укажите корректный email.</p>}
                        {birthDateInvalid && <p style={{ color: "#ff8d8d", margin: 0 }}>Введите дату в формате ДД.ММ.ГГГГ.</p>}
                        {birthTimeInvalid && <p style={{ color: "#ff8d8d", margin: 0 }}>Введите время в формате HH:MM (например, 18:30).</p>}
                        {birthCityInvalid && <p style={{ color: "#ff8d8d", margin: 0 }}>Укажите корректный город рождения (минимум 2 буквы).</p>}
                        <button className="btn btnPrimary" type="submit" disabled={!canSubmit || status === "loading"}>
                            {status === "loading" ? "Рассчитываем..." : "Получить благоприятные дни"}
                        </button>
                        {status === "loading" && (
                            <div className="favorableDaysLoading">
                                <span className="favorableDaysSpinner" />
                                <span>Считаем аспекты и готовим интерпретацию…</span>
                            </div>
                        )}
                    </form>
                ) : (
                    <div style={{ color: "rgba(245,240,233,.92)" }}>
                        Готово! Расчёт отправлен на вашу почту.
                    </div>
                )}

                {status === "error" && <p style={{ color: "#ff8d8d", margin: 0 }}>{errorText}</p>}
            </section>

            <style jsx>{`
                .favorableDaysShell {
                    padding-top: 16px !important;
                    padding-bottom: 0 !important;
                    min-height: auto !important;
                }

                .favorableDaysLoading {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    font-size: 14px !important;
                }

                .favorableDaysSpinner {
                    width: 14px !important;
                    height: 14px !important;
                    border-radius: 999px !important;
                    border: 2px solid rgba(245, 240, 233, 0.28) !important;
                    border-top-color: rgba(245, 240, 233, 0.95) !important;
                    animation: favorable-days-spin 0.8s linear infinite !important;
                }

                @keyframes favorable-days-spin {
                    to {
                        transform: rotate(360deg);
                    }
                }
            `}</style>
        </main>
    );
}
