"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordClient() {
    const searchParams = useSearchParams();
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [tokenReady, setTokenReady] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    const canSubmit = !!password && password.length >= 6 && password === password2;
    const tokenHash = searchParams.get("token_hash");

    useEffect(() => {
        let mounted = true;

        async function verifyRecoveryToken() {
            if (!tokenHash) {
                const { data } = await supabase.auth.getSession();
                if (!mounted) return;
                if (data.session) {
                    setTokenReady(true);
                    return;
                }
                setTokenError("Ссылка для сброса пароля недействительна или устарела.");
                return;
            }

            const { error } = await supabase.auth.verifyOtp({
                type: "recovery",
                token_hash: tokenHash,
            });

            if (!mounted) return;
            if (error) {
                setTokenError("Ссылка для сброса пароля недействительна или устарела.");
                return;
            }

            setTokenReady(true);
        }

        void verifyRecoveryToken();

        return () => {
            mounted = false;
        };
    }, [tokenHash]);

    async function saveNewPassword() {
        if (!canSubmit) {
            setMsg("Пароли не совпадают или слишком короткие.");
            return;
        }

        setLoading(true);
        setMsg(null);

        const { error } = await supabase.auth.updateUser({ password });

        setLoading(false);

        if (error) {
            setMsg("Не удалось изменить пароль. Откройте ссылку из письма ещё раз или запросите новый сброс.");
            return;
        }

        setMsg("Пароль успешно обновлён. Теперь можно войти с новым паролем.");
        setPassword("");
        setPassword2("");
    }

    return (
        <div className="shell">
            <div className="window ambient" style={{ maxWidth: 620 }}>
                <div className="titlebar">
                    <div className="title" style={{ marginLeft: 10 }}>Сброс пароля</div>
                </div>

                <div className="content" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="main">
                        <div className="card" style={{ display: "grid", gap: 12 }}>
                            <div className="h1">Новый пароль</div>
                            <div className="muted">
                                Введите новый пароль. Страница должна быть открыта по ссылке из письма для сброса пароля.
                            </div>

                            <label style={{ display: "grid", gap: 6 }}>
                                <span className="muted">Новый пароль</span>
                                <input
                                    className="input"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    placeholder="Минимум 6 символов"
                                />
                            </label>

                            <label style={{ display: "grid", gap: 6 }}>
                                <span className="muted">Повторите пароль</span>
                                <input
                                    className="input"
                                    type="password"
                                    value={password2}
                                    onChange={(e) => setPassword2(e.target.value)}
                                    autoComplete="new-password"
                                    placeholder="Повторите новый пароль"
                                />
                            </label>

                            <button
                                className={`astroTab ${canSubmit && !loading ? "astroTab--beigeBright" : "astroTab--beigeDim"}`}
                                onClick={saveNewPassword}
                                disabled={!canSubmit || loading || !tokenReady}
                                style={{ justifyContent: "center" }}
                            >
                                {loading ? "Сохраняю…" : "Сохранить новый пароль"}
                            </button>

                            <a href="/login" className="muted" style={{ textAlign: "center" }}>
                                Вернуться ко входу
                            </a>

                            {tokenError && <div className="muted">{tokenError}</div>}
                            {msg && <div className="muted">{msg}</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
