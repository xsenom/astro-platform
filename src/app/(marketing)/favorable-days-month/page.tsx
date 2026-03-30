"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

type FavorableDaysResponse = {
    ok?: boolean;
    error?: string;
    email_sent?: boolean;
    email_error?: string;
    pdf_base64?: string;
    pdf_file_name?: string;
};

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

const loadingLabels = [
    "Подготавливаем персональный запрос",
    "Считываем астрологические аспекты месяца",
    "Формируем интерпретацию и лучшие периоды",
    "Собираем PDF-файл",
    "Отправляем расчёт на вашу почту",
];

export default function FavorableDaysMonthPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthCity, setBirthCity] = useState("");

    const [status, setStatus] = useState<SubmitState>("idle");
    const [errorText, setErrorText] = useState("");
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [pdfUrl, setPdfUrl] = useState("");
    const [pdfFileName, setPdfFileName] = useState("blagopriyatnye-dni-na-mesyac.pdf");
    const [loadingStepIndex, setLoadingStepIndex] = useState(0);

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

    useEffect(() => {
        if (status !== "loading") return;

        const timer = window.setInterval(() => {
            setLoadingStepIndex((prev) => (prev + 1) % loadingLabels.length);
        }, 1800);

        return () => window.clearInterval(timer);
    }, [status]);

    useEffect(() => {
        return () => {
            if (pdfUrl) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [pdfUrl]);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!canSubmit || status === "loading") return;

        setStatus("loading");
        setLoadingStepIndex(0);
        setErrorText("");
        setEmailError("");
        setEmailSent(false);

        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl("");
        }

        try {
            const res = await fetch("/api/marketing/favorable-days-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullNameValue,
                    email: emailValue,
                    birth_date: birthDateValue,
                    birth_time: birthTimeValue,
                    birth_city: birthCityValue,
                    months: 1,
                }),
            });

            const json = (await res.json().catch(() => null)) as FavorableDaysResponse | null;

            console.log("[favorable-days][client] API response:", json);

            if (!res.ok || !json?.ok) {
                setStatus("error");
                setLoadingStepIndex(0);
                setErrorText(json?.error || "Не удалось сформировать расчёт.");
                return;
            }

            setEmailSent(json.email_sent === true);
            setEmailError(typeof json.email_error === "string" ? json.email_error : "");
            setPdfFileName(
                typeof json.pdf_file_name === "string" && json.pdf_file_name.trim()
                    ? json.pdf_file_name.trim()
                    : "blagopriyatnye-dni-na-mesyac.pdf"
            );

            if (typeof json.pdf_base64 === "string" && json.pdf_base64.length > 0) {
                const binary = atob(json.pdf_base64);
                const bytes = new Uint8Array(binary.length);

                for (let i = 0; i < binary.length; i += 1) {
                    bytes[i] = binary.charCodeAt(i);
                }

                const blob = new Blob([bytes], { type: "application/pdf" });
                setPdfUrl(URL.createObjectURL(blob));
            }

            setStatus("success");
            setLoadingStepIndex(0);
        } catch (error) {
            setStatus("error");
            setLoadingStepIndex(0);
            setErrorText(error instanceof Error ? error.message : "Не удалось отправить запрос.");
        }
    }

    return (
        <main className="shell favorableDaysShell">
            <section className="card ambient favorableDaysCard">
                <h1 className="h1 favorableDaysTitle">Благоприятные дни на месяц</h1>



                {status === "idle" || status === "error" ? (
                    <form onSubmit={onSubmit} className="favorableDaysForm">
                        <input
                            className="input"
                            placeholder="Имя"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                        />

                        <input
                            className="input"
                            placeholder="Email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />

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

                        <input
                            className="input"
                            placeholder="Город рождения"
                            value={birthCity}
                            onChange={(e) => setBirthCity(e.target.value)}
                            required
                        />

                        {emailInvalid ? (
                            <p className="favorableDaysErrorText">Укажите корректный email.</p>
                        ) : null}

                        {birthDateInvalid ? (
                            <p className="favorableDaysErrorText">
                                Введите дату в формате ДД.ММ.ГГГГ.
                            </p>
                        ) : null}

                        {birthTimeInvalid ? (
                            <p className="favorableDaysErrorText">
                                Введите время в формате HH:MM, например 18:30.
                            </p>
                        ) : null}

                        {birthCityInvalid ? (
                            <p className="favorableDaysErrorText">
                                Укажите корректный город рождения, минимум 2 буквы.
                            </p>
                        ) : null}

                        <button className="btn btnPrimary" type="submit" disabled={!canSubmit}>
                            Получить благоприятные дни
                        </button>
                    </form>
                ) : null}

                {status === "loading" ? (
                    <div className="favorableDaysLoadingScreen">
                        <div className="favorableDaysOrbWrap">
                            <div className="favorableDaysOrb favorableDaysOrbOuter" />
                            <div className="favorableDaysOrb favorableDaysOrbMiddle" />
                            <div className="favorableDaysOrb favorableDaysOrbInner" />
                            <div className="favorableDaysCenterGlow" />
                        </div>

                        <div className="favorableDaysLoadingContent">
                            <div className="favorableDaysLoadingBadge">Идёт персональный расчёт</div>

                            <h2 className="favorableDaysLoadingTitle">
                                Пожалуйста, подождите
                            </h2>

                            <p className="favorableDaysLoadingText">
                                Мы рассчитываем аспекты месяца,
                                собираем PDF и отправляем готовый файл на вашу почту.
                            </p>

                            <div className="favorableDaysLoadingStep">
                                <span className="favorableDaysLoadingDot" />
                                <span>{loadingLabels[loadingStepIndex]}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {status === "success" ? (
                    <div className="favorableDaysSuccess">
                        <p className="favorableDaysSuccessText">
                            {emailSent
                                ? `Готово! Расчёт отправлен на почту ${emailValue}.`
                                : "Расчёт готов. Письмо отправить не удалось, но PDF можно открыть или скачать ниже."}
                        </p>

                        {!emailSent && emailError ? (
                            <p className="favorableDaysErrorText">
                                Ошибка отправки письма: {emailError}
                            </p>
                        ) : null}

                        {pdfUrl ? (
                            <div className="favorableDaysActions">
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btnPrimary"
                                >
                                    Открыть расчёт
                                </a>

                                <a href={pdfUrl} download={pdfFileName} className="btn btnPrimary">
                                    Скачать расчёт
                                </a>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {status === "error" && errorText ? (
                    <p className="favorableDaysErrorText">{errorText}</p>
                ) : null}
            </section>

            <style jsx>{`
                .favorableDaysShell {
                    padding-top: 16px !important;
                    padding-bottom: 0 !important;
                    min-height: auto !important;
                }

                .favorableDaysCard {
                    max-width: 760px !important;
                    margin: 0 auto !important;
                    display: grid !important;
                    gap: 16px !important;
                    overflow: hidden !important;
                }

                .favorableDaysTitle {
                    margin: 0 !important;
                }

                .favorableDaysSubtitle {
                    margin: 0 !important;
                }

                .favorableDaysForm {
                    display: grid !important;
                    gap: 10px !important;
                }

                .favorableDaysLoadingScreen {
                    position: relative !important;
                    min-height: 420px !important;
                    display: grid !important;
                    place-items: center !important;
                    padding: 24px 8px 8px !important;
                }

                .favorableDaysOrbWrap {
                    position: relative !important;
                    width: 220px !important;
                    height: 220px !important;
                    display: grid !important;
                    place-items: center !important;
                    margin-bottom: 18px !important;
                }

                .favorableDaysOrb {
                    position: absolute !important;
                    border-radius: 999px !important;
                    border: 1px solid rgba(224, 197, 143, 0.24) !important;
                }

                .favorableDaysOrbOuter {
                    width: 220px !important;
                    height: 220px !important;
                    animation: favorable-days-rotate 9s linear infinite !important;
                }

                .favorableDaysOrbMiddle {
                    width: 160px !important;
                    height: 160px !important;
                    animation: favorable-days-rotate-reverse 6s linear infinite !important;
                }

                .favorableDaysOrbInner {
                    width: 104px !important;
                    height: 104px !important;
                    animation: favorable-days-pulse 2.2s ease-in-out infinite !important;
                    background: radial-gradient(
                            circle,
                            rgba(224, 197, 143, 0.16) 0%,
                            rgba(224, 197, 143, 0.04) 55%,
                            rgba(224, 197, 143, 0) 100%
                    ) !important;
                }

                .favorableDaysCenterGlow {
                    width: 24px !important;
                    height: 24px !important;
                    border-radius: 999px !important;
                    background: rgba(224, 197, 143, 0.95) !important;
                    box-shadow:
                            0 0 24px rgba(224, 197, 143, 0.9),
                            0 0 60px rgba(224, 197, 143, 0.45) !important;
                    animation: favorable-days-glow 1.8s ease-in-out infinite !important;
                }

                .favorableDaysLoadingContent {
                    display: grid !important;
                    gap: 12px !important;
                    text-align: center !important;
                    max-width: 560px !important;
                }

                .favorableDaysLoadingBadge {
                    justify-self: center !important;
                    padding: 8px 14px !important;
                    border-radius: 999px !important;
                    border: 1px solid rgba(224, 197, 143, 0.28) !important;
                    background: rgba(255, 255, 255, 0.04) !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    font-size: 13px !important;
                    letter-spacing: 0.04em !important;
                }

                .favorableDaysLoadingTitle {
                    margin: 0 !important;
                    color: rgba(245, 240, 233, 0.98) !important;
                    font-size: clamp(28px, 5vw, 40px) !important;
                    line-height: 1.05 !important;
                    font-weight: 800 !important;
                }

                .favorableDaysLoadingText {
                    margin: 0 !important;
                    color: rgba(245, 240, 233, 0.78) !important;
                    font-size: 15px !important;
                    line-height: 1.6 !important;
                }

                .favorableDaysLoadingStep {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 10px !important;
                    min-height: 28px !important;
                    color: rgba(245, 240, 233, 0.95) !important;
                    font-size: 15px !important;
                    font-weight: 500 !important;
                }

                .favorableDaysLoadingDot {
                    width: 10px !important;
                    height: 10px !important;
                    border-radius: 999px !important;
                    background: rgba(224, 197, 143, 0.95) !important;
                    box-shadow: 0 0 18px rgba(224, 197, 143, 0.7) !important;
                    animation: favorable-days-dot 1s ease-in-out infinite !important;
                    flex: 0 0 auto !important;
                }

                .favorableDaysSuccess {
                    display: grid !important;
                    gap: 12px !important;
                }

                .favorableDaysSuccessText {
                    color: rgba(245, 240, 233, 0.92) !important;
                    margin: 0 !important;
                }

                .favorableDaysActions {
                    display: grid !important;
                    gap: 10px !important;
                }

                .favorableDaysErrorText {
                    color: #ff8d8d !important;
                    margin: 0 !important;
                }

                @keyframes favorable-days-rotate {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                @keyframes favorable-days-rotate-reverse {
                    from {
                        transform: rotate(360deg);
                    }
                    to {
                        transform: rotate(0deg);
                    }
                }

                @keyframes favorable-days-pulse {
                    0%,
                    100% {
                        transform: scale(0.96);
                        opacity: 0.72;
                    }
                    50% {
                        transform: scale(1.05);
                        opacity: 1;
                    }
                }

                @keyframes favorable-days-glow {
                    0%,
                    100% {
                        transform: scale(0.92);
                        opacity: 0.78;
                    }
                    50% {
                        transform: scale(1.12);
                        opacity: 1;
                    }
                }

                @keyframes favorable-days-dot {
                    0%,
                    100% {
                        transform: scale(0.8);
                        opacity: 0.6;
                    }
                    50% {
                        transform: scale(1.15);
                        opacity: 1;
                    }
                }

                @media (max-width: 640px) {
                    .favorableDaysLoadingScreen {
                        min-height: 360px !important;
                        padding-top: 18px !important;
                    }

                    .favorableDaysOrbWrap {
                        width: 180px !important;
                        height: 180px !important;
                    }

                    .favorableDaysOrbOuter {
                        width: 180px !important;
                        height: 180px !important;
                    }

                    .favorableDaysOrbMiddle {
                        width: 132px !important;
                        height: 132px !important;
                    }

                    .favorableDaysOrbInner {
                        width: 88px !important;
                        height: 88px !important;
                    }

                    .favorableDaysLoadingText {
                        font-size: 14px !important;
                    }

                    .favorableDaysLoadingStep {
                        font-size: 14px !important;
                    }
                }
            `}</style>
        </main>
    );
}