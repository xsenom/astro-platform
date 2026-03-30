import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function getEnv(name: string) {
    return String(process.env[name] || "").trim();
}

export async function POST(req: NextRequest) {
    const admin = getAdminClient();
    let requestId: string | null = null;

    try {
        const body = await req.json();

        const fullName = String(body?.full_name || "").trim();
        const email = normalizeEmail(body?.email);
        const birthDate = String(body?.birth_date || "").trim();
        const birthTime = String(body?.birth_time || "").trim();
        const birthCity = String(body?.birth_city || "").trim();
        const months = Number(body?.months || 1);

        if (!fullName || !email || !birthDate || !birthTime || !birthCity) {
            return NextResponse.json({ ok: false, error: "Заполните имя, email, дату, время и город рождения." }, { status: 400 });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ ok: false, error: "Некорректный email." }, { status: 400 });
        }

        const { data: inserted, error: insertError } = await admin
            .from("favorable_days_requests")
            .insert({
                full_name: fullName,
                email,
                birth_date: birthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                months: Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1,
                status: "requested",
                email_sent: false,
            })
            .select("id")
            .single();

        if (insertError) {
            return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
        }
        requestId = String(inserted.id);

        const calendarRes = await fetch(new URL("/api/astro/big-calendar", req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                birth_date: birthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                name: fullName,
                months: Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1,
            }),
        });

        const calendarJson = await calendarRes.json().catch(() => null);
        if (!calendarRes.ok || !calendarJson?.ok) {
            const message = calendarJson?.error || "Не удалось рассчитать благоприятные дни.";

            if (requestId) {
                await admin.from("favorable_days_requests").update({
                    status: "failed",
                    email_error: message,
                    updated_at: new Date().toISOString(),
                }).eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const resultText = String(calendarJson?.report_text || "").trim() || String(calendarJson?.summary_text || "").trim() || "Расчёт выполнен.";

        const smtpHost = getEnv("SMTP_HOST");
        const smtpPort = Number(getEnv("SMTP_PORT") || "0");
        const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
        const smtpUser = getEnv("SMTP_USER");
        const smtpPass = getEnv("SMTP_PASS");
        const smtpFrom = getEnv("SMTP_FROM");

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            await admin.from("favorable_days_requests").update({
                status: "failed",
                email_error: "SMTP не настроен",
                result_text: resultText,
                updated_at: new Date().toISOString(),
            }).eq("id", requestId);

            return NextResponse.json({ ok: false, error: "SMTP не настроен." }, { status: 500 });
        }

        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            from: smtpFrom,
            to: email,
            subject: "Ваши благоприятные дни на месяц",
            text: `Здравствуйте, ${fullName}!\n\n${resultText}`,
            html: `<div style=\"font-family:Arial,sans-serif;line-height:1.6\"><p>Здравствуйте, ${fullName}!</p><p>Ваш расчёт благоприятных дней готов:</p><pre style=\"white-space:pre-wrap\">${resultText}</pre></div>`,
        });

        await admin.from("favorable_days_requests").update({
            status: "sent",
            email_sent: true,
            email_error: null,
            result_text: resultText,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq("id", requestId);

        return NextResponse.json({ ok: true, email_sent: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (requestId) {
            await admin.from("favorable_days_requests").update({
                status: "failed",
                email_error: message,
                updated_at: new Date().toISOString(),
            }).eq("id", requestId);
        }

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
