import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function mustEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env: ${name}`);
    return v;
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
});

type IdRow = { id: string };

export async function GET() {
    try {
        const { data: profiles, error: pErr } = await admin
            .from("profiles")
            .select("id, email, full_name, birth_date, birth_time, birth_city, created_at, updated_at")
            .order("created_at", { ascending: false })
            .limit(500);

        if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

        const { data: orders, error: oErr } = await admin
            .from("orders")
            .select("id, user_id, status, amount_cents, currency, provider, provider_order_id, paid_at, created_at")
            .order("created_at", { ascending: false })
            .limit(1000);

        if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

        const { data: items, error: iErr } = await admin
            .from("order_items")
            .select("id, order_id, product_id, title_snapshot, price_cents, qty")
            .limit(2000);

        if (iErr) return NextResponse.json({ ok: false, error: iErr.message }, { status: 500 });

        // ✅ active убран (колонки нет)
        const { data: products, error: prErr } = await admin
            .from("products")
            .select("id, title, price_cents, currency")
            .order("title", { ascending: true })
            .limit(2000);

        if (prErr) return NextResponse.json({ ok: false, error: prErr.message }, { status: 500 });

        const { data: pci, error: pciErr } = await admin
            .from("product_calc_items")
            .select("id, product_id, calc_type_id, qty")
            .limit(5000);

        // ⚠️ Если у тебя в product_calc_items тоже НЕТ calc_type_id — скажи, и я поправлю под реальное имя
        if (pciErr) return NextResponse.json({ ok: false, error: pciErr.message }, { status: 500 });

        // ✅ calc_type_id убран (колонки нет)
        const { data: calculations, error: cErr } = await admin
            .from("calculations")
            .select("id, user_id, status, created_at, updated_at")
            .order("created_at", { ascending: false })
            .limit(2000);

        if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

        return NextResponse.json({
            ok: true,
            profiles,
            orders,
            items,
            products,
            product_calc_items: pci,
            calculations,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
