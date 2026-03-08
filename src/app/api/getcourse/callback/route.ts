import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // НЕ anon!
const CALLBACK_TOKEN = process.env.GETCOURSE_CALLBACK_TOKEN!;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
    try {
        const token = req.nextUrl.searchParams.get("token");
        if (!token || token !== CALLBACK_TOKEN) {
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
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
    }
}
