import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

const PIXEL_BYTES = Buffer.from("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export async function GET(req: NextRequest) {
    const campaignId = req.nextUrl.searchParams.get("campaign");
    const recipientId = req.nextUrl.searchParams.get("recipient");

    if (!campaignId || !recipientId) {
        return new NextResponse(PIXEL_BYTES, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
    }

    const nowIso = new Date().toISOString();
    const { data: recipient } = await getAdminClient()
        .from("email_campaign_recipients")
        .select("id, campaign_id, profile_id, email, opened_at")
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .single();

    if (recipient) {
        if (!recipient.opened_at) {
            await getAdminClient().from("email_campaign_recipients").update({ opened_at: nowIso }).eq("id", recipientId);
            const { data: campaign } = await getAdminClient().from("email_campaigns").select("opened_count").eq("id", campaignId).single();
            await getAdminClient().from("email_campaigns").update({ opened_count: (campaign?.opened_count ?? 0) + 1 }).eq("id", campaignId);
        }

        await getAdminClient().from("email_delivery_events").insert({
            recipient_id: recipientId,
            campaign_id: campaignId,
            profile_id: recipient.profile_id,
            email: recipient.email,
            event_type: "opened",
            event_status: "ok",
        });
    }

    return new NextResponse(PIXEL_BYTES, {
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, max-age=0",
        },
    });
}
