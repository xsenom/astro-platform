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
};

type CitySearchResponse = {
  ok?: boolean;
  cities?: string[];
};

const loadingLabels = [
  "Подготавливаем персональный запрос",
  "Запрашиваем расчет Урана в Близнецах",
  "Формируем PDF-файл",
  "Отправляем результат на почту",
];

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

export default function UranVBliznetsahPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false);
  const [birthCity, setBirthCity] = useState("");

  const [consentPersonalData, setConsentPersonalData] = useState(false);
  const [consentAds, setConsentAds] = useState(false);

  const [status, setStatus] = useState<SubmitState>("idle");
  const [errorText, setErrorText] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFileName, setPdfFileName] = useState("uran-v-bliznetsah.pdf");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  const [cityOptions, setCityOptions] = useState<string[]>([]);

  const fullNameValue = fullName.trim();
  const emailValue = email.trim();
  const birthDateValue = birthDate.trim();
  const birthTimeValue = birthTime.trim();
  const birthCityValue = birthCity.trim();

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
  }, [fullNameValue, emailValue, birthDateValue, hasValidBirthTime, birthCityValue, consentPersonalData]);

  useEffect(() => {
    if (status !== "loading") return;

    const timer = window.setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % loadingLabels.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    const query = birthCityValue;

    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/cities/search?q=${encodeURIComponent(query)}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        const json = (await res.json().catch(() => null)) as CitySearchResponse | null;
        if (!res.ok || !json?.ok || !Array.isArray(json.cities)) {
          setCityOptions([]);
          return;
        }

        setCityOptions(json.cities);
      } catch {
        setCityOptions([]);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [birthCityValue]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || status === "loading") return;

    setStatus("loading");
    setErrorText("");
    setEmailSent(false);
    setEmailError("");
    setLoadingStepIndex(0);
    setCityOptions([]);

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
      if (!res.ok || !json?.ok) {
        setStatus("error");
        setErrorText(json?.error || "Не удалось сформировать расчет");
        return;
      }

      setEmailSent(json.email_sent === true);
      setEmailError(typeof json.email_error === "string" ? json.email_error : "");
      setPdfFileName(json.pdf_file_name?.trim() || "uran-v-bliznetsah.pdf");

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
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : "Ошибка отправки запроса");
    }
  }

  return (
    <main className="shell favorableDaysShell">
      <section className="card favorableDaysCard" style={{ maxWidth: 760, margin: "32px auto", padding: 24 }}>
        <h1 style={{ margin: 0 }}>Уран в Близнецах — персональный расчет на 7 лет</h1>
        <p style={{ marginTop: 12, opacity: 0.85 }}>
          Заполните данные рождения, и мы сформируем персональный прогноз и отправим PDF на почту.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Имя" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <input
            value={birthDate}
            onChange={(e) => setBirthDate(formatBirthDateInput(e.target.value))}
            placeholder="Дата рождения (ДД.ММ.ГГГГ)"
          />

          <label style={{ display: "grid", gap: 8 }}>
            <span>Время рождения (HH:MM)</span>
            <input
              value={birthTime}
              onChange={(e) => setBirthTime(formatBirthTimeInput(e.target.value))}
              placeholder="12:30"
              disabled={birthTimeUnknown}
            />
          </label>

          <label style={{ display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={birthTimeUnknown}
              onChange={(e) => {
                setBirthTimeUnknown(e.target.checked);
                if (e.target.checked) setBirthTime("");
              }}
            />
            Время рождения неизвестно
          </label>

          <div style={{ position: "relative" }}>
            <input value={birthCity} onChange={(e) => setBirthCity(e.target.value)} placeholder="Город рождения" />
            {birthCityValue.length >= 2 && cityOptions.length > 0 ? (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "#111", zIndex: 10 }}>
                {cityOptions.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => {
                      setBirthCity(city);
                      setCityOptions([]);
                    }}
                    style={{ display: "block", width: "100%", textAlign: "left" }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label style={{ display: "flex", gap: 8 }}>
            <input
              type="checkbox"
              checked={consentPersonalData}
              onChange={(e) => setConsentPersonalData(e.target.checked)}
            />
            Согласен(а) на обработку персональных данных
          </label>

          <label style={{ display: "flex", gap: 8 }}>
            <input type="checkbox" checked={consentAds} onChange={(e) => setConsentAds(e.target.checked)} />
            Согласен(а) получать рассылку
          </label>

          <button type="submit" disabled={!canSubmit || status === "loading"}>
            {status === "loading" ? loadingLabels[loadingStepIndex] : "Получить расчет"}
          </button>
        </form>

        {status === "error" ? <p style={{ color: "#f87171" }}>{errorText}</p> : null}

        {status === "success" ? (
          <div style={{ marginTop: 14 }}>
            <p>Расчет готов. {emailSent ? "Письмо отправлено." : "Письмо пока не отправлено."}</p>
            {emailError ? <p style={{ color: "#f59e0b" }}>Ошибка отправки: {emailError}</p> : null}
            {pdfUrl ? (
              <a href={pdfUrl} download={pdfFileName}>
                Скачать PDF
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
