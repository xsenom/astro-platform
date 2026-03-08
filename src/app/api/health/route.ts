import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anon) {
        return NextResponse.json(
            {
                ok: false,
                status: "missing_env",
                message: "Не заданы NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY",
            },
            { status: 500 }
        );
    }

    const client = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await client.from("profiles").select("id", { head: true, count: "exact" });

    if (error) {
        return NextResponse.json(
            {
                ok: false,
                status: "supabase_error",
                message: "Supabase доступен, но запрос к БД завершился ошибкой.",
                details: error.message,
            },
            { status: 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        status: "ok",
        message: "Подключение к Supabase и запрос к БД выполнены успешно.",
    });
}
