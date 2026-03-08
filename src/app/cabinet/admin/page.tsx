"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    updated_at: string | null;
};

type OrderRow = {
    id: string;
    user_id: string;
    status: string | null;
    amount_cents: number | null;
    currency: string | null;
    provider: string | null;
    provider_order_id: string | null;
    paid_at: string | null;
    created_at: string | null;
};

type CalculationRow = {
    id: string;
    user_id: string;
    calc_type_id?: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
};

type SupportThreadRow = {
    id: string;
    created_at: string;
    last_message_at: string;
    updated_at: string | null;
    user_id: string;
    category: string;
    subject: string;
    status: string;
};

type SupportMsgRow = {
    id: string;
    created_at: string;
    thread_id: string;
    author_user_id: string | null;
    author_admin_id: string | null;
    is_admin: boolean;
    message: string;
    attachment_url: string | null;
};

type IdRow = { id: string };

function PaperclipIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.19 9.19a2 2 0 01-2.83-2.83l8.49-8.49"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export default function AdminPage() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [tab, setTab] = useState<"users" | "orders" | "calcs" | "support">("users");
    const [q, setQ] = useState("");

    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [calcs, setCalcs] = useState<CalculationRow[]>([]);

    // SUPPORT state
    const [adminId, setAdminId] = useState<string | null>(null);
    const [threads, setThreads] = useState<SupportThreadRow[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<SupportMsgRow[]>([]);
    const [supportText, setSupportText] = useState("");
    const [supportSending, setSupportSending] = useState(false);
    const [supportFile, setSupportFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const filteredProfiles = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return profiles;
        return profiles.filter(
            (p) => (p.email || "").toLowerCase().includes(s) || (p.full_name || "").toLowerCase().includes(s)
        );
    }, [profiles, q]);

    const filteredOrders = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return orders;
        return orders.filter(
            (o) =>
                o.id.toLowerCase().includes(s) ||
                o.user_id.toLowerCase().includes(s) ||
                (o.provider_order_id || "").toLowerCase().includes(s)
        );
    }, [orders, q]);

    const filteredCalcs = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return calcs;
        return calcs.filter(
            (c) =>
                c.id.toLowerCase().includes(s) ||
                c.user_id.toLowerCase().includes(s) ||
                String(c.calc_type_id || "").toLowerCase().includes(s)
        );
    }, [calcs, q]);

    const filteredThreads = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return threads;
        return threads.filter((t) => {
            return (
                t.id.toLowerCase().includes(s) ||
                t.user_id.toLowerCase().includes(s) ||
                (t.subject || "").toLowerCase().includes(s) ||
                (t.category || "").toLowerCase().includes(s) ||
                (t.status || "").toLowerCase().includes(s)
            );
        });
    }, [threads, q]);

    const activeThread = useMemo(
        () => threads.find((t) => t.id === activeThreadId) ?? null,
        [threads, activeThreadId]
    );

    function scrollToBottom() {
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }

    async function load() {
        setLoading(true);
        setErr(null);

        // user + token
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
            window.location.href = "/login";
            return;
        }

        // запомним adminId
        const { data: u } = await supabase.auth.getUser();
        setAdminId(u.user?.id ?? null);

        // проверка доступа + summary
        const res = await fetch("/api/admin/summary", {
            headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            setErr(json?.error || "Нет доступа (нужен админ).");
            setLoading(false);
            return;
        }

        setProfiles(json.profiles || []);
        setOrders(json.orders || []);
        setCalcs(json.calculations || []);

        // загрузим треды поддержки сразу (чтобы таб открывался быстро)
        await loadSupportThreads();

        setLoading(false);
    }

    useEffect(() => {
        void load();
    }, []);

    async function restartCalc(calcId: string) {
        setErr(null);
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch("/api/admin/restart-calc", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ calc_id: calcId }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            setErr(json?.error || "Не удалось перезапустить.");
            return;
        }

        setCalcs((prev) => prev.map((c) => (c.id === calcId ? { ...c, status: "queued" } : c)));
    }

    // ============== SUPPORT ==============

    async function loadSupportThreads() {
        const { data, error } = await supabase
            .from("support_threads")
            .select("id, created_at, last_message_at, updated_at, user_id, category, subject, status")
            .order("last_message_at", { ascending: false });

        if (error) {
            // не убиваем всю админку — показываем как err (будет видно в UI)
            setErr(error.message);
            return;
        }

        const list = (data ?? []) as SupportThreadRow[];
        setThreads(list);

        if (!activeThreadId && list[0]) {
            setActiveThreadId(list[0].id);
        }
    }

    async function loadSupportMessages(threadId: string) {
        const { data, error } = await supabase
            .from("support_messages")
            .select("id, created_at, thread_id, author_user_id, author_admin_id, is_admin, message, attachment_url")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true });

        if (error) {
            setErr(error.message);
            return;
        }

        setMessages((data ?? []) as SupportMsgRow[]);
        setTimeout(scrollToBottom, 50);
    }

    useEffect(() => {
        if (tab !== "support") return;
        if (activeThreadId) void loadSupportMessages(activeThreadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, activeThreadId]);

    // realtime по активному треду
    useEffect(() => {
        if (tab !== "support") return;
        if (!activeThreadId) return;

        const channel = supabase
            .channel(`admin_support_messages_${activeThreadId}`)
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${activeThreadId}` },
                (payload) => {
                    const m = payload.new as SupportMsgRow;
                    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
                    void loadSupportThreads();
                    setTimeout(scrollToBottom, 20);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, activeThreadId]);

    async function notifyTelegram(params: { thread_id: string; message_id: string }) {
        const token = await getAccessToken();
        if (!token) return;
        try {
            await fetch("/api/support/telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(params),
            });
        } catch {
            // ignore
        }
    }

    async function uploadAttachmentAsAdmin(f: File, threadId: string): Promise<string | null> {
        // можно класть в папку admin/<threadId>/...
        // но политика storage выше разрешает только user/<uid>/...
        // поэтому проще: хранить админские вложения тоже в папке auth.uid()
        // (т.е. admin uid) — это нормально.
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) return null;

        const safeName = f.name.replace(/[^\w.\-()]+/g, "_");
        const path = `${uid}/${threadId}/${Date.now()}_${safeName}`;

        const { error } = await supabase.storage.from("support_attachments").upload(path, f, {
            upsert: false,
            contentType: f.type || "application/octet-stream",
        });

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
            const { data: u } = await supabase.auth.getUser();
            const user = u.user;
            if (!user) {
                window.location.href = "/login";
                return;
            }

            let attachmentUrl: string | null = null;
            if (supportFile) {
                attachmentUrl = await uploadAttachmentAsAdmin(supportFile, activeThreadId);
                if (!attachmentUrl) return;
            }

            const { data: m, error } = await supabase
                .from("support_messages")
                .insert({
                    thread_id: activeThreadId,
                    author_user_id: null,
                    author_admin_id: user.id,
                    is_admin: true,
                    message: body || (attachmentUrl ? "📎 Файл" : ""),
                    attachment_url: attachmentUrl,
                })
                .select("id")
                .single();

            if (error) {
                setErr(error.message);
                return;
            }

            // статус треда
            await supabase.from("support_threads").update({ status: "waiting_user" }).eq("id", activeThreadId);

            // уведомление в TG
            await notifyTelegram({ thread_id: activeThreadId, message_id: (m as IdRow).id });

            setSupportText("");
            setSupportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setTimeout(scrollToBottom, 10);
        } finally {
            setSupportSending(false);
        }
    }

    // ============== UI ==============

    if (loading) {
        return (
            <div
                style={{
                    padding: 18,
                    borderRadius: 18,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                Загрузка админ-панели…
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                <div style={{ fontSize: 24, fontWeight: 950 }}>Админ-панель</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>
                    Пользователи, покупки, расчёты, поддержка. Перезапуск — в “Расчёты”.
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <TabButton active={tab === "users"} onClick={() => setTab("users")}>Пользователи</TabButton>
                    <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>Покупки</TabButton>
                    <TabButton active={tab === "calcs"} onClick={() => setTab("calcs")}>Расчёты</TabButton>
                    <TabButton active={tab === "support"} onClick={() => setTab("support")}>Поддержка</TabButton>

                    <div style={{ flex: 1 }} />

                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={tab === "support" ? "Поиск… (thread/user/subject/category/status)" : "Поиск… (email / id / user_id)"}
                        style={{
                            width: "min(520px, 100%)",
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "rgba(10,18,38,.28)",
                            color: "rgba(245,240,233,.92)",
                            outline: "none",
                        }}
                    />

                    <button
                        onClick={() => void load()}
                        style={{
                            borderRadius: 14,
                            padding: "10px 12px",
                            border: "1px solid rgba(224,197,143,.18)",
                            background: "rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 950,
                            cursor: "pointer",
                        }}
                    >
                        Обновить
                    </button>
                </div>
            </div>

            {err && (
                <div style={{ padding: 16, borderRadius: 18, border: "1px solid rgba(255,110,90,.22)", background: "rgba(255,110,90,.06)" }}>
                    <div style={{ fontWeight: 900 }}>Ошибка</div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
                </div>
            )}

            {tab === "users" && (
                <Card title={`Пользователи (${filteredProfiles.length})`}>
                    <GridHeader cols="180px 1fr 220px">User ID</GridHeader>
                    {filteredProfiles.slice(0, 200).map((p) => (
                        <GridRow key={p.id} cols="180px 1fr 220px">
                            <Mono>{p.id.slice(0, 8)}…</Mono>
                            <div>
                                <div style={{ fontWeight: 900 }}>{p.email || "—"}</div>
                                <div style={{ opacity: 0.75, fontSize: 12 }}>{p.full_name || ""}</div>
                            </div>
                            <div style={{ opacity: 0.75, fontSize: 12 }}>{p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}</div>
                        </GridRow>
                    ))}
                </Card>
            )}

            {tab === "orders" && (
                <Card title={`Покупки (${filteredOrders.length})`}>
                    <GridHeader cols="160px 160px 120px 140px 1fr">Order</GridHeader>
                    {filteredOrders.slice(0, 250).map((o) => (
                        <GridRow key={o.id} cols="160px 160px 120px 140px 1fr">
                            <Mono>{o.id.slice(0, 8)}…</Mono>
                            <Mono>{o.user_id.slice(0, 8)}…</Mono>
                            <Badge>{o.status || "—"}</Badge>
                            <div style={{ fontWeight: 900 }}>
                                {o.amount_cents != null ? `${(o.amount_cents / 100).toFixed(2)} ${o.currency || ""}` : "—"}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12 }}>
                                {o.provider || "—"} {o.provider_order_id ? `· ${o.provider_order_id}` : ""}{" "}
                                {o.paid_at ? `· paid ${new Date(o.paid_at).toLocaleString()}` : ""}
                            </div>
                        </GridRow>
                    ))}
                </Card>
            )}

            {tab === "calcs" && (
                <Card title={`Расчёты (${filteredCalcs.length})`}>
                    <GridHeader cols="170px 170px 160px 140px 160px">Calc</GridHeader>
                    {filteredCalcs.slice(0, 250).map((c) => (
                        <GridRow key={c.id} cols="170px 170px 160px 140px 160px">
                            <Mono>{c.id.slice(0, 8)}…</Mono>
                            <Mono>{c.user_id.slice(0, 8)}…</Mono>
                            <Mono>{String(c.calc_type_id || "—")}</Mono>
                            <Badge>{c.status || "—"}</Badge>
                            <button
                                onClick={() => void restartCalc(c.id)}
                                style={{
                                    borderRadius: 12,
                                    padding: "8px 10px",
                                    border: "1px solid rgba(120,230,255,.22)",
                                    background: "rgba(120,230,255,.10)",
                                    color: "rgba(245,240,233,.92)",
                                    fontWeight: 950,
                                    cursor: "pointer",
                                }}
                            >
                                Перезапуск
                            </button>
                        </GridRow>
                    ))}
                </Card>
            )}

            {tab === "support" && (
                <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
                    <Card title={`Поддержка (${filteredThreads.length})`}>
                        <div style={{ display: "grid", gap: 10 }}>
                            {filteredThreads.slice(0, 200).map((t) => {
                                const active = t.id === activeThreadId;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setActiveThreadId(t.id)}
                                        style={{
                                            textAlign: "left",
                                            width: "100%",
                                            padding: 12,
                                            borderRadius: 16,
                                            border: active ? "1px solid rgba(224,197,143,.28)" : "1px solid rgba(224,197,143,.10)",
                                            background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)",
                                            color: "rgba(245,240,233,.92)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div style={{ fontWeight: 950, fontSize: 13 }}>{t.subject || "Обращение"}</div>
                                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.70)" }}>
                                            {t.category} • {t.status}
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.55)" }}>
                                            user_id: {t.user_id.slice(0, 8)}… • last: {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : "—"}
                                        </div>
                                    </button>
                                );
                            })}
                            {!filteredThreads.length && (
                                <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                                    Пока нет обращений.
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card title={activeThread ? `Чат: ${activeThread.subject}` : "Чат"}>
                        {!activeThreadId ? (
                            <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>Выбери обращение слева.</div>
                        ) : (
                            <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", gap: 12, minHeight: "62vh" }}>
                                <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>
                                    {activeThread ? `${activeThread.category} • ${activeThread.status} • user_id: ${activeThread.user_id}` : ""}
                                </div>

                                <div
                                    style={{
                                        padding: 12,
                                        borderRadius: 16,
                                        border: "1px solid rgba(224,197,143,.10)",
                                        background: "rgba(10,18,38,.18)",
                                        overflow: "auto",
                                    }}
                                >
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {messages.map((m) => {
                                            const mine = m.is_admin && m.author_admin_id && m.author_admin_id === adminId;
                                            return (
                                                <div
                                                    key={m.id}
                                                    style={{
                                                        justifySelf: mine ? "end" : "start",
                                                        maxWidth: "78%",
                                                        padding: "10px 12px",
                                                        borderRadius: 16,
                                                        border: mine ? "1px solid rgba(120,230,255,.22)" : "1px solid rgba(224,197,143,.10)",
                                                        background: mine ? "rgba(120,230,255,.10)" : "rgba(17,34,80,.18)",
                                                        color: "rgba(245,240,233,.92)",
                                                        whiteSpace: "pre-wrap",
                                                    }}
                                                >
                                                    <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, marginBottom: 6 }}>
                                                        {m.is_admin ? "Поддержка" : "Пользователь"}
                                                    </div>
                                                    <div>{m.message}</div>
                                                    {m.attachment_url && (
                                                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                                                            📎{" "}
                                                            <a
                                                                href={m.attachment_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ color: "rgba(245,240,233,.92)", textDecoration: "underline" }}
                                                            >
                                                                Открыть файл
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div ref={bottomRef} />
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        value={supportText}
                                        onChange={(e) => setSupportText(e.target.value)}
                                        placeholder="Ответить пользователю…"
                                        disabled={supportSending}
                                        style={{
                                            flex: 1,
                                            padding: "12px 12px",
                                            borderRadius: 14,
                                            border: "1px solid rgba(224,197,143,.14)",
                                            background: "rgba(10,18,38,.28)",
                                            color: "rgba(245,240,233,.92)",
                                            outline: "none",
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void sendAdminMessage();
                                            }
                                        }}
                                    />

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        style={{ display: "none" }}
                                        disabled={supportSending}
                                        onChange={(e) => setSupportFile(e.target.files?.[0] ?? null)}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={supportSending}
                                        title={supportFile ? supportFile.name : "Прикрепить файл"}
                                        style={{
                                            width: 46,
                                            height: 46,
                                            borderRadius: 14,
                                            border: "1px solid rgba(224,197,143,.20)",
                                            background: "rgba(10,18,38,.22)",
                                            color: "rgba(245,240,233,.92)",
                                            display: "grid",
                                            placeItems: "center",
                                            cursor: supportSending ? "default" : "pointer",
                                            opacity: supportSending ? 0.65 : 1,
                                        }}
                                    >
                                        <PaperclipIcon />
                                    </button>

                                    <button
                                        onClick={() => void sendAdminMessage()}
                                        disabled={supportSending || (!supportText.trim() && !supportFile)}
                                        style={{
                                            borderRadius: 14,
                                            padding: "12px 14px",
                                            border: "1px solid rgba(224,197,143,.20)",
                                            background: "rgba(224,197,143,.12)",
                                            color: "rgba(245,240,233,.92)",
                                            fontWeight: 950,
                                            cursor: supportSending ? "default" : "pointer",
                                            opacity: supportSending ? 0.75 : 1,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {supportSending ? "…" : "Отправить"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}

function TabButton({ active, onClick, children }: any) {
    return (
        <button
            onClick={onClick}
            style={{
                borderRadius: 999,
                padding: "8px 12px",
                border: active ? "1px solid rgba(224,197,143,.30)" : "1px solid rgba(224,197,143,.12)",
                background: active ? "rgba(224,197,143,.10)" : "rgba(17,34,80,.16)",
                color: "rgba(245,240,233,.92)",
                fontWeight: 950,
                cursor: "pointer",
            }}
        >
            {children}
        </button>
    );
}

function Card({ title, children }: any) {
    return (
        <div style={{ padding: 18, borderRadius: 22, border: "1px solid rgba(224,197,143,.14)", background: "rgba(17,34,80,.16)" }}>
            <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>{title}</div>
            {children}
        </div>
    );
}

function GridHeader({ cols, children }: any) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 10,
                padding: "10px 10px",
                borderRadius: 14,
                background: "rgba(10,18,38,.22)",
                border: "1px solid rgba(224,197,143,.10)",
                color: "rgba(245,240,233,.70)",
                fontSize: 12,
                fontWeight: 950,
            }}
        >
            <div>{children}</div>
            <div>Email/User</div>
            <div>Type</div>
            <div>Status</div>
            <div>Action</div>
        </div>
    );
}

function GridRow({ cols, children }: any) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 10,
                padding: "10px 10px",
                borderRadius: 14,
                border: "1px solid rgba(224,197,143,.10)",
                background: "rgba(10,18,38,.16)",
                alignItems: "center",
                marginTop: 10,
            }}
        >
            {children}
        </div>
    );
}

function Mono({ children }: any) {
    return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, opacity: 0.9 }}>{children}</span>;
}

function Badge({ children }: any) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(224,197,143,.14)",
                background: "rgba(17,34,80,.20)",
                fontSize: 12,
                fontWeight: 900,
            }}
        >
      {children}
    </span>
    );
}
