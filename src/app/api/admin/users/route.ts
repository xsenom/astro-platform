import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type UpdateUserPayload = {
    userId?: string;
    email?: string | null;
    full_name?: string | null;
    birth_date?: string | null;
    birth_time?: string | null;
    birth_city?: string | null;
};

type UserActionPayload = {
    action?: string;
    userId?: string;
    email?: string | null;
};

function parsePositiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
}

function escapeLike(value: string) {
    return value.replace(/[,%]/g, (char) => `\\${char}`);
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeOptional(value: string | null | undefined) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function parseBirthDateInput(value: string | null) {
    if (!value) return null;

    const dotMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dotMatch) {
        const [, day, month, year] = dotMatch;
        return `${year}-${month}-${day}`;
    }

    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return value;

    throw new Error("Дата рождения должна быть в формате дд.мм.гггг.");
}

function parseBirthTimeInput(value: string | null) {
    if (!value) return null;

    const hhmm = value.match(/^(\d{2}):(\d{2})$/);
    if (hhmm) return `${hhmm[1]}:${hhmm[2]}:00`;

    const hhmmss = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
    if (hhmmss) return value;

    throw new Error("Время рождения должно быть в формате ЧЧ:ММ.");
}

function getResetRedirectUrl(req: NextRequest) {
    const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (publicAppUrl) {
        return `${publicAppUrl.replace(/\/$/, "")}/reset-password`;
    }

    const origin = req.nextUrl.origin;
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return "";
    }

    return `${origin}/reset-password`;
}

export async function GET(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const page = parsePositiveInt(req.nextUrl.searchParams.get("page"), 1);
        const pageSize = Math.min(
            parsePositiveInt(req.nextUrl.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
            MAX_PAGE_SIZE
        );
        const q = (req.nextUrl.searchParams.get("q") || "").trim();
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = getAdminClient()
            .from("profiles")
            .select("id, email, full_name, birth_date, birth_time, birth_city, created_at, updated_at", {
                count: "exact",
            })
            .order("created_at", { ascending: false });

        if (q) {
            const safeQuery = escapeLike(q);
            const filters = [`email.ilike.%${safeQuery}%`, `full_name.ilike.%${safeQuery}%`];

            if (isUuid(q)) {
                filters.push(`id.eq.${q}`);
            }

            query = query.or(filters.join(","));
        }

        const { data, count, error } = await query.range(from, to);

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        const total = count ?? 0;
        const totalPages = Math.max(Math.ceil(total / pageSize), 1);

        return NextResponse.json({
            ok: true,
            profiles: data ?? [],
            pagination: {
                page,
                pageSize,
                total,
                totalPages,
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json()) as UpdateUserPayload;
        const userId = body.userId?.trim();
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ ok: false, error: "Некорректный userId." }, { status: 400 });
        }

        const email = normalizeOptional(body.email)?.toLowerCase() ?? null;
        if (!email) {
            return NextResponse.json({ ok: false, error: "Email не может быть пустым." }, { status: 400 });
        }

        const fullName = normalizeOptional(body.full_name);
        const birthDate = parseBirthDateInput(normalizeOptional(body.birth_date));
        const birthTime = parseBirthTimeInput(normalizeOptional(body.birth_time));
        const birthCity = normalizeOptional(body.birth_city);

        const adminClient = getAdminClient();

        if (email) {
            const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email });
            if (authError) {
                return NextResponse.json({ ok: false, error: authError.message }, { status: 500 });
            }
        }

        const { data, error } = await adminClient
            .from("profiles")
            .update({
                email,
                full_name: fullName,
                birth_date: birthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                updated_at: new Date().toISOString(),
            })
            .eq("id", userId)
            .select("id, email, full_name, birth_date, birth_time, birth_city, created_at, updated_at")
            .single();

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, profile: data });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    try {
        const body = (await req.json()) as UserActionPayload;
        if (body.action !== "send_password_reset") {
            return NextResponse.json({ ok: false, error: "Неизвестное действие." }, { status: 400 });
        }

        const userId = body.userId?.trim();
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ ok: false, error: "Некорректный userId." }, { status: 400 });
        }

        let email = normalizeOptional(body.email)?.toLowerCase() ?? null;
        const adminClient = getAdminClient();

        if (!email) {
            const { data: profile, error: profileError } = await adminClient
                .from("profiles")
                .select("email")
                .eq("id", userId)
                .maybeSingle();

            if (profileError) {
                return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
            }

            email = normalizeOptional(profile?.email)?.toLowerCase() ?? null;
        }

        if (!email) {
            return NextResponse.json({ ok: false, error: "У пользователя не указан email." }, { status: 400 });
        }

        const redirectTo = getResetRedirectUrl(req);
        const { data, error } = await adminClient.auth.admin.generateLink({
            type: "recovery",
            email,
            options: redirectTo ? { redirectTo } : undefined,
        });

        if (error) {
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            message: `Письмо для сброса пароля отправлено на ${email}.`,
            action_link: data.properties?.action_link ?? null,
            email,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
