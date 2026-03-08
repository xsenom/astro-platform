import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SUPABASE_URL, SRV);

async function requireAdmin(req: NextRequest) {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;

    const client = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u } = await client.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return null;

    const { data: row } = await admin
        .from("admin_users")
        .select("is_super")
        .eq("user_id", userId)
        .maybeSingle();

    return row?.is_super ? userId : null;
}

export async function POST(req: NextRequest) {
    const adminId = await requireAdmin(req);
    if (!adminId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const calcId = String(body.calc_id || "").trim();
    if (!calcId) return NextResponse.json({ ok: false, error: "calc_id required" }, { status: 400 });

    const now = new Date().toISOString();

    const { error } = await admin
        .from("calculations")
        .update({ status: "queued", updated_at: now })
        .eq("id", calcId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
