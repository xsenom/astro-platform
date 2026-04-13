import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing env: ${name}`);
    return value;
}

export async function POST(req: NextRequest) {
    try {
        const callbackToken = getEnv("GETCOURSE_CALLBACK_TOKEN");
        const token = req.nextUrl.searchParams.get("token");
        if (!token || token !== callbackToken) {
            return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        // ожидаем JSON из GetCourse процесса
        // ты сама задашь поля в "Вызвать URL"
        const body = await req.json();

        // ВАЖНОЕ: нам нужен local_order_id (это orders.id в нашей БД),
        // который мы передали в GetCourse ссылке/скрытом поле формы.
        const localOrderId = String(body.local_order_id || "").trim();
        const kind = String(body.kind || "").trim(); // profile_update / add_person
        const gcOrderId = String(body.gc_order_id || body.order_id || "").trim();
        const email = String(body.email || body.user_email || "").trim();

        if (!localOrderId) {
            return NextResponse.json({ ok: false, error: "missing local_order_id" }, { status: 400 });
        }

        const supabaseAdmin = createClient(
            getEnv("NEXT_PUBLIC_SUPABASE_URL"),
            getEnv("SUPABASE_SERVICE_ROLE_KEY") // НЕ anon!
        );

        // помечаем заказ оплаченным
        const { error } = await supabaseAdmin
            .from("orders")
            .update({
                status: "paid",
                paid_at: new Date().toISOString(),
                provider: "getcourse",
                provider_order_id: gcOrderId || null,
                customer_email: email || null,
                kind: kind || null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", localOrderId);

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
