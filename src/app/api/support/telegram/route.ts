import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
    try {
        const { ticket_id, message_id } = await req.json();

        const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const botToken = process.env.TELEGRAM_SUPPORT_BOT_TOKEN!;
        const chatId = process.env.TELEGRAM_SUPPORT_CHAT_ID!;

        if (!url || !serviceKey || !botToken || !chatId) {
            return NextResponse.json({ ok: false, error: "Missing env vars" }, { status: 500 });
        }

        if (!ticket_id) {
            return NextResponse.json({ ok: false, error: "ticket_id required" }, { status: 400 });
        }

        const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

        // ticket
        const { data: t, error: tErr } = await sb
            .from("support_tickets")
            .select("id, user_id, category, subject, status, created_at, last_message_at, order_id, calc_id")
            .eq("id", ticket_id)
            .maybeSingle();

        if (tErr || !t) {
            return NextResponse.json({ ok: false, error: tErr?.message ?? "ticket not found" }, { status: 404 });
        }

        // last message (or конкретное message_id)
        const q = sb
            .from("support_messages")
            .select("id, created_at, body, author_user_id, author_admin_id")
            .eq("ticket_id", ticket_id)
            .order("created_at", { ascending: false })
            .limit(1);

        const { data: msgs, error: mErr } = message_id
            ? await sb
                .from("support_messages")
                .select("id, created_at, body, author_user_id, author_admin_id")
                .eq("id", message_id)
                .limit(1)
            : await q;

        if (mErr) {
            return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 });
        }

        const m = Array.isArray(msgs) ? msgs[0] : null;

        const isFromUser = !!m?.author_user_id;
        const who = isFromUser ? "🧑 Пользователь" : "🛠️ Админ";

        const short = (m?.body || "").trim().slice(0, 700);

        const lines = [
            "🆘 Новое сообщение в поддержке",
            `Тикет: ${t.id}`,
            `Кто: ${who}`,
            `Категория: ${t.category}`,
            t.subject ? `Тема: ${t.subject}` : "",
            t.order_id ? `Order: ${t.order_id}` : "",
            t.calc_id ? `Calc: ${t.calc_id}` : "",
            "",
            short ? `Сообщение: ${short}` : "(пусто)",
        ].filter(Boolean);

        const text = lines.join("\n");

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
            return NextResponse.json({ ok: false, error: tgJson ?? "telegram error" }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
