import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminClient } from "@/lib/admin/auth";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
}

function escapeLike(value: string) {
    return value.replace(/[,%]/g, (char) => `\\${char}`);
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
            query = query.or(`id.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,full_name.ilike.%${safeQuery}%`);
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
