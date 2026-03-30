import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

function isSchemaError(message: string) {
    const text = String(message || "").toLowerCase();
    return text.includes("does not exist") || text.includes("column") || text.includes("relation") || text.includes("schema cache");
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const userId = String(req.nextUrl.searchParams.get("userId") || "").trim();
    if (!userId) {
        return NextResponse.json({ ok: false, error: "Укажите userId." }, { status: 400 });
    }

    const client = getAdminClient();

    const [{ data: profile, error: profileError }, { data: orders, error: ordersError }] = await Promise.all([
        client
            .from("profiles")
            .select("id, email, utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_referrer, marketing_email_opt_in, is_blocked")
            .eq("id", userId)
            .maybeSingle(),
        client
            .from("orders")
            .select("id, status, amount_cents, currency, provider, paid_at, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(30),
    ]);

    if (profileError) return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
    if (ordersError) return NextResponse.json({ ok: false, error: ordersError.message }, { status: 500 });

    const eventsByProfileRes = await client
        .from("email_delivery_events")
        .select("event_type, event_status, created_at")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

    let events = eventsByProfileRes.data ?? [];
    if (eventsByProfileRes.error) {
        if (!isSchemaError(eventsByProfileRes.error.message)) {
            return NextResponse.json({ ok: false, error: eventsByProfileRes.error.message }, { status: 500 });
        }

        const email = String(profile?.email || "").trim().toLowerCase();
        if (email) {
            const eventsByEmailRes = await client
                .from("email_delivery_events")
                .select("event_type, event_status, created_at")
                .eq("email", email)
                .order("created_at", { ascending: false })
                .limit(200);

            if (eventsByEmailRes.error && !isSchemaError(eventsByEmailRes.error.message)) {
                return NextResponse.json({ ok: false, error: eventsByEmailRes.error.message }, { status: 500 });
            }

            events = eventsByEmailRes.error ? [] : eventsByEmailRes.data ?? [];
        } else {
            events = [];
        }
    }

    const paidOrders = (orders ?? []).filter((order) => ["paid", "succeeded", "success"].includes(String(order.status || "").toLowerCase()) || order.paid_at);
    const totalRevenueCents = paidOrders.reduce((sum, order) => sum + (Number(order.amount_cents) || 0), 0);

    const eventCounts = events.reduce<Record<string, number>>((acc, event) => {
        const key = String(event.event_type || "").toLowerCase();
        if (!key) return acc;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});

    return NextResponse.json({
        ok: true,
        profile: profile ?? null,
        orders: orders ?? [],
        order_stats: {
            total_orders: (orders ?? []).length,
            paid_orders: paidOrders.length,
            total_revenue_cents: totalRevenueCents,
        },
        email_stats: {
            delivered: eventCounts.delivered ?? 0,
            opened: eventCounts.opened ?? 0,
            clicked: eventCounts.clicked ?? 0,
            unsubscribed: eventCounts.unsubscribed ?? 0,
            failed: eventCounts.failed ?? 0,
        },
        recent_email_events: events,
    });
}
