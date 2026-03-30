import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

const PIXEL_BASE64 =
    "R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

export async function GET(req: NextRequest) {
    const campaignId = req.nextUrl.searchParams.get("campaign");
    const recipientId = req.nextUrl.searchParams.get("recipient");

    if (!campaignId || !recipientId) {
        return new NextResponse(Buffer.from(PIXEL_BASE64, "base64"), {
            status: 200,
            headers: {
                "Content-Type": "image/gif",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        });
    }

    const admin = getAdminClient();

    const { data: recipient } = await admin
        .from("email_campaign_recipients")
        .select("id, campaign_id, profile_id, email, opened_at")
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .maybeSingle();

    if (recipient) {
        const firstOpenAt = recipient.opened_at || new Date().toISOString();

        await admin
            .from("email_campaign_recipients")
            .update({
                opened_at: firstOpenAt,
            })
            .eq("id", recipientId);

        await admin.from("email_delivery_events").insert({
            recipient_id: recipientId,
            campaign_id: campaignId,
            profile_id: recipient.profile_id ?? null,
            email: recipient.email ?? null,
            event_type: "opened",
            event_status: "success",
        });

        const { count } = await admin
            .from("email_campaign_recipients")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .not("opened_at", "is", null);

        await admin
            .from("email_campaigns")
            .update({
                opened_count: count || 0,
            })
            .eq("id", campaignId);
    }

    return new NextResponse(Buffer.from(PIXEL_BASE64, "base64"), {
        status: 200,
        headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        },
    });
}
