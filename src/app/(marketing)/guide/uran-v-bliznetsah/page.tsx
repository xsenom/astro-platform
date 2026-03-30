"use client";

import { FormEvent, useMemo, useState } from "react";
import { legalLinks } from "@/lib/email/shared-footer";

type SubmitState = "idle" | "loading" | "success" | "error";

type GuideResponse = {
    ok?: boolean;
    pdf_url?: string;
    error?: string;
    email_sent?: boolean;
    email_error?: string;
};

export default function UranGuideLeadPage() {
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
    const [acceptedAds, setAcceptedAds] = useState(false);
    const [status, setStatus] = useState<SubmitState>("idle");
    const [errorText, setErrorText] = useState("");
    const [pdfUrl, setPdfUrl] = useState("");

    const canSubmit = useMemo(() => {
        return (
            fullName.trim().length > 1 &&
            /.+@.+\..+/.test(email.trim()) &&
            acceptedPersonalData &&
            acceptedAds
        );
    }, [fullName, email, acceptedPersonalData, acceptedAds]);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!canSubmit || status === "loading" || status === "success") return;

        setStatus("loading");
        setErrorText("");

        try {
            const payload = {
                full_name: fullName.trim(),
                email: email.trim(),
                accepted_personal_data: acceptedPersonalData,
                accepted_ads: acceptedAds,
            };

            const response = await fetch("/api/marketing/guide-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const rawText = await response.text();
            let json: GuideResponse | null = null;

            try {
                json = rawText ? JSON.parse(rawText) : null;
            } catch {
                json = null;
            }

            if (!response.ok || !json?.ok) {
                setStatus("error");
                setErrorText(
                    typeof json?.error === "string"
                        ? json.error
                        : "Не удалось отправить заявку."
                );
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
        <>
            <main className="shell uranGuideShell">
                <section className="card ambient uranGuideCard">
                    <h1 className="h1 uranGuideTitle">Путеводитель «Уран в Близнецах»EST GUIDE 777</h1>

                    {status !== "success" && (
                        <form onSubmit={onSubmit} className="uranGuideForm">
                            <label className="uranGuideField">
                                <span>Имя</span>
                                <input
                                    className="input"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Ваше имя"
                                    autoComplete="name"
                                    required
                                />
                            </label>

                            <label className="uranGuideField">
                                <span>Email</span>
                                <input
                                    className="input"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ваш email"
                                    autoComplete="email"
                                    inputMode="email"
                                    required
                                />
                            </label>

                            <div className="uranGuideChecksWrap">
                                <div className="uranGuideCheckBlock">
                                    <label className="uranGuideCheckRow">
                                        <input
                                            className="uranGuideCheckbox"
                                            type="checkbox"
                                            checked={acceptedPersonalData}
                                            onChange={(e) => setAcceptedPersonalData(e.target.checked)}
                                            required
                                        />
                                        <span className="uranGuideCheckText">
                      Я даю согласие на{" "}
                                            <a
                                                className="link"
                                                href={legalLinks.personalData}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                        обработку персональных данных
                      </a>
                      .
                    </span>
                                    </label>
                                </div>

                                <div className="uranGuideCheckBlock">
                                    <label className="uranGuideCheckRow">
                                        <input
                                            className="uranGuideCheckbox"
                                            type="checkbox"
                                            checked={acceptedAds}
                                            onChange={(e) => setAcceptedAds(e.target.checked)}
                                            required
                                        />
                                        <span className="uranGuideCheckText">
                      Я согласен(а) на{" "}
                                            <a
                                                className="link"
                                                href={legalLinks.ads}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                        получение рекламно-информационных сообщений
                      </a>
                      .
                    </span>
                                    </label>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={!canSubmit || status === "loading"}
                                className="btn btnPrimary uranGuideSubmit"
                            >
                                {status === "loading" ? "Отправляем…" : "Получить путеводитель"}
                            </button>
                        </form>
                    )}

                    {status === "error" && (
                        <p className="uranGuideError">{errorText}</p>
                    )}

                    {status === "success" && (
                        <div className="uranGuideSuccess">
                            <p className="uranGuideSuccessText">
                                Готово! Мы также продублировали путеводитель на почту{" "}
                                {email.trim()}.Проверьте папку спам.
                            </p>

                            <div className="uranGuideActions">
                                <a
                                    href={pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="uranGuideActionBtn"
                                >
                                    Открыть путеводитель
                                </a>

                                <a href={pdfUrl} download className="uranGuideActionBtn">
                                    Скачать путеводитель
                                </a>
                            </div>
                        </div>
                    )}
                </section>
            </main>

            <style jsx>{`
                .uranGuideShell {
                    padding-top: 16px !important;
                    padding-bottom: 0 !important;
                    min-height: auto !important;
                }

                .uranGuideCard {
                    width: 100% !important;
                    max-width: 560px !important;
                    margin: 0 auto !important;
                }

                .uranGuideTitle {
                    margin: 0 0 18px !important;
                    line-height: 1.05 !important;
                }

                .uranGuideForm {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 14px !important;
                    width: 100% !important;
                }

                .uranGuideField {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 8px !important;
                    width: 100% !important;
                }

                .uranGuideChecksWrap {
                    display: flex !important;
                    flex-direction: column !important;
                    width: 100% !important;
                    margin-top: 52px !important;
                    margin-bottom: 46px !important;
                    padding: 18px 16px !important;
                    border-radius: 14px !important;
                    background: rgba(255, 255, 255, 0.03) !important;
                    border: 1px solid rgba(255, 255, 255, 0.06) !important;
                }

                .uranGuideCheckBlock {
                    display: block !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .uranGuideCheckBlock + .uranGuideCheckBlock {
                    margin-top: 16px !important;
                }

                .uranGuideCheckRow {
                    display: flex !important;
                    flex-direction: row !important;
                    align-items: flex-start !important;
                    gap: 12px !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .uranGuideCheckbox {
                    display: block !important;
                    width: 18px !important;
                    min-width: 18px !important;
                    height: 18px !important;
                    flex: 0 0 18px !important;
                    margin: 3px 0 0 0 !important;
                }

                .uranGuideCheckText {
                    display: block !important;
                    flex: 1 1 auto !important;
                    min-width: 0 !important;
                    margin: 0 !important;
                    font-size: 16px !important;
                    line-height: 1.55 !important;
                    white-space: normal !important;
                    word-break: break-word !important;
                    overflow-wrap: anywhere !important;
                }

                .uranGuideSubmit {
                    margin-top: 14px !important;
                }

                .uranGuideError {
                    margin-top: 14px !important;
                    color: #fca5a5 !important;
                    line-height: 1.45 !important;
                }

                .uranGuideSuccess {
                    margin-top: 14px !important;
                    display: grid !important;
                    gap: 12px !important;
                }

                .uranGuideSuccessText {
                    margin: 0 !important;
                    color: #86efac !important;
                    line-height: 1.45 !important;
                    word-break: break-word !important;
                }

                .uranGuideActions {
                    display: flex !important;
                    gap: 10px !important;
                    flex-wrap: wrap !important;
                }

                .uranGuideActionBtn {
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    min-height: 46px !important;
                    padding: 12px 18px !important;
                    border-radius: 14px !important;
                    text-decoration: none !important;
                    font-weight: 600 !important;
                    line-height: 1.1 !important;
                    color: #3b2d12 !important;
                    background: #f0d48a !important;
                    border: 1px solid rgba(240, 212, 138, 0.95) !important;
                    white-space: nowrap !important;
                }

                @media (max-width: 640px) {
                    .uranGuideShell {
                        padding-top: 14px !important;
                    }

                    .uranGuideCard {
                        max-width: 100% !important;
                    }

                    .uranGuideChecksWrap {
                        margin-top: 28px !important;
                        margin-bottom: 26px !important;
                        padding: 12px 12px !important;
                    }

                    .uranGuideCheckBlock + .uranGuideCheckBlock {
                        margin-top: 12px !important;
                    }

                    .uranGuideCheckText {
                        font-size: 13px !important;
                    }

                    .uranGuideSubmit {
                        margin-top: 12px !important;
                    }

                    .uranGuideActions {
                        flex-direction: column !important;
                    }

                    .uranGuideActionBtn {
                        width: 100% !important;
                        white-space: normal !important;
                        text-align: center !important;
                    }
                }
            `}</style>
        </>
    );
}
