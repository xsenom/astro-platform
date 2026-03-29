import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin/auth";

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);

    return NextResponse.json({
        ok: true,
        is_admin: !!admin,
        is_super: !!admin?.isSuper,
        user_id: admin?.userId ?? null,
    });
}
