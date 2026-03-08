"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCabinetLoading } from "@/components/cabinet/cabinetLoading";

type Thread = {
    id: string;
    created_at: string;
    last_message_at: string;
    category: string;
    subject: string;
    status: string;
};

type Msg = {
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

const CATS = [
    { v: "payment", label: "Оплата / покупка" },
    { v: "calc", label: "Расчёт не пришёл / завис" },
    { v: "profile", label: "Профиль (дата/время/город)" },
    { v: "other", label: "Другое" },
] as const;

type CatValue = (typeof CATS)[number]["v"];

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

export default function SupportPage() {
    const { startLoading, stopLoading } = useCabinetLoading();

    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string>("");

    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    const [messages, setMessages] = useState<Msg[]>([]);
    const [err, setErr] = useState<string | null>(null);

    // create thread
    const [newCat, setNewCat] = useState<CatValue>("payment");
    const [newSubject, setNewSubject] = useState("");
    const [newBody, setNewBody] = useState("");
    const [creating, setCreating] = useState(false);
    const [newFile, setNewFile] = useState<File | null>(null);

    // send message
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [file, setFile] = useState<File | null>(null);

    const bottomRef = useRef<HTMLDivElement | null>(null);

    // скрытый input для файла (в панели отправки)
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const activeThread = useMemo(
        () => threads.find((t) => t.id === activeThreadId) ?? null,
        [threads, activeThreadId]
    );

    function scrollToBottom() {
        requestAnimationFrame(() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
        );
    }

    async function notifyTelegram(params: { thread_id: string; message_id: string }) {
        const token = await getAccessToken();
        if (!token) return;
        try {
            await fetch("/api/support/telegram", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(params),
            });
        } catch {
            // ignore
        }
    }

    async function uploadAttachment(f: File, threadId: string): Promise<string | null> {
        const uid = userId;
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

    async function loadUserAndThreads() {
        startLoading();
        setErr(null);
        try {
            const { data: userData, error: uErr } = await supabase.auth.getUser();
            if (uErr || !userData.user) {
                window.location.href = "/login";
                return;
            }
            setUserId(userData.user.id);
            setUserEmail(userData.user.email ?? "");

            const { data, error } = await supabase
                .from("support_threads")
                .select("id, created_at, last_message_at, category, subject, status")
                .order("last_message_at", { ascending: false });

            if (error) {
                setErr(error.message);
                return;
            }

            const list = (data ?? []) as Thread[];
            setThreads(list);
            if (!activeThreadId && list[0]) setActiveThreadId(list[0].id);
        } finally {
            stopLoading();
        }
    }

    async function loadMessages(threadId: string) {
        startLoading();
        setErr(null);
        try {
            const { data, error } = await supabase
                .from("support_messages")
                .select(
                    "id, created_at, thread_id, author_user_id, author_admin_id, is_admin, message, attachment_url"
                )
                .eq("thread_id", threadId)
                .order("created_at", { ascending: true });

            if (error) {
                setErr(error.message);
                return;
            }

            setMessages((data ?? []) as Msg[]);
            setTimeout(scrollToBottom, 50);
        } finally {
            stopLoading();
        }
    }

    useEffect(() => {
        void loadUserAndThreads();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeThreadId) void loadMessages(activeThreadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThreadId]);

    // realtime: новые сообщения текущего треда
    useEffect(() => {
        if (!activeThreadId) return;

        const channel = supabase
            .channel(`support_messages_${activeThreadId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "support_messages",
                    filter: `thread_id=eq.${activeThreadId}`,
                },
                (payload) => {
                    const m = payload.new as Msg;
                    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
                    void loadUserAndThreads();
                    setTimeout(scrollToBottom, 20);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeThreadId]);

    async function createThread() {
        const body = newBody.trim();
        if (!body) return;

        setCreating(true);
        setErr(null);
        startLoading();
        try {
            const { data: u } = await supabase.auth.getUser();
            const user = u.user;
            if (!user) {
                window.location.href = "/login";
                return;
            }

            // 1) create thread
            const { data: t, error: tErr } = await supabase
                .from("support_threads")
                .insert({
                    user_id: user.id,
                    category: newCat,
                    subject: newSubject.trim() || "Обращение",
                    status: "open",
                    last_message_at: new Date().toISOString(),
                })
                .select("id")
                .single();

            if (tErr) {
                setErr(tErr.message);
                return;
            }

            const threadId = (t as IdRow).id;

            // 2) upload attachment (optional)
            let attachmentUrl: string | null = null;
            if (newFile) {
                attachmentUrl = await uploadAttachment(newFile, threadId);
                if (!attachmentUrl) return;
            }

            // 3) first message
            const { data: m, error: mErr } = await supabase
                .from("support_messages")
                .insert({
                    thread_id: threadId,
                    author_user_id: user.id,
                    author_admin_id: null,
                    is_admin: false,
                    message: body,
                    attachment_url: attachmentUrl,
                })
                .select("id")
                .single();

            if (mErr) {
                setErr(mErr.message);
                return;
            }

            const messageId = (m as IdRow).id;

            // 4) notify tg
            await notifyTelegram({ thread_id: threadId, message_id: messageId });

            setNewSubject("");
            setNewBody("");
            setNewFile(null);

            await loadUserAndThreads();
            setActiveThreadId(threadId);
        } finally {
            stopLoading();
            setCreating(false);
        }
    }

    async function sendMessage() {
        if (!activeThreadId) return;
        const body = text.trim();
        if (!body && !file) return;

        setSending(true);
        setErr(null);
        startLoading();
        try {
            const { data: u } = await supabase.auth.getUser();
            const user = u.user;
            if (!user) {
                window.location.href = "/login";
                return;
            }

            // upload file (optional)
            let attachmentUrl: string | null = null;
            if (file) {
                attachmentUrl = await uploadAttachment(file, activeThreadId);
                if (!attachmentUrl) return;
            }

            const { data: m, error } = await supabase
                .from("support_messages")
                .insert({
                    thread_id: activeThreadId,
                    author_user_id: user.id,
                    author_admin_id: null,
                    is_admin: false,
                    message: body || (attachmentUrl ? "📎 Файл" : ""),
                    attachment_url: attachmentUrl,
                })
                .select("id")
                .single();

            if (error) {
                setErr(error.message);
                return;
            }

            const messageId = (m as IdRow).id;

            await notifyTelegram({ thread_id: activeThreadId, message_id: messageId });

            setText("");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setTimeout(scrollToBottom, 10);
        } finally {
            stopLoading();
            setSending(false);
        }
    }

    return (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
            {/* LEFT */}
            <div
                style={{
                    borderRadius: 20,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.14)",
                    padding: 14,
                }}
            >
                <div style={{ fontSize: 18, fontWeight: 950 }}>Поддержка</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.70)", fontSize: 13 }}>
                    Создай обращение — мы ответим в этом чате.
                </div>

                <div
                    style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(224,197,143,.12)",
                        background: "rgba(10,18,38,.22)",
                    }}
                >
                    <div style={{ display: "grid", gap: 10 }}>
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Категория</div>
                            <select
                                value={newCat}
                                onChange={(e) => setNewCat(e.target.value as CatValue)}
                                style={{
                                    marginTop: 6,
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(224,197,143,.14)",
                                    background: "rgba(10,18,38,.28)",
                                    color: "rgba(245,240,233,.92)",
                                }}
                            >
                                {CATS.map((c) => (
                                    <option key={c.v} value={c.v}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Тема</div>
                            <input
                                value={newSubject}
                                onChange={(e) => setNewSubject(e.target.value)}
                                placeholder="Например: Оплата прошла, доступ не появился"
                                style={{
                                    marginTop: 6,
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(224,197,143,.14)",
                                    background: "rgba(10,18,38,.28)",
                                    color: "rgba(245,240,233,.92)",
                                }}
                            />
                        </div>

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Сообщение</div>
                            <textarea
                                value={newBody}
                                onChange={(e) => setNewBody(e.target.value)}
                                rows={4}
                                placeholder="Опиши проблему и что ты уже пробовал(а)."
                                style={{
                                    marginTop: 6,
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(224,197,143,.14)",
                                    background: "rgba(10,18,38,.28)",
                                    color: "rgba(245,240,233,.92)",
                                    resize: "vertical",
                                }}
                            />
                        </div>

                        <div>
                            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.8 }}>Файл (опционально)</div>
                            <input
                                type="file"
                                onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                                style={{ marginTop: 6, width: "100%" }}
                            />
                        </div>

                        <button
                            onClick={() => void createThread()}
                            disabled={creating || !newBody.trim()}
                            style={{
                                borderRadius: 14,
                                padding: "10px 12px",
                                border: "1px solid rgba(224,197,143,.20)",
                                background: "rgba(224,197,143,.12)",
                                color: "rgba(245,240,233,.92)",
                                fontWeight: 950,
                                cursor: creating ? "default" : "pointer",
                                opacity: creating ? 0.75 : 1,
                            }}
                        >
                            {creating ? "Создаю…" : "Создать обращение"}
                        </button>
                    </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                    Мои обращения
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {threads.map((t) => {
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
                                    border: active
                                        ? "1px solid rgba(224,197,143,.28)"
                                        : "1px solid rgba(224,197,143,.10)",
                                    background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)",
                                    color: "rgba(245,240,233,.92)",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ fontWeight: 950, fontSize: 13 }}>{t.subject || "Обращение"}</div>
                                <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.70)" }}>
                                    {t.category} • {t.status}
                                </div>
                            </button>
                        );
                    })}
                    {!threads.length && (
                        <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                            Пока нет обращений.
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT */}
            <div
                style={{
                    borderRadius: 20,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.14)",
                    padding: 14,
                    display: "grid",
                    gridTemplateRows: "auto 1fr auto",
                    minHeight: "68vh",
                }}
            >
                <div>
                    <div style={{ fontSize: 18, fontWeight: 950 }}>
                        {activeThread ? activeThread.subject : "Выбери обращение"}
                    </div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.70)", fontSize: 13 }}>
                        {activeThread ? `${activeThread.category} • ${activeThread.status}` : "Создай обращение слева"}
                    </div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.55)", fontSize: 12 }}>
                        {userEmail ? `Пользователь: ${userEmail}` : ""}
                    </div>
                </div>

                {err && (
                    <div
                        style={{
                            marginTop: 10,
                            padding: 12,
                            borderRadius: 16,
                            border: "1px solid rgba(255,110,90,.22)",
                            background: "rgba(255,110,90,.06)",
                        }}
                    >
                        <div style={{ fontWeight: 900 }}>Ошибка</div>
                        <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
                    </div>
                )}

                <div
                    style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(224,197,143,.10)",
                        background: "rgba(10,18,38,.18)",
                        overflow: "auto",
                    }}
                >
                    {activeThreadId ? (
                        <div style={{ display: "grid", gap: 10 }}>
                            {messages.map((m) => {
                                const mine = !!m.author_user_id && m.author_user_id === userId;
                                const isAdmin = m.is_admin;
                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            justifySelf: mine ? "end" : "start",
                                            maxWidth: "78%",
                                            padding: "10px 12px",
                                            borderRadius: 16,
                                            border: mine
                                                ? "1px solid rgba(224,197,143,.20)"
                                                : "1px solid rgba(224,197,143,.10)",
                                            background: mine
                                                ? "rgba(224,197,143,.10)"
                                                : isAdmin
                                                    ? "rgba(120,230,255,.08)"
                                                    : "rgba(17,34,80,.18)",
                                            color: "rgba(245,240,233,.92)",
                                            whiteSpace: "pre-wrap",
                                        }}
                                    >
                                        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, marginBottom: 6 }}>
                                            {mine ? "Ты" : isAdmin ? "Поддержка" : "Пользователь"}
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
                    ) : (
                        <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>
                            Создай обращение слева или выбери существующее.
                        </div>
                    )}
                </div>

                {/* SEND BAR (без надписи "выберите файл") */}
                <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={activeThreadId ? "Напиши сообщение…" : "Сначала выбери обращение"}
                        disabled={!activeThreadId || sending}
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
                                void sendMessage();
                            }
                        }}
                    />

                    {/* скрытый input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: "none" }}
                        disabled={!activeThreadId || sending}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />

                    {/* кнопка-иконка прикрепления */}
                    <button
                        type="button"
                        title={file ? `Файл: ${file.name}` : "Прикрепить файл"}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!activeThreadId || sending}
                        style={{
                            width: 46,
                            height: 46,
                            borderRadius: 14,
                            border: file ? "1px solid rgba(224,197,143,.35)" : "1px solid rgba(224,197,143,.20)",
                            background: file ? "rgba(224,197,143,.14)" : "rgba(10,18,38,.28)",
                            color: "rgba(245,240,233,.92)",
                            display: "grid",
                            placeItems: "center",
                            cursor: !activeThreadId || sending ? "default" : "pointer",
                            opacity: !activeThreadId || sending ? 0.6 : 1,
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                                d="M21 12.5l-8.9 8.9a5 5 0 01-7.1-7.1l9.2-9.2a3.5 3.5 0 015 5l-9.2 9.2a2 2 0 11-2.8-2.8l8.6-8.6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>

                    <button
                        onClick={() => void sendMessage()}
                        disabled={!activeThreadId || sending || (!text.trim() && !file)}
                        style={{
                            borderRadius: 14,
                            padding: "12px 14px",
                            border: "1px solid rgba(224,197,143,.20)",
                            background: "rgba(224,197,143,.12)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 950,
                            cursor: sending ? "default" : "pointer",
                            opacity: sending ? 0.75 : 1,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {sending ? "…" : "Отправить"}
                    </button>
                </div>
            </div>
        </div>
    );
}
