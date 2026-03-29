import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

type ActionPayload = {
    userId?: string;
    calcId?: string;
};

function getEnv(name: string): string | null {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : null;
}

function getSmtpConfig() {
    const host = getEnv("SMTP_HOST");
    const port = Number(getEnv("SMTP_PORT") || 587);
    const username = getEnv("SMTP_USER");
    const password = getEnv("SMTP_PASS");
    const secure = String(getEnv("SMTP_SECURE") || "false").toLowerCase() === "true";

    if (!host || !username || !password) {
        throw new Error("SMTP не настроен. Укажите SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS и SMTP_FROM.");
    }

    return { host, port, username, password, secure };
}

function isForecastKind(kind: string | null | undefined) {
    return ["day", "week", "month", "big_calendar"].includes(String(kind || "").trim());
}

function getCalcLabel(kind: string) {
    const labels: Record<string, string> = {
        natal: "Натальная карта",
        day: "Прогноз на день",
        week: "Прогноз на неделю",
        month: "Прогноз на месяц",
        big_calendar: "Большой календарь",
    };

    return labels[kind] ?? kind;
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildCalculationHtml(params: {
    fullName: string | null;
    calcLabel: string;
    targetDate: string | null;
    updatedAt: string | null;
    resultText: string;
    pdfUrl: string | null;
    fileName: string | null;
}) {
    const greeting = params.fullName ? `Здравствуйте, ${escapeHtml(params.fullName)}!` : "Здравствуйте!";
    const safeText = escapeHtml(params.resultText).replace(/\n/g, "<br />");

    return `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;">
            <p>${greeting}</p>
            <p>По вашему запросу повторно отправляем расчёт <strong>${escapeHtml(params.calcLabel)}</strong>.</p>
            <ul>
                ${params.targetDate ? `<li><strong>Дата расчёта:</strong> ${escapeHtml(params.targetDate)}</li>` : ""}
                ${params.updatedAt ? `<li><strong>Последнее обновление:</strong> ${new Date(params.updatedAt).toLocaleString("ru-RU")}</li>` : ""}
                ${params.fileName ? `<li><strong>Файл:</strong> ${escapeHtml(params.fileName)}</li>` : ""}
            </ul>
            ${params.pdfUrl ? `<p><a href="${escapeHtml(params.pdfUrl)}">Открыть PDF-версию расчёта</a></p>` : ""}
            <div style="margin-top:16px;padding:16px;border-radius:12px;background:#f3f4f6;white-space:pre-wrap;">${safeText}</div>
        </div>
    `;
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const userId = (req.nextUrl.searchParams.get("userId") || "").trim();
    if (!userId) {
        return NextResponse.json({ ok: false, error: "Укажите userId." }, { status: 400 });
    }

    const [savedRes, queueRes] = await Promise.all([
        getAdminClient()
            .from("saved_calculations")
            .select("id, kind, target_date, updated_at, pdf_url, file_name, result_text")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false }),
        getAdminClient()
            .from("calculations")
            .select("id, calc_type, status, updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false }),
    ]);

    if (savedRes.error) {
        return NextResponse.json({ ok: false, error: savedRes.error.message }, { status: 500 });
    }

    if (queueRes.error) {
        return NextResponse.json({ ok: false, error: queueRes.error.message }, { status: 500 });
    }

    const savedCalculations = (savedRes.data ?? []).filter((calc) => isForecastKind(calc.kind));
    const queueCalculations = (queueRes.data ?? [])
        .filter((calc) => isForecastKind(calc.calc_type))
        .map((calc) => ({
            id: calc.id,
            kind: String(calc.calc_type || "").trim(),
            status: calc.status ?? null,
            updated_at: calc.updated_at ?? null,
        }));

    return NextResponse.json({ ok: true, savedCalculations, queueCalculations });
}

export async function POST(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json().catch(() => ({}))) as ActionPayload;
        const userId = String(body.userId || "").trim();
        const calcId = String(body.calcId || "").trim();

        if (!userId || !calcId) {
            return NextResponse.json({ ok: false, error: "Нужны userId и calcId." }, { status: 400 });
        }

        const adminClient = getAdminClient();
        const { data: profile, error: profileError } = await adminClient
            .from("profiles")
            .select("id, email, full_name")
            .eq("id", userId)
            .maybeSingle();

        if (profileError) {
            return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
        }

        const email = typeof profile?.email === "string" ? profile.email.trim() : "";
        if (!email) {
            return NextResponse.json({ ok: false, error: "У пользователя не указан email." }, { status: 400 });
        }

        const { data: calc, error: calcError } = await adminClient
            .from("saved_calculations")
            .select("id, kind, target_date, updated_at, pdf_url, file_name, result_text")
            .eq("id", calcId)
            .eq("user_id", userId)
            .maybeSingle();

        if (calcError) {
            return NextResponse.json({ ok: false, error: calcError.message }, { status: 500 });
        }

        if (!calc) {
            return NextResponse.json({ ok: false, error: "Расчёт не найден." }, { status: 404 });
        }

        if (!isForecastKind(calc.kind)) {
            return NextResponse.json({ ok: false, error: "Бесплатно можно отправлять только сохранённые прогнозы." }, { status: 400 });
        }

        const from = getEnv("SMTP_FROM");
        const replyTo = getEnv("SMTP_REPLY_TO") || from;
        if (!from) return NextResponse.json({ ok: false, error: "Не задан SMTP_FROM." }, { status: 500 });

        const calcLabel = getCalcLabel(calc.kind);
        const subject = `${calcLabel} — повторная отправка расчёта`;
        const text = [
            profile?.full_name ? `Здравствуйте, ${profile.full_name}!` : "Здравствуйте!",
            `Повторно отправляем ваш расчёт: ${calcLabel}.`,
            calc.target_date ? `Дата расчёта: ${calc.target_date}` : "",
            calc.updated_at ? `Последнее обновление: ${new Date(calc.updated_at).toLocaleString("ru-RU")}` : "",
            calc.pdf_url ? `PDF: ${calc.pdf_url}` : "",
            "",
            calc.result_text || "",
        ]
            .filter(Boolean)
            .join("\n");

        await sendSmtpMail({
            ...getSmtpConfig(),
            from,
            to: email,
            subject,
            text,
            html: buildCalculationHtml({
                fullName: profile?.full_name ?? null,
                calcLabel,
                targetDate: calc.target_date ?? null,
                updatedAt: calc.updated_at ?? null,
                resultText: calc.result_text || "",
                pdfUrl: calc.pdf_url ?? null,
                fileName: calc.file_name ?? null,
            }),
            replyTo: replyTo || undefined,
        });

        return NextResponse.json({ ok: true, message: `Расчёт «${calcLabel}» отправлен на ${email}.` });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
