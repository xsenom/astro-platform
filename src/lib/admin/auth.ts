import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing env: ${name}`);
    return value;
}

function getSupabaseConfig() {
    return {
        supabaseUrl: getEnv("NEXT_PUBLIC_SUPABASE_URL"),
        anonKey: getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    };
}

export function getAdminClient() {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export type AdminAuthResult = { userId: string; isSuper: boolean };

export async function getAdminAuth(req: NextRequest): Promise<AdminAuthResult | null> {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return null;

    const { supabaseUrl, anonKey } = getSupabaseConfig();
    const adminClient = getAdminClient();

    const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData } = await client.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;

    const { data: row } = await adminClient.from("admin_users").select("user_id, is_super").eq("user_id", userId).maybeSingle();
    if (!row?.user_id) return null;

    return { userId, isSuper: !!row.is_super };
}
