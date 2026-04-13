"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

type UranusGeminiResponse = {
    ok?: boolean;
    error?: string;
    email_sent?: boolean;
    email_error?: string;
    pdf_base64?: string;
    pdf_file_name?: string;
    pdf_url?: string;
    already_exists?: boolean;
    message?: string;
};

type CitySearchResponse = {
    ok?: boolean;
    cities?: string[];
    error?: string;
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
    return /^[\p{L}\s.,()-]{2,}$/u.test(value.trim());
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
    "Запрашиваем расчёт Урана в Близнецах",
    "Формируем интерпретацию периода",
    "Собираем PDF-файл",
    "Отправляем расчёт на вашу почту",
];

export default function UranusGeminiPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [birthDate, setBirthDate] = useState("");
    const [birthTime, setBirthTime] = useState("");
    const [birthTimeUnknown, setBirthTimeUnknown] = useState(false);
    const [birthCity, setBirthCity] = useState("");

    const [consentPersonalData, setConsentPersonalData] = useState(false);
    const [consentAds, setConsentAds] = useState(false);

    const [cityOptions, setCityOptions] = useState<string[]>([]);
    const [showCityOptions, setShowCityOptions] = useState(false);
    const [cityLoading, setCityLoading] = useState(false);

    const [status, setStatus] = useState<SubmitState>("idle");
    const [errorText, setErrorText] = useState("");
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [pdfUrl, setPdfUrl] = useState("");
    const [pdfFileName, setPdfFileName] = useState("uran-v-bliznetsah.pdf");
    const [loadingStepIndex, setLoadingStepIndex] = useState(0);
    
    const [alreadyExists, setAlreadyExists] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");

    const fullNameValue = fullName.trim();
    const emailValue = email.trim();
    const birthDateValue = birthDate.trim();
    const birthTimeValue = birthTime.trim();
    const birthCityValue = birthCity.trim();

    const emailInvalid = emailValue.length > 0 && !isValidEmail(emailValue);
    const birthDateInvalid = birthDateValue.length > 0 && !isValidBirthDate(birthDateValue);
    const birthTimeInvalid =
        !birthTimeUnknown &&
        birthTimeValue.length > 0 &&
        !isValidBirthTime(birthTimeValue);
    const birthCityInvalid = birthCityValue.length > 0 && !isValidBirthCity(birthCityValue);

    const hasValidBirthTime = birthTimeUnknown || isValidBirthTime(birthTimeValue);

    const canSubmit = useMemo(() => {
        return Boolean(
            fullNameValue &&
            isValidEmail(emailValue) &&
            isValidBirthDate(birthDateValue) &&
            hasValidBirthTime &&
            isValidBirthCity(birthCityValue) &&
            consentPersonalData
        );
    }, [
        fullNameValue,
        emailValue,
        birthDateValue,
        hasValidBirthTime,
        birthCityValue,
        consentPersonalData,
    ]);

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

    useEffect(() => {
        const query = birthCityValue;

        if (query.length < 2) {
            setCityOptions([]);
            setShowCityOptions(false);
            setCityLoading(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            try {
                setCityLoading(true);

                const res = await fetch(
                    `/api/cities/search?q=${encodeURIComponent(query)}`,
                    {
                        method: "GET",
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                const json = (await res.json().catch(() => null)) as CitySearchResponse | null;

                if (!res.ok || !json?.ok || !Array.isArray(json.cities)) {
                    setCityOptions([]);
                    setShowCityOptions(false);
                    return;
                }

                setCityOptions(json.cities);
                setShowCityOptions(json.cities.length > 0);
            } catch {
                setCityOptions([]);
                setShowCityOptions(false);
            } finally {
                setCityLoading(false);
            }
        }, 300);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [birthCityValue]);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!canSubmit || status === "loading") return;

        setStatus("loading");
        setLoadingStepIndex(0);
        setErrorText("");
        setEmailError("");
        setEmailSent(false);
        setShowCityOptions(false);
        setAlreadyExists(false);
        setSuccessMessage("");

        if (pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl("");
        }

        try {
            const res = await fetch("/api/marketing/uranus-gemini-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    full_name: fullNameValue,
                    email: emailValue,
                    birth_date: birthDateValue,
                    birth_time: birthTimeUnknown ? "" : birthTimeValue,
                    birth_time_unknown: birthTimeUnknown,
                    birth_city: birthCityValue,
                    consent_personal_data: consentPersonalData,
                    consent_ads: consentAds,
                }),
            });

            const json = (await res.json().catch(() => null)) as UranusGeminiResponse | null;

            console.log("[uranus-gemini][client] API response:", json);
            
            if (!res.ok || !json?.ok) {
                setStatus("error");
                setLoadingStepIndex(0);
                setErrorText(json?.error || "Не удалось сформировать расчёт.");
                return;
            }
            
            // здесь успешный ответ
            setEmailSent(json.email_sent === true);
            setEmailError(typeof json.email_error === "string" ? json.email_error : "");
            setAlreadyExists(json.already_exists === true);
            setSuccessMessage(typeof json.message === "string" ? json.message : "");
            setPdfFileName(
                typeof json.pdf_file_name === "string" && json.pdf_file_name.trim()
                    ? json.pdf_file_name.trim()
                    : "uran-v-bliznetsah.pdf"
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
        <main className="shell uranusShell">
            <section className="card ambient uranusCard">
                <h1 className="h1 uranusTitle">Уран в Близнецах</h1>

                {status === "idle" || status === "error" ? (
                    <form onSubmit={onSubmit} className="uranusForm">
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

                        <div className="uranusTimeWrap">
                            {!birthTimeUnknown ? (
                                <input
                                    className="input"
                                    placeholder="Время рождения (HH:MM)"
                                    value={birthTime}
                                    onChange={(e) => {
                                        setBirthTime(formatBirthTimeInput(e.target.value));
                                        setBirthTimeUnknown(false);
                                    }}
                                    inputMode="numeric"
                                    maxLength={5}
                                    required
                                />
                            ) : (
                                <div className="uranusUnknownTimeBox">
                                    Время рождения неизвестно
                                </div>
                            )}

                            <button
                                type="button"
                                className="uranusSecondaryBtn"
                                onClick={() => {
                                    if (birthTimeUnknown) {
                                        setBirthTimeUnknown(false);
                                    } else {
                                        setBirthTime("");
                                        setBirthTimeUnknown(true);
                                    }
                                }}
                            >
                                {birthTimeUnknown ? "Указать время" : "Не знаю время рождения"}
                            </button>
                        </div>

                        <div className="uranusCityWrap">
                            <input
                                className="input"
                                placeholder="Город рождения"
                                value={birthCity}
                                onChange={(e) => setBirthCity(e.target.value)}
                                onFocus={() => {
                                    if (cityOptions.length > 0) {
                                        setShowCityOptions(true);
                                    }
                                }}
                                required
                                autoComplete="off"
                            />

                            {showCityOptions ? (
                                <div className="uranusCityDropdown">
                                    {cityLoading ? (
                                        <div className="uranusCityOption muted">
                                            Ищем варианты...
                                        </div>
                                    ) : cityOptions.length > 0 ? (
                                        cityOptions.map((city) => (
                                            <button
                                                key={city}
                                                type="button"
                                                className="uranusCityOption"
                                                onClick={() => {
                                                    setBirthCity(city);
                                                    setShowCityOptions(false);
                                                }}
                                            >
                                                {city}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="uranusCityOption muted">
                                            Ничего не найдено
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        <div className="uranusConsentBox">
                            <label className="uranusCheckboxRow">
                                <input
                                    type="checkbox"
                                    checked={consentPersonalData}
                                    onChange={(e) => setConsentPersonalData(e.target.checked)}
                                />
                                <span>
                                    Я даю согласие на{" "}
                                    <a
                                        href="/soglasie-na-obrabotku-personalnyh-dannyh"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        обработку персональных данных
                                    </a>.
                                </span>
                            </label>

                            <label className="uranusCheckboxRow">
                                <input
                                    type="checkbox"
                                    checked={consentAds}
                                    onChange={(e) => setConsentAds(e.target.checked)}
                                />
                                <span>
                                    Я согласен(а) на получение{" "}
                                    <a
                                        href="https://ermolina.pro/soglasie"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        рекламно-информационных сообщений
                                    </a>.
                                </span>
                            </label>
                        </div>

                        {emailInvalid ? (
                            <p className="uranusErrorText">Укажите корректный email.</p>
                        ) : null}

                        {birthDateInvalid ? (
                            <p className="uranusErrorText">
                                Введите дату в формате ДД.ММ.ГГГГ.
                            </p>
                        ) : null}

                        {birthTimeInvalid ? (
                            <p className="uranusErrorText">
                                Введите время в формате HH:MM, например 18:30, или нажмите «Не знаю».
                            </p>
                        ) : null}

                        {birthCityInvalid ? (
                            <p className="uranusErrorText">
                                Укажите корректный город рождения, минимум 2 буквы.
                            </p>
                        ) : null}

                        <button
                            className={`btn btnPrimary uranusSubmitBtn ${!canSubmit ? "isDisabled" : ""}`}
                            type="submit"
                            disabled={!canSubmit}
                        >
                            Получить расчёт
                        </button>
                    </form>
                ) : null}

                {status === "loading" ? (
                    <div className="uranusLoadingScreen">
                        <div className="uranusOrbWrap">
                            <div className="uranusOrb uranusOrbOuter" />
                            <div className="uranusOrb uranusOrbMiddle" />
                            <div className="uranusOrb uranusOrbInner" />
                            <div className="uranusCenterGlow" />
                        </div>

                        <div className="uranusLoadingContent">
                            <div className="uranusLoadingBadge">Идёт персональный расчёт</div>

                            <h2 className="uranusLoadingTitle">
                                Пожалуйста, подождите
                            </h2>

                            <p className="uranusLoadingText">
                                Мы рассчитываем период Урана в Близнецах,
                                собираем PDF и отправляем готовый файл на вашу почту.
                            </p>

                            <div className="uranusLoadingStep">
                                <span className="uranusLoadingDot" />
                                <span>{loadingLabels[loadingStepIndex]}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {status === "success" ? (
                    <div className="uranusSuccess">
                        <p className="uranusSuccessText">
                            {successMessage
                                ? successMessage
                                : alreadyExists
                                  ? "Вы уже получили расчёт по этому прогнозу, он в вашем личном кабинете и на указанной вами почте. Или обратитесь в техподдержку"
                                  : emailSent
                                    ? `Готово! Расчёт отправлен на почту ${emailValue}.`
                                    : "Расчёт готов. Письмо отправить не удалось, но PDF можно открыть или скачать ниже."}
                        </p>
                
                        {!emailSent && !alreadyExists && emailError ? (
                            <p className="uranusErrorText">
                                Ошибка отправки письма: {emailError}
                            </p>
                        ) : null}
                
                        {pdfUrl && !alreadyExists ? (
                            <div className="uranusActions">
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
                    <p className="uranusErrorText">{errorText}</p>
                ) : null}
            </section>

            <style jsx>{`
                .uranusShell {
                    min-height: calc(100vh - 220px) !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 32px 16px 80px !important;
                }

                .uranusCard {
                    width: 100% !important;
                    max-width: 430px !important;
                    margin: 0 auto !important;
                    display: grid !important;
                    gap: 16px !important;
                    overflow: visible !important;
                }

                .uranusTitle {
                    margin: 0 !important;
                }

                .uranusForm {
                    display: grid !important;
                    gap: 10px !important;
                }

                .uranusTimeWrap {
                    display: grid !important;
                    grid-template-columns: 1fr auto !important;
                    gap: 10px !important;
                    align-items: stretch !important;
                }

                .uranusUnknownTimeBox {
                    display: flex !important;
                    align-items: center !important;
                    min-height: 52px !important;
                    border-radius: 14px !important;
                    padding: 0 16px !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    background: rgba(255, 255, 255, 0.03) !important;
                    color: rgba(245, 240, 233, 0.66) !important;
                }

                .uranusSecondaryBtn {
                    min-width: 110px !important;
                    border-radius: 14px !important;
                    border: 1px solid rgba(224, 197, 143, 0.24) !important;
                    background: rgba(255, 255, 255, 0.04) !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    padding: 0 16px !important;
                    cursor: pointer !important;
                }

                .uranusCityWrap {
                    position: relative !important;
                }

                .uranusCityDropdown {
                    position: absolute !important;
                    top: calc(100% + 6px) !important;
                    left: 0 !important;
                    right: 0 !important;
                    z-index: 20 !important;
                    display: grid !important;
                    gap: 4px !important;
                    padding: 6px !important;
                    border-radius: 14px !important;
                    border: 1px solid rgba(224, 197, 143, 0.18) !important;
                    background: rgba(12, 16, 28, 0.98) !important;
                    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.3) !important;
                    max-height: 240px !important;
                    overflow-y: auto !important;
                }

                .uranusCityOption {
                    width: 100% !important;
                    text-align: left !important;
                    border: 0 !important;
                    background: transparent !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    padding: 10px 12px !important;
                    border-radius: 10px !important;
                    cursor: pointer !important;
                }

                .uranusCityOption:hover {
                    background: rgba(255, 255, 255, 0.06) !important;
                }

                .uranusCityOption.muted {
                    color: rgba(245, 240, 233, 0.54) !important;
                    cursor: default !important;
                }

                .uranusConsentBox {
                    display: grid !important;
                    gap: 12px !important;
                    margin-top: 4px !important;
                    padding: 16px !important;
                    border-radius: 18px !important;
                    border: 1px solid rgba(255, 255, 255, 0.08) !important;
                    background: rgba(255, 255, 255, 0.03) !important;
                }

                .uranusCheckboxRow {
                    display: grid !important;
                    grid-template-columns: 18px 1fr !important;
                    gap: 12px !important;
                    align-items: start !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    font-size: 15px !important;
                    line-height: 1.6 !important;
                    cursor: pointer !important;
                }

                .uranusCheckboxRow input {
                    margin: 3px 0 0 !important;
                    width: 16px !important;
                    height: 16px !important;
                }

                .uranusCheckboxRow a {
                    color: #e0c58f !important;
                    text-decoration: none !important;
                }

                .uranusCheckboxRow a:hover {
                    text-decoration: underline !important;
                }

                .uranusLoadingScreen {
                    position: relative !important;
                    min-height: 420px !important;
                    display: grid !important;
                    place-items: center !important;
                    padding: 24px 8px 8px !important;
                }

                .uranusOrbWrap {
                    position: relative !important;
                    width: 220px !important;
                    height: 220px !important;
                    display: grid !important;
                    place-items: center !important;
                    margin-bottom: 18px !important;
                }

                .uranusOrb {
                    position: absolute !important;
                    border-radius: 999px !important;
                    border: 1px solid rgba(224, 197, 143, 0.24) !important;
                }

                .uranusOrbOuter {
                    width: 220px !important;
                    height: 220px !important;
                    animation: uranus-rotate 9s linear infinite !important;
                }

                .uranusOrbMiddle {
                    width: 160px !important;
                    height: 160px !important;
                    animation: uranus-rotate-reverse 6s linear infinite !important;
                }

                .uranusOrbInner {
                    width: 104px !important;
                    height: 104px !important;
                    animation: uranus-pulse 2.2s ease-in-out infinite !important;
                    background: radial-gradient(
                        circle,
                        rgba(224, 197, 143, 0.16) 0%,
                        rgba(224, 197, 143, 0.04) 55%,
                        rgba(224, 197, 143, 0) 100%
                    ) !important;
                }

                .uranusCenterGlow {
                    width: 24px !important;
                    height: 24px !important;
                    border-radius: 999px !important;
                    background: rgba(224, 197, 143, 0.95) !important;
                    box-shadow:
                        0 0 24px rgba(224, 197, 143, 0.9),
                        0 0 60px rgba(224, 197, 143, 0.45) !important;
                    animation: uranus-glow 1.8s ease-in-out infinite !important;
                }

                .uranusLoadingContent {
                    display: grid !important;
                    gap: 12px !important;
                    text-align: center !important;
                    max-width: 560px !important;
                }

                .uranusLoadingBadge {
                    justify-self: center !important;
                    padding: 8px 14px !important;
                    border-radius: 999px !important;
                    border: 1px solid rgba(224, 197, 143, 0.28) !important;
                    background: rgba(255, 255, 255, 0.04) !important;
                    color: rgba(245, 240, 233, 0.92) !important;
                    font-size: 13px !important;
                    letter-spacing: 0.04em !important;
                }

                .uranusLoadingTitle {
                    margin: 0 !important;
                    color: rgba(245, 240, 233, 0.98) !important;
                    font-size: clamp(28px, 5vw, 40px) !important;
                    line-height: 1.05 !important;
                    font-weight: 800 !important;
                }

                .uranusLoadingText {
                    margin: 0 !important;
                    color: rgba(245, 240, 233, 0.78) !important;
                    font-size: 15px !important;
                    line-height: 1.6 !important;
                }

                .uranusLoadingStep {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 10px !important;
                    min-height: 28px !important;
                    color: rgba(245, 240, 233, 0.95) !important;
                    font-size: 15px !important;
                    font-weight: 500 !important;
                }

                .uranusLoadingDot {
                    width: 10px !important;
                    height: 10px !important;
                    border-radius: 999px !important;
                    background: rgba(224, 197, 143, 0.95) !important;
                    box-shadow: 0 0 18px rgba(224, 197, 143, 0.7) !important;
                    animation: uranus-dot 1s ease-in-out infinite !important;
                    flex: 0 0 auto !important;
                }

                .uranusSuccess {
                    display: grid !important;
                    gap: 12px !important;
                }

                .uranusSuccessText {
                    color: rgba(245, 240, 233, 0.92) !important;
                    margin: 0 !important;
                }

                .uranusActions {
                    display: grid !important;
                    gap: 10px !important;
                }

                .uranusErrorText {
                    color: #ff8d8d !important;
                    margin: 0 !important;
                }

                @keyframes uranus-rotate {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                @keyframes uranus-rotate-reverse {
                    from {
                        transform: rotate(360deg);
                    }
                    to {
                        transform: rotate(0deg);
                    }
                }

                @keyframes uranus-pulse {
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

                @keyframes uranus-glow {
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

                @keyframes uranus-dot {
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
                    .uranusShell {
                        min-height: auto !important;
                        align-items: flex-start !important;
                        padding-top: 16px !important;
                        padding-bottom: 24px !important;
                    }

                    .uranusTimeWrap {
                        grid-template-columns: 1fr !important;
                    }

                    .uranusSecondaryBtn {
                        min-height: 46px !important;
                    }

                    .uranusConsentBox {
                        padding: 14px !important;
                    }

                    .uranusCheckboxRow {
                        font-size: 14px !important;
                    }

                    .uranusLoadingScreen {
                        min-height: 360px !important;
                        padding-top: 18px !important;
                    }

                    .uranusOrbWrap {
                        width: 180px !important;
                        height: 180px !important;
                    }

                    .uranusOrbOuter {
                        width: 180px !important;
                        height: 180px !important;
                    }

                    .uranusOrbMiddle {
                        width: 132px !important;
                        height: 132px !important;
                    }

                    .uranusOrbInner {
                        width: 88px !important;
                        height: 88px !important;
                    }

                    .uranusLoadingText {
                        font-size: 14px !important;
                    }

                    .uranusLoadingStep {
                        font-size: 14px !important;
                    }
                }

                .uranusSubmitBtn {
                    transition:
                        opacity 0.2s ease,
                        filter 0.2s ease,
                        transform 0.2s ease,
                        background 0.2s ease,
                        border-color 0.2s ease,
                        color 0.2s ease !important;
                }

                .uranusSubmitBtn.isDisabled,
                .uranusSubmitBtn:disabled {
                    background: rgba(255, 255, 255, 0.10) !important;
                    border-color: rgba(255, 255, 255, 0.14) !important;
                    color: rgba(245, 240, 233, 0.52) !important;
                    box-shadow: none !important;
                    cursor: not-allowed !important;
                    filter: grayscale(0.2) !important;
                }

                .uranusSubmitBtn:not(:disabled) {
                    cursor: pointer !important;
                }
            `}</style>
        </main>
    );
}