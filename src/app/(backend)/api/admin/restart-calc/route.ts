import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export async function POST(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const calcId = String(body.calc_id || "").trim();
    if (!calcId) return NextResponse.json({ ok: false, error: "calc_id required" }, { status: 400 });

    const now = new Date().toISOString();

    const { error } = await getAdminClient()
        .from("calculations")
        .update({ status: "queued", updated_at: now })
        .eq("id", calcId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
