"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ProfileRow = { id: string; email: string | null; full_name: string | null; updated_at: string | null };
type OrderRow = { id: string; user_id: string; status: string | null; amount_cents: number | null; currency: string | null; provider: string | null; provider_order_id: string | null; paid_at: string | null; created_at: string | null };
type CalculationRow = { id: string; user_id: string; calc_type_id?: string | null; status: string | null; created_at: string | null; updated_at: string | null };
type SupportThreadRow = { id: string; created_at: string; last_message_at: string; updated_at: string | null; user_id: string; category: string; subject: string; status: string };
type SupportMsgRow = { id: string; created_at: string; thread_id: string; author_user_id: string | null; author_admin_id: string | null; is_admin: boolean; message: string; attachment_url: string | null };
type IdRow = { id: string };
type SegmentKey = "all" | "paid" | "no_paid" | "calculations" | "inactive_30d" | "admins_test";
type EmailCampaignRow = { id: string; created_at: string; segment_key: SegmentKey; subject: string; status: string; recipients_count: number; sent_count: number; failed_count: number; created_by: string };
type EmailSegmentCounts = Record<SegmentKey, number>;

const SEGMENT_LABELS: Record<SegmentKey, string> = {
    all: "Вся база",
    paid: "Пользователи с оплатой",
    no_paid: "Без оплат",
    calculations: "Пользователи с расчётами",
    inactive_30d: "Неактивные 30 дней",
    admins_test: "Тест администраторам",
};

const LIVE_SEGMENTS: SegmentKey[] = ["all", "paid", "no_paid", "calculations", "inactive_30d"];

