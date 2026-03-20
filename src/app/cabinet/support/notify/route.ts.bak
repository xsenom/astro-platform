import { NextRequest, NextResponse } from "next/server";

const BOT = process.env.SUPPORT_TELEGRAM_BOT_TOKEN!;
const CHAT = process.env.SUPPORT_TELEGRAM_CHAT_ID!;
const APP = process.env.NEXT_PUBLIC_APP_URL || "";

async function sendTelegram(text: string) {
    if (!BOT || !CHAT) return;
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: CHAT,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
        }),
    });
}

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => null);
    const msg = String(body?.text || "").trim();
    const link = body?.link ? String(body.link) : "";

    if (!msg) return NextResponse.json({ ok: false, error: "no text" }, { status: 400 });

    const text = link ? `${msg}\n\n${APP ? APP + link : link}` : msg;
    await sendTelegram(text);

    return NextResponse.json({ ok: true });
}
