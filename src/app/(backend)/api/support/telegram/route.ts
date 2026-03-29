import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ThreadRow = {
    id: string;
    user_id: string;
    category: string;
    subject: string;
    status: string;
    order_id: string | null;
    calc_id: string | null;
};

type MsgRow = {
    id: string;
    message: string;
    author_user_id: string | null;
    author_admin_id: string | null;
    is_admin: boolean;
};

function envStrict(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
    return v.trim();
}

export async function POST(req: Request) {
    try {
        const { thread_id, message_id } = await req.json();

        const url = envStrict("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = envStrict("SUPABASE_SERVICE_ROLE_KEY");
        const botToken = envStrict("TELEGRAM_SUPPORT_BOT_TOKEN");
        const chatId = envStrict("TELEGRAM_SUPPORT_CHAT_ID");

        if (!thread_id) {
            return NextResponse.json(
                { ok: false, error: "thread_id required" },
                { status: 400 }
            );
        }

        const sb = createClient(url, serviceKey, {
            auth: { persistSession: false },
        });

        const { data: t, error: tErr } = await sb
            .from("support_threads")
            .select("id, user_id, category, subject, status, order_id, calc_id")
            .eq("id", thread_id)
            .maybeSingle();

        if (tErr || !t) {
            return NextResponse.json(
                { ok: false, error: tErr?.message ?? "thread not found" },
                { status: 404 }
            );
        }

        const thread = t as ThreadRow;

        let msg: MsgRow | null = null;

        if (message_id) {
            const { data, error } = await sb
                .from("support_messages")
                .select("id, message, author_user_id, author_admin_id, is_admin")
                .eq("id", message_id)
                .maybeSingle();

            if (error) {
                return NextResponse.json(
                    { ok: false, error: error.message },
                    { status: 500 }
                );
            }

            msg = (data ?? null) as MsgRow | null;
        } else {
            const { data, error } = await sb
                .from("support_messages")
                .select("id, message, author_user_id, author_admin_id, is_admin")
                .eq("thread_id", thread_id)
                .order("created_at", { ascending: false })
                .limit(1);

            if (error) {
                return NextResponse.json(
                    { ok: false, error: error.message },
                    { status: 500 }
                );
            }

            msg = (Array.isArray(data) ? (data[0] as MsgRow) : null) ?? null;
        }

        const who = msg?.is_admin ? "🛠️ Админ" : "🧑 Пользователь";
        const short = (msg?.message ?? "").trim().slice(0, 700) || "(пусто)";

        const text = [
            "🆘 Новое сообщение в поддержке",
            `Thread: ${thread.id}`,
            `Кто: ${who}`,
            `Категория: ${thread.category}`,
            thread.subject ? `Тема: ${thread.subject}` : "",
            thread.order_id ? `Order: ${thread.order_id}` : "",
            thread.calc_id ? `Calc: ${thread.calc_id}` : "",
            "",
            `Сообщение: ${short}`,
        ]
            .filter(Boolean)
            .join("\n");

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                disable_web_page_preview: true,
            }),
        });

        const tgJson = await tgRes.json().catch(() => null);

        if (!tgRes.ok) {
            return NextResponse.json(
                { ok: false, error: "telegram error", telegram: tgJson },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message ?? "unknown" },
            { status: 500 }
        );
    }
}