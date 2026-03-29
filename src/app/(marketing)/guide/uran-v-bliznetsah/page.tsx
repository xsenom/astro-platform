"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { legalLinks } from "@/lib/email/shared-footer";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function UranGuideLeadPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
  const [acceptedAds, setAcceptedAds] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [errorText, setErrorText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const canSubmit = useMemo(() => {
    return fullName.trim().length > 1 && /.+@.+\..+/.test(email.trim()) && acceptedPersonalData && acceptedAds;
  }, [fullName, email, acceptedPersonalData, acceptedAds]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || status === "loading") return;

    setStatus("loading");
    setErrorText("");

    try {
      const response = await fetch("/api/marketing/guide-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          accepted_personal_data: acceptedPersonalData,
          accepted_ads: acceptedAds,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json?.ok) {
        setStatus("error");
        setErrorText(typeof json?.error === "string" ? json.error : "Не удалось отправить заявку.");
        return;
      }

      setPdfUrl(typeof json?.pdf_url === "string" ? json.pdf_url : "");
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorText("Ошибка сети. Попробуйте ещё раз.");
    }
  }

  return (
      <main className="shell" style={{ marginBottom: -400 }}>
        <section
            className="card ambient"
            style={{ width: "100%", maxWidth: 780, marginTop: -400 }}
        >
        <h1 className="h1" style={{ marginTop: 0, marginBottom: 8 }}>Путеводитель «Уран в Близнецах»</h1>


        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Имя</span>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ваше имя"
              required
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ваш email"
              required
            />
          </label>

          <div style={{ display: "grid", gap: 10, marginTop: 4, fontSize: 14 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={acceptedPersonalData}
                onChange={(e) => setAcceptedPersonalData(e.target.checked)}
                required
                style={{ marginTop: 2 }}
              />
              <span>
                Я даю согласие на <a className="link" href={legalLinks.personalData} target="_blank" rel="noopener noreferrer">обработку персональных данных</a>.
              </span>
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={acceptedAds}
                onChange={(e) => setAcceptedAds(e.target.checked)}
                required
                style={{ marginTop: 2 }}
              />
              <span>
                Я согласен(а) на <a className="link" href={legalLinks.ads} target="_blank" rel="noopener noreferrer">получение рекламно-информационных сообщений</a>.
              </span>
            </label>
          </div>

          <button type="submit" disabled={!canSubmit || status === "loading"} className="btn btnPrimary" style={{ marginTop: 6 }}>
            {status === "loading" ? "Отправляем…" : "Получить путеводитель"}
          </button>
        </form>

        {status === "error" && <p style={{ marginTop: 14, color: "#fda4af" }}>{errorText}</p>}

        {status === "success" && (
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: "#86efac" }}>
              Готово! Мы отправили путеводитель на {email.trim()}.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="btn">
                Открыть путеводитель
              </a>
              <a href={pdfUrl} download className="btn">
                Скачать путеводитель
              </a>
            </div>
          </div>
        )}


      </section>
    </main>
  );
}
