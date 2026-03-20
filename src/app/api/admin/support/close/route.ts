import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function envStrict(name: string): string {
    const v = process.env[name];
    if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
    return v.trim();
}

function createAuthedClient(authHeader: string) {
    return createClient(
        envStrict("NEXT_PUBLIC_SUPABASE_URL"),
        envStrict("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
            global: {
                headers: {
                    Authorization: authHeader,
                },
            },
        }
    );
}

function createServiceClient() {
    return createClient(
        envStrict("NEXT_PUBLIC_SUPABASE_URL"),
        envStrict("SUPABASE_SERVICE_ROLE_KEY"),
        {
            auth: {
                persistSession: false,
            },
        }
    );
}

async function requireAdmin(authHeader: string) {
    const authed = createAuthedClient(authHeader);

    const { data: userData, error: userErr } = await authed.auth.getUser();
    if (userErr || !userData.user) {
        return { ok: false as const, status: 401, error: "unauthorized" };
    }

    const userId = userData.user.id;
    const service = createServiceClient();

    const { data: adminRow, error: adminErr } = await service
        .from("admin_users")
        .select("user_id, is_super")
        .eq("user_id", userId)
        .eq("is_super", true)
        .maybeSingle();

    if (adminErr || !adminRow) {
        return { ok: false as const, status: 403, error: "forbidden" };
    }

    return { ok: true as const, userId };
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization");
        if (!authHeader?.toLowerCase().startsWith("bearer ")) {
            return NextResponse.json({ ok: false, error: "missing bearer token" }, { status: 401 });
        }

        const access = await requireAdmin(authHeader);
        if (!access.ok) {
            return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
        }

        const body = await req.json();
        const thread_id = String(body?.thread_id || "").trim();

        if (!thread_id) {
            return NextResponse.json({ ok: false, error: "thread_id required" }, { status: 400 });
        }

        const sb = createServiceClient();

        const { error } = await sb
            .from("support_threads")
            .update({
                status: "closed",
                updated_at: new Date().toISOString(),
            })
            .eq("id", thread_id);

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}