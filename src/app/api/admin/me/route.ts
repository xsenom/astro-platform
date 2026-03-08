import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SRV);

export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ ok: true, is_admin: false });

    // проверяем пользователя по токену (anon)
    const client = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: u } = await client.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return NextResponse.json({ ok: true, is_admin: false });

    // проверяем в admin_users (service role)
    const { data: row } = await admin
        .from("admin_users")
        .select("is_super")
        .eq("user_id", userId)
        .maybeSingle();

    return NextResponse.json({ ok: true, is_admin: !!row?.is_super });
}
