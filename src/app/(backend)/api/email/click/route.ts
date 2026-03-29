import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
    const campaignId = req.nextUrl.searchParams.get("campaign");
    const recipientId = req.nextUrl.searchParams.get("recipient");
    const rawUrl = req.nextUrl.searchParams.get("url");

    let redirectUrl = req.nextUrl.origin;
    if (rawUrl) {
        try {
            const parsed = new URL(rawUrl);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
                redirectUrl = parsed.toString();
            }
        } catch {
            redirectUrl = req.nextUrl.origin;
        }
    }

    if (!campaignId || !recipientId) {
        return NextResponse.redirect(redirectUrl);
    }

    const nowIso = new Date().toISOString();
    const { data: recipient } = await getAdminClient()
        .from("email_campaign_recipients")
        .select("id, profile_id, email, clicked_at")
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .single();

    if (recipient) {
        if (!recipient.clicked_at) {
            await getAdminClient().from("email_campaign_recipients").update({ clicked_at: nowIso }).eq("id", recipientId);
            const { data: campaign } = await getAdminClient().from("email_campaigns").select("clicked_count").eq("id", campaignId).single();
            await getAdminClient().from("email_campaigns").update({ clicked_count: (campaign?.clicked_count ?? 0) + 1 }).eq("id", campaignId);
        }

        await getAdminClient().from("email_delivery_events").insert({
            recipient_id: recipientId,
            campaign_id: campaignId,
            profile_id: recipient.profile_id,
            email: recipient.email,
            event_type: "clicked",
            event_status: "ok",
            event_payload: { url: redirectUrl },
        });
    }

    return NextResponse.redirect(redirectUrl);
}
