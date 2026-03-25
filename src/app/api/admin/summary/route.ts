import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

type SegmentKey = "all" | "paid" | "no_paid" | "calculations" | "inactive_30d" | "admins_test" | "zodiac_aries" | "zodiac_taurus" | "zodiac_gemini" | "zodiac_cancer" | "zodiac_leo" | "zodiac_virgo" | "zodiac_libra" | "zodiac_scorpio" | "zodiac_sagittarius" | "zodiac_capricorn" | "zodiac_aquarius" | "zodiac_pisces" | "manual_list";

async function getSegmentCounts() {
    const [{ count: allCount, error: allErr }, { data: paidRows, error: paidErr }, { data: calcRows, error: calcErr }, { count: inactiveCount, error: inactiveErr }, { count: adminsCount, error: adminsErr }] =
        await Promise.all([
            getAdminClient().from("profiles").select("id", { count: "exact", head: true }),
            getAdminClient().from("orders").select("user_id").eq("status", "paid"),
            getAdminClient().from("calculations").select("user_id"),
            getAdminClient().from("profiles").select("id", { count: "exact", head: true }).lt("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
            getAdminClient().from("admin_users").select("user_id", { count: "exact", head: true }),
        ]);

    if (allErr) throw new Error(allErr.message);
    if (paidErr) throw new Error(paidErr.message);
    if (calcErr) throw new Error(calcErr.message);
    if (inactiveErr) throw new Error(inactiveErr.message);
    if (adminsErr) throw new Error(adminsErr.message);

    const paidSet = new Set((paidRows ?? []).map((row) => row.user_id).filter(Boolean));
    const calcSet = new Set((calcRows ?? []).map((row) => row.user_id).filter(Boolean));
    const { data: zodiacRows, error: zodiacErr } = await getAdminClient().from("profiles").select("zodiac_sign");
    if (zodiacErr) throw new Error(zodiacErr.message);

    const zodiacCounts: Record<string, number> = {};
    for (const row of zodiacRows ?? []) {
        const key = String(row.zodiac_sign || "").trim();
        if (!key) continue;
        zodiacCounts[key] = (zodiacCounts[key] || 0) + 1;
    }

    return {
        all: allCount ?? 0,
        paid: paidSet.size,
        no_paid: Math.max((allCount ?? 0) - paidSet.size, 0),
        calculations: calcSet.size,
        inactive_30d: inactiveCount ?? 0,
        admins_test: adminsCount ?? 0,
        zodiac_aries: zodiacCounts.aries ?? 0,
        zodiac_taurus: zodiacCounts.taurus ?? 0,
        zodiac_gemini: zodiacCounts.gemini ?? 0,
        zodiac_cancer: zodiacCounts.cancer ?? 0,
        zodiac_leo: zodiacCounts.leo ?? 0,
        zodiac_virgo: zodiacCounts.virgo ?? 0,
        zodiac_libra: zodiacCounts.libra ?? 0,
        zodiac_scorpio: zodiacCounts.scorpio ?? 0,
        zodiac_sagittarius: zodiacCounts.sagittarius ?? 0,
        zodiac_capricorn: zodiacCounts.capricorn ?? 0,
        zodiac_aquarius: zodiacCounts.aquarius ?? 0,
        zodiac_pisces: zodiacCounts.pisces ?? 0,
        manual_list: 0,

    } satisfies Record<SegmentKey, number>;
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {

        const [ordersRes, itemsRes, productsRes, pciRes, calculationsRes, segmentCounts, deliveryStatsRes] = await Promise.all([
            getAdminClient()
                .from("orders")
                .select("id, user_id, status, amount_cents, currency, provider, provider_order_id, paid_at, created_at")
                .order("created_at", { ascending: false })
                .limit(1000),
            getAdminClient().from("order_items").select("id, order_id, product_id, title_snapshot, price_cents, qty").limit(2000),
            getAdminClient().from("products").select("id, title, price_cents, currency").order("title", { ascending: true }).limit(2000),
            getAdminClient().from("product_calc_items").select("id, product_id, calc_type_id, qty").limit(5000),
            getAdminClient().from("calculations").select("id, user_id, calc_type, status, created_at, updated_at").order("created_at", { ascending: false }).limit(2000),
            getSegmentCounts(),
            getAdminClient().from("email_delivery_events").select("event_type, event_status"),

        ]);

        if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 500 });
        if (itemsRes.error) return NextResponse.json({ ok: false, error: itemsRes.error.message }, { status: 500 });
        if (productsRes.error) return NextResponse.json({ ok: false, error: productsRes.error.message }, { status: 500 });
        if (pciRes.error) return NextResponse.json({ ok: false, error: pciRes.error.message }, { status: 500 });
        if (calculationsRes.error) return NextResponse.json({ ok: false, error: calculationsRes.error.message }, { status: 500 });

        const campaignsWithMetricsRes = await getAdminClient()
            .from("email_campaigns")
            .select("id, created_at, segment_key, subject, status, recipients_count, sent_count, failed_count, opened_count, clicked_count, unsubscribed_count, created_by")
            .order("created_at", { ascending: false })
            .limit(20);

        let campaigns = campaignsWithMetricsRes.data ?? [];
        if (campaignsWithMetricsRes.error) {
            const campaignsLegacyRes = await getAdminClient()
                .from("email_campaigns")
                .select("id, created_at, segment_key, subject, status, recipients_count, sent_count, failed_count, created_by")
                .order("created_at", { ascending: false })
                .limit(20);

            if (!campaignsLegacyRes.error) {
                campaigns = (campaignsLegacyRes.data ?? []).map((campaign) => ({
                    ...campaign,
                    opened_count: 0,
                    clicked_count: 0,
                    unsubscribed_count: 0,
                }));
            }
        }

        const orders = ordersRes.data ?? [];
        const paidOrders = orders.filter((order) => order.status === "paid" || order.paid_at);
        const totalRevenueCents = paidOrders.reduce((sum, order) => sum + (order.amount_cents ?? 0), 0);
        const averageCheckCents = paidOrders.length ? Math.round(totalRevenueCents / paidOrders.length) : 0;

        const [{ count: relatedProfilesCount }, { count: marketingContactsCount }, { data: deliveryRows }] = await Promise.all([
            getAdminClient().from("user_related_profiles").select("id", { head: true, count: "exact" }),
            getAdminClient().from("marketing_contacts").select("id", { head: true, count: "exact" }),
            getAdminClient().from("email_delivery_events").select("event_type"),
        ]);

        const emailOpened = (deliveryRows ?? []).filter((row) => row.event_type === "opened").length;
        const emailDelivered = (deliveryRows ?? []).filter((row) => row.event_type === "delivered").length;
        const emailFailed = (deliveryRows ?? []).filter((row) => row.event_type === "failed").length;
        const emailClicked = (deliveryRows ?? []).filter((row) => row.event_type === "clicked").length;
        const emailUnsubscribed = (deliveryRows ?? []).filter((row) => row.event_type === "unsubscribed").length;

        return NextResponse.json({
            ok: true,
            profiles: [],
            orders,
            items: itemsRes.data ?? [],
            products: productsRes.data ?? [],
            product_calc_items: pciRes.data ?? [],
            calculations: calculationsRes.data ?? [],
            email_campaigns: campaigns,
            email_segments: segmentCounts,
            email_delivery_stats: deliveryStatsRes.error ? [] : deliveryStatsRes.data ?? [],
            dashboard_stats: {
                total_revenue_cents: totalRevenueCents,
                total_paid_orders: paidOrders.length,
                average_check_cents: averageCheckCents,
                total_related_profiles: relatedProfilesCount ?? 0,
                total_marketing_contacts: marketingContactsCount ?? 0,
                email_opened: emailOpened,
                email_delivered: emailDelivered,
                email_failed: emailFailed,
                email_clicked: emailClicked,
                email_unsubscribed: emailUnsubscribed,
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
