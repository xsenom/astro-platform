"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type SubmitState = "idle" | "loading" | "success" | "error";

export default function UranGuideLeadPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [errorText, setErrorText] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  const canSubmit = useMemo(() => {
    return fullName.trim().length > 1 && /.+@.+\..+/.test(email.trim()) && acceptedPrivacy;
  }, [fullName, email, acceptedPrivacy]);

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
          accepted_privacy: acceptedPrivacy,
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

          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={acceptedPrivacy}
              onChange={(e) => setAcceptedPrivacy(e.target.checked)}
              required
              style={{ marginTop: 2 }}
            />
            <span>
              Я соглашаюсь с <Link href="/privacy">политикой конфиденциальности</Link>.
            </span>
          </label>

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