function PaperclipIcon({ size = 18 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.19 9.19a2 2 0 01-2.83-2.83l8.49-8.49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [tab, setTab] = useState<"users" | "orders" | "calcs" | "support" | "mail">("users");
    const [q, setQ] = useState("");
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [calcs, setCalcs] = useState<CalculationRow[]>([]);
    const [adminId, setAdminId] = useState<string | null>(null);
    const [threads, setThreads] = useState<SupportThreadRow[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<SupportMsgRow[]>([]);
    const [supportText, setSupportText] = useState("");
    const [supportSending, setSupportSending] = useState(false);
    const [supportFile, setSupportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaignRow[]>([]);
    const [emailSegments, setEmailSegments] = useState<EmailSegmentCounts>({ all: 0, paid: 0, no_paid: 0, calculations: 0, inactive_30d: 0, admins_test: 0 });
    const [selectedSegment, setSelectedSegment] = useState<SegmentKey>("all");
    const [mailSubject, setMailSubject] = useState("");
    const [mailHtml, setMailHtml] = useState("");
    const [mailText, setMailText] = useState("");
    const [mailSending, setMailSending] = useState(false);
    const [mailResult, setMailResult] = useState<string | null>(null);

    const filteredProfiles = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return profiles;
        return profiles.filter((p) => (p.email || "").toLowerCase().includes(s) || (p.full_name || "").toLowerCase().includes(s));
    }, [profiles, q]);

    const filteredOrders = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return orders;
        return orders.filter((o) => o.id.toLowerCase().includes(s) || o.user_id.toLowerCase().includes(s) || (o.provider_order_id || "").toLowerCase().includes(s));
    }, [orders, q]);

    const filteredCalcs = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return calcs;
        return calcs.filter((c) => c.id.toLowerCase().includes(s) || c.user_id.toLowerCase().includes(s) || String(c.calc_type_id || "").toLowerCase().includes(s));
    }, [calcs, q]);

    const filteredThreads = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return threads;
        return threads.filter((t) => t.id.toLowerCase().includes(s) || t.user_id.toLowerCase().includes(s) || (t.subject || "").toLowerCase().includes(s) || (t.category || "").toLowerCase().includes(s) || (t.status || "").toLowerCase().includes(s));
    }, [threads, q]);

    const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) ?? null, [threads, activeThreadId]);

    function scrollToBottom() {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }

    async function load() {
        setLoading(true);
        setErr(null);

        const token = await getAccessToken();
        if (!token) {
            window.location.href = "/login";
            return;
        }

        const { data: userData } = await supabase.auth.getUser();
        setAdminId(userData.user?.id ?? null);

        const res = await fetch("/api/admin/summary", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.ok) {
            if (res.status === 403) {
                window.location.href = "/cabinet";
                return;
            }
            setErr(json?.error || "Нет доступа (нужен админ).");
            setLoading(false);
            return;
        }

        setProfiles(json.profiles || []);
        setOrders(json.orders || []);
        setCalcs(json.calculations || []);
        setEmailCampaigns(json.email_campaigns || []);
        setEmailSegments(json.email_segments || { all: 0, paid: 0, no_paid: 0, calculations: 0, inactive_30d: 0, admins_test: 0 });
        await loadSupportThreads();
        setLoading(false);
    }

    useEffect(() => { void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function restartCalc(calcId: string) {
        setErr(null);
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/admin/restart-calc", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ calc_id: calcId }) });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            setErr(json?.error || "Не удалось перезапустить.");
            return;
        }
        setCalcs((prev) => prev.map((c) => (c.id === calcId ? { ...c, status: "queued" } : c)));
    }

    async function loadSupportThreads() {
        const { data, error } = await supabase.from("support_threads").select("id, created_at, last_message_at, updated_at, user_id, category, subject, status").order("last_message_at", { ascending: false });
        if (error) {
            setErr(error.message);
            return;
        }
        const list = (data ?? []) as SupportThreadRow[];
        setThreads(list);
        if (!activeThreadId && list[0]) setActiveThreadId(list[0].id);
    }

    async function loadSupportMessages(threadId: string) {
        const { data, error } = await supabase.from("support_messages").select("id, created_at, thread_id, author_user_id, author_admin_id, is_admin, message, attachment_url").eq("thread_id", threadId).order("created_at", { ascending: true });
        if (error) {
            setErr(error.message);
            return;
        }
        setMessages((data ?? []) as SupportMsgRow[]);
        setTimeout(scrollToBottom, 50);
    }

    useEffect(() => {
        if (tab !== "support" || !activeThreadId) return;
        void loadSupportMessages(activeThreadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, activeThreadId]);

    useEffect(() => {
        if (tab !== "support" || !activeThreadId) return;
        const channel = supabase.channel(`admin_support_messages_${activeThreadId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${activeThreadId}` }, (payload) => {
            const message = payload.new as SupportMsgRow;
            setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
            void loadSupportThreads();
            setTimeout(scrollToBottom, 20);
        }).subscribe();
        return () => { void supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, activeThreadId]);

    async function notifyTelegram(params: { thread_id: string; message_id: string }) {
        const token = await getAccessToken();
        if (!token) return;
        try {
            await fetch("/api/support/telegram", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(params) });
        } catch {}
    }

    async function uploadAttachmentAsAdmin(file: File, threadId: string) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return null;
        const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
        const path = `${uid}/${threadId}/${Date.now()}_${safeName}`;
        const { error } = await supabase.storage.from("support_attachments").upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
        if (error) {
            setErr(error.message);
            return null;
        }
        const { data } = supabase.storage.from("support_attachments").getPublicUrl(path);
        return data.publicUrl ?? null;
    }

    async function sendAdminMessage() {
        if (!activeThreadId) return;
        const body = supportText.trim();
        if (!body && !supportFile) return;
        setSupportSending(true);
        setErr(null);
        try {
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (!user) {
                window.location.href = "/login";
                return;
            }
            let attachmentUrl: string | null = null;
            if (supportFile) {
                attachmentUrl = await uploadAttachmentAsAdmin(supportFile, activeThreadId);
                if (!attachmentUrl) return;
            }
            const { data: message, error } = await supabase.from("support_messages").insert({ thread_id: activeThreadId, author_user_id: null, author_admin_id: user.id, is_admin: true, message: body || (attachmentUrl ? "📎 Файл" : ""), attachment_url: attachmentUrl }).select("id").single();
            if (error) {
                setErr(error.message);
                return;
            }
            await supabase.from("support_threads").update({ status: "waiting_user" }).eq("id", activeThreadId);
            await notifyTelegram({ thread_id: activeThreadId, message_id: (message as IdRow).id });
            setSupportText("");
            setSupportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setTimeout(scrollToBottom, 10);
        } finally {
            setSupportSending(false);
        }
    }

    async function sendEmailCampaign(testMode = false) {
        setErr(null);
        setMailResult(null);
        setMailSending(true);
        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }
            const res = await fetch("/api/admin/email-campaigns", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ segment_key: selectedSegment, subject: mailSubject, html: mailHtml, text: mailText, test_mode: testMode }) });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setErr(json?.error || "Не удалось отправить рассылку.");
                return;
            }
            setMailResult(testMode ? `Тестовая отправка админам: ${json.sent_count}/${json.recipients_count}, ошибок — ${json.failed_count}.` : `Готово: ${json.sent_count}/${json.recipients_count} писем отправлено, ошибок — ${json.failed_count}.`);
            setMailSubject("");
            setMailHtml("");
            setMailText("");
            await load();
            setTab("mail");
        } finally {
            setMailSending(false);
        }
    }

    if (loading) {
        return <div style={{ padding: 18, borderRadius: 18, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)" }}>Загрузка админ-панели…</div>;
    }

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)" }}>
                <div style={{ fontSize: 24, fontWeight: 950 }}>Админ-панель</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>Пользователи, покупки, расчёты, поддержка и email-рассылки по базе или сегментам.</div>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <TabButton active={tab === "users"} onClick={() => setTab("users")}>Пользователи</TabButton>
                    <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>Покупки</TabButton>
                    <TabButton active={tab === "calcs"} onClick={() => setTab("calcs")}>Прогнозы</TabButton>
                    <TabButton active={tab === "support"} onClick={() => setTab("support")}>Поддержка</TabButton>
                    <TabButton active={tab === "mail"} onClick={() => setTab("mail")}>Почта</TabButton>
                    <div style={{ flex: 1 }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "support" ? "Поиск… (thread/user/subject/category/status)" : "Поиск… (email / id / user_id)"} style={{ width: "min(520px, 100%)", padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(224,197,143,.14)", background: "rgba(10,18,38,.28)", color: "rgba(245,240,233,.92)", outline: "none" }} />
                    <button onClick={() => void load()} style={{ borderRadius: 14, padding: "10px 12px", border: "1px solid rgba(224,197,143,.18)", background: "rgba(224,197,143,.10)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: "pointer" }}>Обновить</button>
                </div>
            </div>

            {err && <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(255,110,90,.22)", background: "rgba(255,110,90,.06)" }}><div style={{ fontWeight: 900 }}>Ошибка</div><div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div></div>}
            {mailResult && <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(120,230,255,.24)", background: "rgba(120,230,255,.08)", color: "rgba(245,240,233,.92)" }}>{mailResult}</div>}

            {tab === "users" && <Card title={`Пользователи (${filteredProfiles.length})`}><GridHeader cols="180px 1fr 220px">User ID</GridHeader>{filteredProfiles.slice(0, 200).map((p) => <GridRow key={p.id} cols="180px 1fr 220px"><Mono>{p.id.slice(0, 8)}…</Mono><div><div style={{ fontWeight: 900 }}>{p.email || "—"}</div><div style={{ opacity: 0.75, fontSize: 12 }}>{p.full_name || ""}</div></div><div style={{ opacity: 0.75, fontSize: 12 }}>{p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}</div></GridRow>)}</Card>}

            {tab === "orders" && <Card title={`Покупки (${filteredOrders.length})`}><GridHeader cols="160px 160px 120px 140px 1fr">Order</GridHeader>{filteredOrders.slice(0, 250).map((o) => <GridRow key={o.id} cols="160px 160px 120px 140px 1fr"><Mono>{o.id.slice(0, 8)}…</Mono><Mono>{o.user_id.slice(0, 8)}…</Mono><Badge>{o.status || "—"}</Badge><div style={{ fontWeight: 900 }}>{o.amount_cents != null ? `${(o.amount_cents / 100).toFixed(2)} ${o.currency || ""}` : "—"}</div><div style={{ opacity: 0.8, fontSize: 12 }}>{o.provider || "—"} {o.provider_order_id ? `· ${o.provider_order_id}` : ""} {o.paid_at ? `· paid ${new Date(o.paid_at).toLocaleString()}` : ""}</div></GridRow>)}</Card>}

            {tab === "calcs" && <Card title={`Прогнозы (${filteredCalcs.length})`}><GridHeader cols="170px 170px 160px 140px 160px">Calc</GridHeader>{filteredCalcs.slice(0, 250).map((c) => <GridRow key={c.id} cols="170px 170px 160px 140px 160px"><Mono>{c.id.slice(0, 8)}…</Mono><Mono>{c.user_id.slice(0, 8)}…</Mono><Mono>{String(c.calc_type_id || "—")}</Mono><Badge>{c.status || "—"}</Badge><button onClick={() => void restartCalc(c.id)} style={{ borderRadius: 12, padding: "8px 10px", border: "1px solid rgba(120,230,255,.22)", background: "rgba(120,230,255,.10)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: "pointer" }}>Перезапуск</button></GridRow>)}</Card>}

            {tab === "mail" && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: 14 }}>
                    <Card title="Сегменты рассылки">
                        <div style={{ display: "grid", gap: 10 }}>
                            {LIVE_SEGMENTS.map((segment) => {
                                const active = selectedSegment === segment;
                                return <button key={segment} onClick={() => setSelectedSegment(segment)} style={{ textAlign: "left", padding: 14, borderRadius: 16, border: active ? "1px solid rgba(224,197,143,.28)" : "1px solid rgba(224,197,143,.10)", background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)", color: "rgba(245,240,233,.92)", cursor: "pointer" }}><div style={{ fontWeight: 900 }}>{SEGMENT_LABELS[segment]}</div><div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.68)" }}>Получателей: {emailSegments[segment] ?? 0}</div></button>;
                            })}
                            <div style={{ padding: 12, borderRadius: 14, background: "rgba(10,18,38,.18)", fontSize: 12, color: "rgba(245,240,233,.72)" }}>SMTP берётся из env: <strong>SMTP_HOST</strong>, <strong>SMTP_PORT</strong>, <strong>SMTP_USER</strong>, <strong>SMTP_PASS</strong>, <strong>SMTP_FROM</strong>. Ответы на письма уйдут на <strong>SMTP_REPLY_TO</strong> или обратно на <strong>SMTP_FROM</strong>. Тестовый прогон идёт только по адресам администраторов: <strong>{emailSegments.admins_test ?? 0}</strong>.</div>
                        </div>
                    </Card>
                    <Card title="Новая рассылка">
                        <div style={{ display: "grid", gap: 12 }}>
                            <div style={{ fontSize: 13, color: "rgba(245,240,233,.74)" }}>Сегмент: <strong>{SEGMENT_LABELS[selectedSegment]}</strong> · получателей: <strong>{emailSegments[selectedSegment] ?? 0}</strong></div>
                            <input value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} placeholder="Тема письма" style={inputStyle} />
                            <textarea value={mailText} onChange={(e) => setMailText(e.target.value)} placeholder="Текстовая версия письма" style={{ ...inputStyle, minHeight: 120, resize: "vertical" }} />
                            <textarea value={mailHtml} onChange={(e) => setMailHtml(e.target.value)} placeholder="HTML-версия письма" style={{ ...inputStyle, minHeight: 220, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }} />
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                <div style={{ fontSize: 12, color: "rgba(245,240,233,.65)" }}>Письма уходят персонально каждому адресу, чтобы не светить базу получателей. Сначала можно сделать тест администраторам.</div>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <button onClick={() => void sendEmailCampaign(true)} disabled={mailSending || !mailSubject.trim() || (!mailText.trim() && !mailHtml.trim())} style={{ borderRadius: 14, padding: "12px 16px", border: "1px solid rgba(120,230,255,.20)", background: "rgba(120,230,255,.10)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: mailSending ? "default" : "pointer", opacity: mailSending ? 0.75 : 1 }}> {mailSending ? "Отправка…" : "Тест администраторам"}</button>
                                    <button onClick={() => void sendEmailCampaign(false)} disabled={mailSending || !mailSubject.trim() || (!mailText.trim() && !mailHtml.trim())} style={{ borderRadius: 14, padding: "12px 16px", border: "1px solid rgba(224,197,143,.20)", background: "rgba(224,197,143,.12)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: mailSending ? "default" : "pointer", opacity: mailSending ? 0.75 : 1 }}> {mailSending ? "Отправка…" : "Отправить рассылку"}</button>
                                </div>
                            </div>
                        </div>
                    </Card>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <Card title={`История рассылок (${emailCampaigns.length})`}>
                            <GridHeader cols="180px 1fr 140px 160px 160px">Campaign</GridHeader>
                            {emailCampaigns.map((campaign) => <GridRow key={campaign.id} cols="180px 1fr 140px 160px 160px"><Mono>{campaign.id.slice(0, 8)}…</Mono><div><div style={{ fontWeight: 900 }}>{campaign.subject}</div><div style={{ opacity: 0.72, fontSize: 12 }}>{SEGMENT_LABELS[campaign.segment_key] || campaign.segment_key}</div></div><Badge>{campaign.status}</Badge><div style={{ fontSize: 12, opacity: 0.82 }}>Всего: {campaign.recipients_count}<br />Успех: {campaign.sent_count}<br />Ошибки: {campaign.failed_count}</div><div style={{ fontSize: 12, opacity: 0.82 }}>{new Date(campaign.created_at).toLocaleString()}</div></GridRow>)}
                            {!emailCampaigns.length && <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>Рассылок пока не было.</div>}
                        </Card>
                    </div>
                </div>
            )}

            {tab === "support" && <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}><Card title={`Поддержка (${filteredThreads.length})`}><div style={{ display: "grid", gap: 10 }}>{filteredThreads.slice(0, 200).map((t) => { const active = t.id === activeThreadId; return <button key={t.id} onClick={() => setActiveThreadId(t.id)} style={{ textAlign: "left", width: "100%", padding: 12, borderRadius: 16, border: active ? "1px solid rgba(224,197,143,.28)" : "1px solid rgba(224,197,143,.10)", background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)", color: "rgba(245,240,233,.92)", cursor: "pointer" }}><div style={{ fontWeight: 950, fontSize: 13 }}>{t.subject || "Обращение"}</div><div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.70)" }}>{t.category} • {t.status}</div><div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.55)" }}>user_id: {t.user_id.slice(0, 8)}… • last: {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : "—"}</div></button>; })}{!filteredThreads.length && <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>Пока нет обращений.</div>}</div></Card><Card title={activeThread ? `Чат: ${activeThread.subject}` : "Чат"}>{!activeThreadId ? <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>Выбери обращение слева.</div> : <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 12, minHeight: "62vh" }}><div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>{activeThread ? `${activeThread.category} • ${activeThread.status} • user_id: ${activeThread.user_id}` : ""}</div><div style={{ padding: 12, borderRadius: 16, border: "1px solid rgba(224,197,143,.10)", background: "rgba(10,18,38,.18)", overflow: "auto" }}><div style={{ display: "grid", gap: 10 }}>{messages.map((m) => { const mine = m.is_admin && m.author_admin_id && m.author_admin_id === adminId; return <div key={m.id} style={{ justifySelf: mine ? "end" : "start", maxWidth: "78%", padding: "10px 12px", borderRadius: 16, border: mine ? "1px solid rgba(120,230,255,.22)" : "1px solid rgba(224,197,143,.10)", background: mine ? "rgba(120,230,255,.10)" : "rgba(17,34,80,.18)", color: "rgba(245,240,233,.92)", whiteSpace: "pre-wrap" }}><div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, marginBottom: 6 }}>{m.is_admin ? "Поддержка" : "Пользователь"}</div><div>{m.message}</div>{m.attachment_url && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>📎 <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ color: "rgba(245,240,233,.92)", textDecoration: "underline" }}>Открыть файл</a></div>}</div>; })}<div ref={bottomRef} /></div></div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input value={supportText} onChange={(e) => setSupportText(e.target.value)} placeholder="Ответить пользователю…" disabled={supportSending} style={{ flex: 1, padding: "12px 12px", borderRadius: 14, border: "1px solid rgba(224,197,143,.14)", background: "rgba(10,18,38,.28)", color: "rgba(245,240,233,.92)", outline: "none" }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendAdminMessage(); } }} /><input ref={fileInputRef} type="file" style={{ display: "none" }} disabled={supportSending} onChange={(e) => setSupportFile(e.target.files?.[0] ?? null)} /><button type="button" onClick={() => fileInputRef.current?.click()} disabled={supportSending} title={supportFile ? supportFile.name : "Прикрепить файл"} style={{ width: 46, height: 46, borderRadius: 14, border: "1px solid rgba(224,197,143,.20)", background: "rgba(10,18,38,.22)", color: "rgba(245,240,233,.92)", display: "grid", placeItems: "center", cursor: supportSending ? "default" : "pointer", opacity: supportSending ? 0.65 : 1 }}><PaperclipIcon /></button><button onClick={() => void sendAdminMessage()} disabled={supportSending || (!supportText.trim() && !supportFile)} style={{ borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(224,197,143,.20)", background: "rgba(224,197,143,.12)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: supportSending ? "default" : "pointer", opacity: supportSending ? 0.75 : 1, whiteSpace: "nowrap" }}>{supportSending ? "…" : "Отправить"}</button></div></div>}</Card></div>}
        </div>
    );
}

const inputStyle: CSSProperties = { padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(224,197,143,.14)", background: "rgba(10,18,38,.28)", color: "rgba(245,240,233,.92)", outline: "none" };

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
    return <button onClick={onClick} style={{ borderRadius: 999, padding: "8px 12px", border: active ? "1px solid rgba(224,197,143,.30)" : "1px solid rgba(224,197,143,.12)", background: active ? "rgba(224,197,143,.10)" : "rgba(17,34,80,.16)", color: "rgba(245,240,233,.92)", fontWeight: 950, cursor: "pointer" }}>{children}</button>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    return <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)" }}><div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>{title}</div>{children}</div>;
}

function GridHeader({ cols, children }: { cols: string; children: ReactNode }) {
    return <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "10px 10px", borderRadius: 14, background: "rgba(10,18,38,.22)", border: "1px solid rgba(224,197,143,.10)", color: "rgba(245,240,233,.70)", fontSize: 12, fontWeight: 950 }}><div>{children}</div><div>Email/User</div><div>Type</div><div>Status</div><div>Action</div></div>;
}

function GridRow({ cols, children }: { cols: string; children: ReactNode }) {
    return <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "10px 10px", borderRadius: 14, border: "1px solid rgba(224,197,143,.10)", background: "rgba(10,18,38,.16)", alignItems: "center", marginTop: 10 }}>{children}</div>;
}

function Mono({ children }: { children: ReactNode }) {
    return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, opacity: 0.9 }}>{children}</span>;
}

function Badge({ children }: { children: ReactNode }) {
    return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.20)", fontSize: 12, fontWeight: 900 }}>{children}</span>;
}
