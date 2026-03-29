import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

function htmlPage(title: string, message: string) {
    return `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#0b1226;color:#f5f0e9;display:flex;min-height:100vh;align-items:center;justify-content:center"><div style="max-width:560px;padding:24px;border:1px solid rgba(224,197,143,.25);border-radius:16px;background:rgba(10,18,38,.35)"><h1 style="margin:0 0 12px 0;font-size:20px">${title}</h1><p style="margin:0;color:rgba(245,240,233,.8)">${message}</p></div></body></html>`;
}

export async function GET(req: NextRequest) {
    const campaignId = req.nextUrl.searchParams.get("campaign");
    const recipientId = req.nextUrl.searchParams.get("recipient");

    if (!campaignId || !recipientId) {
        return new NextResponse(htmlPage("Некорректная ссылка", "Ссылка для отписки неполная."), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const nowIso = new Date().toISOString();
    const { data: recipient } = await getAdminClient()
        .from("email_campaign_recipients")
        .select("id, profile_id, email, unsubscribed_at")
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .single();

    if (!recipient) {
        return new NextResponse(htmlPage("Ссылка устарела", "Мы не нашли получателя для этой ссылки отписки."), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    await getAdminClient()
        .from("profiles")
        .update({ marketing_email_opt_in: false, is_blocked: true, updated_at: nowIso })
        .eq("id", recipient.profile_id);

    await getAdminClient()
        .from("marketing_contacts")
        .update({ marketing_email_opt_in: false, updated_at: nowIso })
        .eq("email", recipient.email);

    if (!recipient.unsubscribed_at) {
        await getAdminClient().from("email_campaign_recipients").update({ unsubscribed_at: nowIso }).eq("id", recipientId);
        const { data: campaign } = await getAdminClient().from("email_campaigns").select("unsubscribed_count").eq("id", campaignId).single();
        await getAdminClient().from("email_campaigns").update({ unsubscribed_count: (campaign?.unsubscribed_count ?? 0) + 1 }).eq("id", campaignId);
    }

    await getAdminClient().from("email_delivery_events").insert({
        recipient_id: recipientId,
        campaign_id: campaignId,
        profile_id: recipient.profile_id,
        email: recipient.email,
        event_type: "unsubscribed",
        event_status: "ok",
    });

    return new NextResponse(htmlPage("Вы отписаны", "Адрес исключён из маркетинговых рассылок. При необходимости вы сможете подписаться снова через поддержку."), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}
