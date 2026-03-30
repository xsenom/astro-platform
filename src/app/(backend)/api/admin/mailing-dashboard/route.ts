import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

function toDayKey(value: string | null | undefined) {
    if (!value) return "";
    return new Date(value).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const db = getAdminClient();

    const [campaignsRes, guideReqRes, guideUnsubRes, deliveryRes] = await Promise.all([
        db
            .from("email_campaigns")
            .select("id, created_at, subject, status, recipients_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count")
            .order("created_at", { ascending: false })
            .limit(50),
        db
            .from("marketing_guide_requests")
            .select("created_at, status, email_sent"),
        db
            .from("marketing_contacts")
            .select("id", { head: true, count: "exact" })
            .eq("source", "uranus_guide_pdf")
            .eq("marketing_email_opt_in", false),
        db
            .from("email_delivery_events")
            .select("event_type, created_at")
            .order("created_at", { ascending: false })
            .limit(5000),
    ]);

    if (campaignsRes.error) return NextResponse.json({ ok: false, error: campaignsRes.error.message }, { status: 500 });
    if (guideReqRes.error) return NextResponse.json({ ok: false, error: guideReqRes.error.message }, { status: 500 });
    if (deliveryRes.error) return NextResponse.json({ ok: false, error: deliveryRes.error.message }, { status: 500 });

    const campaigns = campaignsRes.data ?? [];
    const guideRows = guideReqRes.data ?? [];
    const deliveryRows = deliveryRes.data ?? [];

    const emailTotals = {
        campaigns_total: campaigns.length,
        recipients_total: campaigns.reduce((sum, row) => sum + (row.recipients_count ?? 0), 0),
        sent_total: campaigns.reduce((sum, row) => sum + (row.sent_count ?? 0), 0),
        failed_total: campaigns.reduce((sum, row) => sum + (row.failed_count ?? 0), 0),
        opened_total: campaigns.reduce((sum, row) => sum + (row.opened_count ?? 0), 0),
        clicked_total: campaigns.reduce((sum, row) => sum + (row.clicked_count ?? 0), 0),
        unsubscribed_total: campaigns.reduce((sum, row) => sum + (row.unsubscribed_count ?? 0), 0),
    };

    const byDeliveryEvent = deliveryRows.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.event_type || "").toLowerCase();
        if (!key) return acc;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});

    const guideTotals = {
        requested_total: guideRows.length,
        sent_total: guideRows.filter((row) => row.status === "sent" || row.email_sent === true).length,
        failed_total: guideRows.filter((row) => row.status === "failed").length,
        unsubscribed_total: guideUnsubRes.count ?? 0,
    };

    const guideByDayMap = new Map<string, { day: string; requested: number; sent: number; failed: number }>();
    for (const row of guideRows) {
        const day = toDayKey(row.created_at);
        if (!day) continue;

        const bucket = guideByDayMap.get(day) ?? { day, requested: 0, sent: 0, failed: 0 };
        bucket.requested += 1;
        if (row.status === "sent" || row.email_sent === true) bucket.sent += 1;
        if (row.status === "failed") bucket.failed += 1;
        guideByDayMap.set(day, bucket);
    }

    const guideByDay = Array.from(guideByDayMap.values())
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-30);

    return NextResponse.json({
        ok: true,
        email_totals: {
            ...emailTotals,
            delivered_events_total: byDeliveryEvent.delivered ?? 0,
            opened_events_total: byDeliveryEvent.opened ?? 0,
            clicked_events_total: byDeliveryEvent.clicked ?? 0,
            unsubscribed_events_total: byDeliveryEvent.unsubscribed ?? 0,
        },
        guide_totals: guideTotals,
        guide_by_day: guideByDay,
        campaigns,
    });
}
