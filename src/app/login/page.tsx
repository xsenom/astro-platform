"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

function supabaseErrorRu(message: string, context: "signin" | "signup" | "reset" = "signin") {
    const m = (message || "").toLowerCase().trim();

    if (m.includes("invalid login credentials")) return "Неверный email или пароль.";
    if (m.includes("email not confirmed")) return "Подтвердите email по ссылке в письме.";
    if (m.includes("user already registered")) return "Пользователь с таким email уже зарегистрирован.";
    if (m.includes("password should be at least")) return "Пароль слишком короткий. Минимум 6 символов.";
    if (m.includes("invalid email")) return "Некорректный email.";
    if (m.includes("signup is disabled")) return "Регистрация временно отключена.";

    if (m.includes("too many requests") || m.includes("rate limit")) {
        return "Слишком много попыток. Попробуйте позже.";
    }

    if (m.includes("email rate limit exceeded")) return "Слишком много писем. Попробуйте позже.";
    if (m.includes("user not found")) return "Пользователь не найден.";

    if (m.includes("database error querying schema")) {
        return "Ошибка запроса к базе данных. Проверьте настройки Supabase (схема/права доступа) и повторите попытку.";
    }
    if (m.includes("database error")) {
        return "Ошибка базы данных. Проверьте подключение и права доступа в Supabase.";
    }

    if (context === "reset") {
        if (m.includes("redirect") && (m.includes("invalid") || m.includes("not allowed"))) {
            return "Ссылка для сброса отклонена. Добавьте URL сброса пароля в Supabase Auth → URL Configuration.";
        }
        if (m.includes("email") && m.includes("not confirmed")) {
            return "Email не подтверждён. Подтвердите почту и повторите сброс.";
        }
        if (m.includes("smtp") || m.includes("send") || m.includes("email") || m.includes("mailer")) {
            return "Не удалось отправить письмо. Проверьте SMTP и Email settings в Supabase.";
        }
    }

    if (m.includes("invalid") && m.includes("email")) return "Некорректный email.";

    return "Произошла внутренняя ошибка сервиса авторизации. Проверьте настройки Supabase и попробуйте ещё раз позже.";
}


function EyeIcon({ open }: { open: boolean }) {
    return open ? (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M12 5c-5.5 0-9.5 4.5-10.8 6.4a1.2 1.2 0 0 0 0 1.2C2.5 14.5 6.5 19 12 19s9.5-4.5 10.8-6.4a1.2 1.2 0 0 0 0-1.2C21.5 9.5 17.5 5 12 5Zm0 12c-3.3 0-6-2.7-6-5s2.7-5 6-5 6 2.7 6 5-2.7 5-6 5Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
            />
        </svg>
    ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M3.3 2.3 2 3.6l3 3C3 8.2 1.7 10 1.2 10.8a1.2 1.2 0 0 0 0 1.2C2.5 14 6.5 19 12 19c2 0 3.8-.6 5.4-1.5l3 3 1.3-1.3L3.3 2.3ZM12 17c-3.9 0-7.1-3.1-8.7-5 0 0 1.1-1.6 3-3.1l2.1 2.1A4.9 4.9 0 0 0 8 12a4 4 0 0 0 5.6 3.6l1.5 1.5c-1 .5-2 .9-3.1.9Zm.1-3.9a2 2 0 0 1-2.2-2.2l2.2 2.2Zm3.8 1.1-2-2A4 4 0 0 0 11.8 8l-2-2C10.5 5.7 11.2 5 12 5c5.5 0 9.5 4.5 10.8 6.4a1.2 1.2 0 0 1 0 1.2c-.7 1.1-2 2.7-3.7 4Z"
            />
        </svg>
    );
}

type PasswordFieldProps = {
    label: string;
    value: string;
    onChange: (v: string) => void;
    visible: boolean;
    onToggleVisible: () => void;
    autoComplete?: string;
    placeholder?: string;
};

