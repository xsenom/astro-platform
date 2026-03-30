"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AdminLoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!email.trim() || !password) return;

        setLoading(true);
        setError(null);

        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });

        if (signInError) {
            setError("Не удалось войти. Проверьте email и пароль.");
            setLoading(false);
            return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
            setError("Сессия не создана. Повторите вход.");
            setLoading(false);
            return;
        }

        const meRes = await fetch("/api/admin/me", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const meJson = await meRes.json().catch(() => null);

        if (!meRes.ok || !meJson?.is_admin) {
            setError("Этот аккаунт не имеет доступа к админ-дашборду.");
            await supabase.auth.signOut();
            setLoading(false);
            return;
        }

        window.location.href = "/admin/dashboard";
    }

    return (
        <main className="shell">
            <section className="card ambient" style={{ maxWidth: 520, margin: "0 auto", display: "grid", gap: 14 }}>
                <h1 className="h1" style={{ margin: 0 }}>Вход в админ-статистику</h1>
                <p className="muted" style={{ margin: 0 }}>
                    Отдельная страница для авторизации администраторов перед просмотром аналитики рассылок и пользователей.
                </p>

                <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
                    <input className="input" placeholder="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <input className="input" placeholder="Пароль" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    <button className="btn btnPrimary" type="submit" disabled={loading}>
                        {loading ? "Входим..." : "Войти"}
                    </button>
                </form>

                {error && <p style={{ margin: 0, color: "#ff8d8d" }}>{error}</p>}
            </section>
        </main>
    );
}
