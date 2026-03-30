"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type DashboardPayload = {
    ok: boolean;
    email_totals: {
        campaigns_total: number;
        recipients_total: number;
        sent_total: number;
        failed_total: number;
        opened_total: number;
        clicked_total: number;
        unsubscribed_total: number;
        delivered_events_total: number;
        opened_events_total: number;
        clicked_events_total: number;
        unsubscribed_events_total: number;
    };
    guide_totals: {
        requested_total: number;
        sent_total: number;
        failed_total: number;
        unsubscribed_total: number;
    };
    guide_by_day: Array<{
        day: string;
        requested: number;
        sent: number;
        failed: number;
    }>;
    campaigns: Array<{
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
    }>;
};

export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<DashboardPayload | null>(null);

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

            const dashboardRes = await fetch("/api/admin/mailing-dashboard", {
                headers: { Authorization: `Bearer ${token}` },
            });
            const dashboardJson = await dashboardRes.json().catch(() => null);
            if (!dashboardRes.ok || !dashboardJson?.ok) {
                throw new Error(dashboardJson?.error || "Не удалось загрузить дашборд рассылок.");
            }

            if (!active) return;
            setData(dashboardJson as DashboardPayload);
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

    const emailChart = useMemo(() => {
        if (!data) return [] as Array<{ label: string; value: number }>;
        return [
            { label: "Доставлено", value: data.email_totals.delivered_events_total },
            { label: "Открыто", value: data.email_totals.opened_events_total },
            { label: "Клики", value: data.email_totals.clicked_events_total },
            { label: "Отписки", value: data.email_totals.unsubscribed_events_total },
        ];
    }, [data]);

    return (
        <main className="shell" style={{ display: "grid", gap: 16 }}>
            <section className="card ambient" style={{ display: "grid", gap: 10 }}>
                <h1 className="h1" style={{ margin: 0 }}>Дашборд рассылок</h1>
                {loading && <p className="muted" style={{ margin: 0 }}>Загрузка...</p>}
                {error && <p style={{ margin: 0, color: "#ff8d8d" }}>{error}</p>}

                {data && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        <Metric label="Всего кампаний" value={data.email_totals.campaigns_total} />
                        <Metric label="Получателей" value={data.email_totals.recipients_total} />
                        <Metric label="Отправлено" value={data.email_totals.sent_total} />
                        <Metric label="Ошибок отправки" value={data.email_totals.failed_total} />
                        <Metric label="Открытий" value={data.email_totals.opened_events_total} />
                        <Metric label="Отписок" value={data.email_totals.unsubscribed_events_total} />
                    </div>
                )}
            </section>

            <section className="card ambient" style={{ display: "grid", gap: 10 }}>
                <h2 style={{ margin: 0 }}>График по рассылкам</h2>
                <SimpleBars items={emailChart} color="rgba(120,230,255,.65)" />
            </section>

            <section className="card ambient" style={{ display: "grid", gap: 10 }}>
                <h2 style={{ margin: 0 }}>Уран в Близнецах — воронка</h2>
                {data && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                        <Metric label="Запросов путеводителя" value={data.guide_totals.requested_total} />
                        <Metric label="Писем отправлено" value={data.guide_totals.sent_total} />
                        <Metric label="Ошибок отправки" value={data.guide_totals.failed_total} />
                        <Metric label="Отписались" value={data.guide_totals.unsubscribed_total} />
                    </div>
                )}

                <h3 style={{ margin: "8px 0 0", fontSize: 16 }}>Динамика по дням (30 дней)</h3>
                <GuideTrend rows={data?.guide_by_day ?? []} />
            </section>

            <section className="card ambient" style={{ display: "grid", gap: 8 }}>
                <h2 style={{ margin: 0 }}>Последние кампании</h2>
                {(data?.campaigns ?? []).slice(0, 20).map((campaign) => (
                    <div key={campaign.id} style={{ border: "1px solid rgba(224,197,143,.12)", borderRadius: 12, padding: 10 }}>
                        <div style={{ fontWeight: 800 }}>{campaign.subject}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                            {new Date(campaign.created_at).toLocaleString("ru-RU")} · {campaign.status}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 6 }}>
                            Получателей: {campaign.recipients_count} · Отправлено: {campaign.sent_count} · Ошибок: {campaign.failed_count} · Открыто: {campaign.opened_count} · Клики: {campaign.clicked_count} · Отписки: {campaign.unsubscribed_count}
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

function SimpleBars({ items, color }: { items: Array<{ label: string; value: number }>; color: string }) {
    const max = Math.max(...items.map((item) => item.value), 1);

    return (
        <div style={{ display: "grid", gap: 8 }}>
            {items.map((item) => (
                <div key={item.label} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                        <div style={{ width: `${(item.value / max) * 100}%`, height: "100%", background: color }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function GuideTrend({ rows }: { rows: Array<{ day: string; requested: number; sent: number; failed: number }> }) {
    if (!rows.length) {
        return <p className="muted" style={{ margin: 0 }}>Пока нет данных по заявкам путеводителя.</p>;
    }

    const max = Math.max(...rows.map((row) => Math.max(row.requested, row.sent, row.failed)), 1);

    return (
        <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 760, display: "grid", gap: 8 }}>
                {rows.map((row) => (
                    <div key={row.day} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, alignItems: "center" }}>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>{row.day}</div>
                        <div style={{ display: "grid", gap: 4 }}>
                            <Bar label="Запрос" value={row.requested} max={max} color="rgba(224,197,143,.85)" />
                            <Bar label="Отправлено" value={row.sent} max={max} color="rgba(120,230,255,.8)" />
                            <Bar label="Ошибки" value={row.failed} max={max} color="rgba(255,120,120,.8)" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 42px", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12 }}>{label}</span>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color }} />
            </div>
            <span style={{ fontSize: 12, textAlign: "right" }}>{value}</span>
        </div>
    );
}
