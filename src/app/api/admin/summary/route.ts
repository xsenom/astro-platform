import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

type SegmentKey = "all" | "paid" | "no_paid" | "calculations" | "inactive_30d" | "admins_test";

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

    return {
        all: allCount ?? 0,
        paid: paidSet.size,
        no_paid: Math.max((allCount ?? 0) - paidSet.size, 0),
        calculations: calcSet.size,
        inactive_30d: inactiveCount ?? 0,
        admins_test: adminsCount ?? 0,
    } satisfies Record<SegmentKey, number>;
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const [profilesRes, ordersRes, itemsRes, productsRes, pciRes, calculationsRes, campaignsRes, segmentCounts] = await Promise.all([
            getAdminClient()
                .from("profiles")
                .select("id, email, full_name, birth_date, birth_time, birth_city, created_at, updated_at")
                .order("created_at", { ascending: false })
                .limit(500),
            getAdminClient()
                .from("orders")
                .select("id, user_id, status, amount_cents, currency, provider, provider_order_id, paid_at, created_at")
                .order("created_at", { ascending: false })
                .limit(1000),
            getAdminClient().from("order_items").select("id, order_id, product_id, title_snapshot, price_cents, qty").limit(2000),
            getAdminClient().from("products").select("id, title, price_cents, currency").order("title", { ascending: true }).limit(2000),
            getAdminClient().from("product_calc_items").select("id, product_id, calc_type_id, qty").limit(5000),
            getAdminClient().from("calculations").select("id, user_id, status, created_at, updated_at").order("created_at", { ascending: false }).limit(2000),
            getAdminClient()
                .from("email_campaigns")
                .select("id, created_at, segment_key, subject, status, recipients_count, sent_count, failed_count, created_by")
                .order("created_at", { ascending: false })
                .limit(20),
            getSegmentCounts(),
        ]);

        if (profilesRes.error) return NextResponse.json({ ok: false, error: profilesRes.error.message }, { status: 500 });
        if (ordersRes.error) return NextResponse.json({ ok: false, error: ordersRes.error.message }, { status: 500 });
        if (itemsRes.error) return NextResponse.json({ ok: false, error: itemsRes.error.message }, { status: 500 });
        if (productsRes.error) return NextResponse.json({ ok: false, error: productsRes.error.message }, { status: 500 });
        if (pciRes.error) return NextResponse.json({ ok: false, error: pciRes.error.message }, { status: 500 });
        if (calculationsRes.error) return NextResponse.json({ ok: false, error: calculationsRes.error.message }, { status: 500 });

        const campaigns = campaignsRes.error ? [] : campaignsRes.data ?? [];

        return NextResponse.json({
            ok: true,
            profiles: profilesRes.data ?? [],
            orders: ordersRes.data ?? [],
            items: itemsRes.data ?? [],
            products: productsRes.data ?? [],
            product_calc_items: pciRes.data ?? [],
            calculations: calculationsRes.data ?? [],
            email_campaigns: campaigns,
            email_segments: segmentCounts,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
