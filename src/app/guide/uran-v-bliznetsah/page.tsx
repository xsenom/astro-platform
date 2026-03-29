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
    <main style={{ minHeight: "100vh", padding: "48px 20px", display: "grid", placeItems: "center" }}>
      <section
        style={{
          width: "100%",
          maxWidth: 640,
          background: "rgba(15, 23, 42, 0.7)",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: 20,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Путеводитель «Уран в Близнецах»</h1>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          Оставьте имя и email, подтвердите политику конфиденциальности — и получите доступ к PDF.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 18 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Имя</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ваше имя"
              required
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #64748b", background: "#0b1220" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #64748b", background: "#0b1220" }}
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
                Я даю согласие на <Link href="/privacy">обработку персональных данных</Link>.
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
              <span>Я согласен(а) на получение рекламы и рекламной информации.</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || status === "loading"}
            style={{
              marginTop: 6,
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
              background: canSubmit ? "#6366f1" : "#475569",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            {status === "loading" ? "Отправляем…" : "Получить путеводитель"}
          </button>
        </form>

        {status === "error" && <p style={{ marginTop: 14, color: "#fda4af" }}>{errorText}</p>}

        <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,.25)", fontSize: 13, opacity: 0.9 }}>
          <div style={{ marginBottom: 6 }}>Документы:</div>
          <div style={{ display: "grid", gap: 4 }}>
            <a href={legalLinks.privacy} target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a>
            <a href={legalLinks.agreement} target="_blank" rel="noopener noreferrer">Пользовательское соглашение</a>
            <a href={legalLinks.personalData} target="_blank" rel="noopener noreferrer">Согласие на обработку персональных данных</a>
            <a href={legalLinks.ads} target="_blank" rel="noopener noreferrer">Согласие на получение рекламно-информационных сообщений</a>
          </div>
        </div>

        {status === "success" && (
          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: "#86efac" }}>
              Готово! Мы отправили путеводитель на {email.trim()}.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #64748b",
                  textDecoration: "none",
                }}
              >
                Открыть путеводитель
              </a>
              <a
                href={pdfUrl}
                download
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #64748b",
                  textDecoration: "none",
                }}
              >
                Скачать путеводитель
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
