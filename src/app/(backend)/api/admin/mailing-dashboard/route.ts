import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

function toDayKey(value: string | null | undefined) {
    if (!value) return "";
    return new Date(value).toISOString().slice(0, 10);
}

function isSchemaError(message: string) {
    const text = String(message || "").toLowerCase();
    return text.includes("does not exist") || text.includes("column") || text.includes("relation") || text.includes("schema cache") || text.includes("could not find the table");
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const db = getAdminClient();

    const campaignsRes = await db
        .from("email_campaigns")
        .select("id, created_at, subject, status, recipients_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count")
        .order("created_at", { ascending: false })
        .limit(50);

    let campaigns = campaignsRes.data ?? [];
    if (campaignsRes.error) {
        const legacyRes = await db
            .from("email_campaigns")
            .select("id, created_at, subject, status, recipients_count, sent_count, failed_count")
            .order("created_at", { ascending: false })
            .limit(50);

        if (legacyRes.error) {
            return NextResponse.json({ ok: false, error: legacyRes.error.message }, { status: 500 });
        }

        campaigns = (legacyRes.data ?? []).map((row) => ({
            ...row,
            opened_count: 0,
            clicked_count: 0,
            unsubscribed_count: 0,
        }));
    }

    const [guideReqRes, guideUnsubRes, deliveryRes, favorableReqRes] = await Promise.all([
        db.from("marketing_guide_requests").select("created_at, status, email_sent"),
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
        db.from("favorable_days_requests").select("created_at, status, email_sent"),
    ]);

    if (deliveryRes.error) return NextResponse.json({ ok: false, error: deliveryRes.error.message }, { status: 500 });
    if (guideReqRes.error && !isSchemaError(guideReqRes.error.message)) {
        return NextResponse.json({ ok: false, error: guideReqRes.error.message }, { status: 500 });
    }
    if (favorableReqRes.error && !isSchemaError(favorableReqRes.error.message)) {
        return NextResponse.json({ ok: false, error: favorableReqRes.error.message }, { status: 500 });
    }

    const guideRows = guideReqRes.error ? [] : guideReqRes.data ?? [];
    const favorableRows = favorableReqRes.error ? [] : favorableReqRes.data ?? [];
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

    const unsubscribedTotal = guideUnsubRes.error ? 0 : guideUnsubRes.count ?? 0;

    const guideTotals = {
        requested_total: guideRows.length,
        sent_total: guideRows.filter((row) => row.status === "sent" || row.email_sent === true).length,
        failed_total: guideRows.filter((row) => row.status === "failed").length,
        unsubscribed_total: unsubscribedTotal,
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

    const favorableByDayMap = new Map<string, { day: string; requested: number; sent: number; failed: number }>();
    for (const row of favorableRows) {
        const day = toDayKey(row.created_at);
        if (!day) continue;

        const bucket = favorableByDayMap.get(day) ?? { day, requested: 0, sent: 0, failed: 0 };
        bucket.requested += 1;
        if (row.status === "sent" || row.email_sent === true) bucket.sent += 1;
        if (row.status === "failed") bucket.failed += 1;
        favorableByDayMap.set(day, bucket);
    }

    const favorableByDay = Array.from(favorableByDayMap.values())
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
        favorable_days_totals: {
            requested_total: favorableRows.length,
            sent_total: favorableRows.filter((row) => row.status === "sent" || row.email_sent === true).length,
            failed_total: favorableRows.filter((row) => row.status === "failed").length,
        },
        favorable_days_by_day: favorableByDay,
        campaigns,
    });
}
