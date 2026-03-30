"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type DashboardStats = {
    total_revenue_cents: number;
    total_paid_orders: number;
    average_check_cents: number;
    total_related_profiles: number;
    total_marketing_contacts: number;
    email_opened: number;
    email_delivered: number;
    email_failed: number;
    email_clicked: number;
    email_unsubscribed: number;
};

type Campaign = {
    id: string;
    created_at: string;
    subject: string;
    status: string;
    recipients_count: number;
    sent_count: number;
    failed_count: number;
    opened_count: number;
    clicked_count: number;
    unsubscribed_count: number;
};

export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);

    useEffect(() => {
        let active = true;

        async function load() {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) {
                window.location.href = "/admin/login";
                return;
            }

            const meRes = await fetch("/api/admin/me", { headers: { Authorization: `Bearer ${token}` } });
            const meJson = await meRes.json().catch(() => null);
            if (!meRes.ok || !meJson?.is_admin) {
                window.location.href = "/admin/login";
                return;
            }

            const summaryRes = await fetch("/api/admin/summary", { headers: { Authorization: `Bearer ${token}` } });
            const summaryJson = await summaryRes.json().catch(() => null);
            if (!summaryRes.ok || !summaryJson?.ok) {
                throw new Error(summaryJson?.error || "Не удалось загрузить дашборд.");
            }

            if (!active) return;
            setStats(summaryJson.dashboard_stats ?? null);
            setCampaigns(Array.isArray(summaryJson.email_campaigns) ? summaryJson.email_campaigns : []);
            setLoading(false);
        }

        load().catch((e) => {
            if (!active) return;
            setError(e instanceof Error ? e.message : "Ошибка загрузки.");
            setLoading(false);
        });

        return () => {
            active = false;
        };
    }, []);

    return (
        <main className="shell" style={{ display: "grid", gap: 16 }}>
            <section className="card ambient" style={{ display: "grid", gap: 10 }}>
                <h1 className="h1" style={{ margin: 0 }}>Админ-дашборд статистики</h1>
                {loading && <p className="muted" style={{ margin: 0 }}>Загрузка...</p>}
                {error && <p style={{ margin: 0, color: "#ff8d8d" }}>{error}</p>}
                {stats && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        <Metric label="Оплаченных заказов" value={stats.total_paid_orders} />
                        <Metric label="Выручка" value={`${(stats.total_revenue_cents / 100).toFixed(2)} ₽`} />
                        <Metric label="Открытия писем" value={stats.email_opened} />
                        <Metric label="Доставлено писем" value={stats.email_delivered} />
                        <Metric label="Отписки" value={stats.email_unsubscribed} />
                    </div>
                )}
            </section>

            <section className="card ambient" style={{ display: "grid", gap: 8 }}>
                <h2 style={{ margin: 0 }}>Последние рассылки</h2>
                {campaigns.slice(0, 20).map((campaign) => (
                    <div key={campaign.id} style={{ border: "1px solid rgba(224,197,143,.12)", borderRadius: 12, padding: 10 }}>
                        <div style={{ fontWeight: 800 }}>{campaign.subject}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                            {new Date(campaign.created_at).toLocaleString("ru-RU")} · {campaign.status}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 6 }}>
                            Получателей: {campaign.recipients_count} · Отправлено: {campaign.sent_count} · Ошибок: {campaign.failed_count} · Открыто: {campaign.opened_count} · Отписки: {campaign.unsubscribed_count}
                        </div>
                    </div>
                ))}
            </section>
        </main>
    );
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return (
        <div style={{ border: "1px solid rgba(224,197,143,.14)", borderRadius: 14, padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
        </div>
    );
}