function PasswordField({
                           label,
                           value,
                           onChange,
                           visible,
                           onToggleVisible,
                           autoComplete,
                           placeholder,
                       }: PasswordFieldProps) {
    return (
        <label style={{ display: "grid", gap: 6 }}>
            <span className="muted">{label}</span>

            <div style={{ position: "relative" }}>
                <input
                    className="input"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder || label}
                    type={visible ? "text" : "password"}
                    autoComplete={autoComplete}
                    style={{ paddingRight: 44 }}
                />

                <button
                    type="button"
                    onClick={onToggleVisible}
                    aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                    title={visible ? "Скрыть пароль" : "Показать пароль"}
                    style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        border: "1px solid rgba(245,240,233,.12)",
                        background: "rgba(245,240,233,.06)",
                        color: "rgba(245,240,233,.85)",
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        padding: 0,
                    }}
                >
                    <EyeIcon open={visible} />
                </button>
            </div>
        </label>
    );
}

export default function LoginPage() {
    const [mode, setMode] = useState<Mode>("signin");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showPassword2, setShowPassword2] = useState(false);

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const isSignup = mode === "signup";
    const isReset = mode === "reset";

    // валидность действий
    const canSignIn = useMemo(() => {
        return mode === "signin" && !!email && !!password;
    }, [mode, email, password]);

    const canSignUp = useMemo(() => {
        if (mode !== "signup") return false;
        if (!email || !password || !password2) return false;
        return password === password2;
    }, [mode, email, password, password2]);

    const canReset = useMemo(() => {
        return mode === "reset" && !!email;
    }, [mode, email]);

    async function signIn() {
        setMsg(null);
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        setLoading(false);

        if (error) {
            console.error("[auth:signin]", error);
            setMsg(`Ошибка входа: ${supabaseErrorRu(error.message, "signin")}`);
            return;
        }

        window.location.href = "/cabinet";
    }

    async function signUp() {
        setMsg(null);

        if (password !== password2) {
            setMsg("Пароли не совпадают.");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({ email, password });
        setLoading(false);

        if (error) {
            console.error("[auth:signup]", error);
            setMsg(`Ошибка регистрации: ${supabaseErrorRu(error.message, "signup")}`);
            return;
        }

        setMsg("Аккаунт создан. Теперь выполните вход.");
        setMode("signin");
        setPassword("");
        setPassword2("");
        setShowPassword(false);
        setShowPassword2(false);
    }

    async function resetPassword() {
        setMsg(null);
        setLoading(true);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

        setLoading(false);

        if (error) {
            console.error("[auth:reset]", error);
            setMsg(`Ошибка сброса пароля: ${supabaseErrorRu(error.message, "reset")}`);
            return;
        }

        setMsg("Если email существует — мы отправили письмо для сброса пароля.");
        setMode("signin");
    }

    // классы вкладок:
    // - активная вкладка: bright/dim в зависимости от валидности
    // - неактивная: idle
    const signInTabClass =
        mode === "signin"
            ? `astroTab ${canSignIn ? "astroTab--beigeBright" : "astroTab--beigeDim"}`
            : "astroTab astroTab--idle";

    const signUpTabClass =
        mode === "signup"
            ? `astroTab ${canSignUp ? "astroTab--beigeBright" : "astroTab--beigeDim"}`
            : "astroTab astroTab--idle";

    return (
        <div className="shell">
            <div className="window ambient" style={{ maxWidth: 920 }}>
                {/* TITLEBAR */}
                <div className="titlebar">
                    <div className="phaseDots" aria-hidden="true">
                        <span className="phaseDot d1" />
                        <span className="phaseDot d2" />
                        <span className="phaseDot d3" />
                    </div>

                    <div className="title" style={{ marginLeft: 10 }}>
                        Авторизация
                    </div>
                </div>

                {/* CONTENT */}
                <div className="content" style={{ gridTemplateColumns: "1fr" }}>
                    <div className="main">
                        <div className="card">
                            <div className="h1">
                                {isReset ? "Сброс пароля" : isSignup ? "Регистрация" : "Вход"}
                            </div>

                            <div className="muted" style={{ marginTop: 6 }}>
                                {isReset
                                    ? "Введите email. Мы отправим ссылку для сброса пароля."
                                    : "Войдите или зарегистрируйтесь, чтобы открыть личный кабинет."}
                            </div>

                            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                                {/* EMAIL */}
                                <label style={{ display: "grid", gap: 6 }}>
                                    <span className="muted">Email</span>
                                    <input
                                        className="input"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value.trim())}
                                        placeholder="Email"
                                        inputMode="email"
                                        autoComplete="email"
                                    />
                                </label>

                                {/* PASSWORD */}
                                {!isReset && (
                                    <PasswordField
                                        label="Пароль"
                                        value={password}
                                        onChange={setPassword}
                                        visible={showPassword}
                                        onToggleVisible={() => setShowPassword((v) => !v)}
                                        autoComplete={isSignup ? "new-password" : "current-password"}
                                        placeholder="Пароль"
                                    />
                                )}

                                {/* PASSWORD2 */}
                                {isSignup && (
                                    <PasswordField
                                        label="Повторите пароль"
                                        value={password2}
                                        onChange={setPassword2}
                                        visible={showPassword2}
                                        onToggleVisible={() => setShowPassword2((v) => !v)}
                                        autoComplete="new-password"
                                        placeholder="Повторите пароль"
                                    />
                                )}

                                {/* Forgot password link */}
                                {!isReset && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMsg(null);
                                            setMode("reset");
                                            setPassword("");
                                            setPassword2("");
                                            setShowPassword(false);
                                            setShowPassword2(false);
                                        }}
                                        style={{
                                            display: "inline-flex",
                                            width: "fit-content",
                                            background: "transparent",
                                            border: "none",
                                            padding: 0,
                                            marginTop: 2,
                                            color: "rgba(224,197,143,.92)",
                                            fontSize: 12,
                                            cursor: "pointer",
                                            textDecoration: "underline",
                                            textUnderlineOffset: 4,
                                            opacity: 0.95,
                                        }}
                                    >
                                        Забыли пароль?
                                    </button>
                                )}

                                {/* ACTION BUTTONS */}
                                {!isReset ? (
                                    <div className="astroTabs">
                                        {/* ВХОД */}
                                        <button
                                            className={signInTabClass}
                                            type="button"
                                            disabled={loading || (mode === "signin" && !canSignIn)}
                                            onClick={() => {
                                                setMsg(null);

                                                // если мы НЕ в режиме входа — просто переключаем вкладку
                                                if (mode !== "signin") {
                                                    setMode("signin");
                                                    setPassword2("");
                                                    return;
                                                }

                                                // если уже в режиме входа — выполняем вход
                                                if (canSignIn && !loading) signIn();
                                            }}
                                        >
                                            {loading && mode === "signin" ? "Входим…" : "Вход"}
                                        </button>

                                        {/* РЕГИСТРАЦИЯ */}
                                        <button
                                            className={signUpTabClass}
                                            type="button"
                                            disabled={loading || (mode === "signup" && !canSignUp)}
                                            onClick={() => {
                                                setMsg(null);

                                                // если мы НЕ в режиме регистрации — просто переключаем вкладку
                                                if (mode !== "signup") {
                                                    setMode("signup");
                                                    return;
                                                }

                                                // если уже в режиме регистрации — регистрируем
                                                if (canSignUp && !loading) signUp();
                                            }}
                                        >
                                            {loading && mode === "signup" ? "Создаём…" : "Регистрация"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="astroTabs">
                                        <button
                                            className={`astroTab ${
                                                canReset ? "astroTab--beigeBright" : "astroTab--beigeDim"
                                            }`}
                                            type="button"
                                            disabled={loading || !canReset}
                                            onClick={() => {
                                                if (canReset && !loading) resetPassword();
                                            }}
                                        >
                                            {loading ? "Отправляем…" : "Сбросить пароль"}
                                        </button>

                                        <button
                                            className="astroTab astroTab--idle"
                                            type="button"
                                            disabled={loading}
                                            onClick={() => {
                                                setMsg(null);
                                                setMode("signin");
                                            }}
                                        >
                                            Вход
                                        </button>
                                    </div>
                                )}

                                {msg && (
                                    <div
                                        style={{
                                            marginTop: 8,
                                            padding: 12,
                                            borderRadius: 14,
                                            border: "1px solid rgba(245,240,233,.12)",
                                            background: "rgba(245,240,233,.06)",
                                        }}
                                    >
                                        {msg}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
