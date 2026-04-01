import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function getEnv(name: string) {
    return String(process.env[name] || "").trim();
}

function getAstroApiBase() {
    return (
        getEnv("ASTRO_API_BASE") ||
        getEnv("NEXT_PUBLIC_ASTRO_API_BASE") ||
        "http://127.0.0.1:8011"
    ).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
    try {
        const q = req.nextUrl.searchParams.get("q")?.trim() || "";

        if (q.length < 2) {
            return NextResponse.json({ ok: true, cities: [] });
        }

        const astroApiBase = getAstroApiBase();
        const url = new URL("/geo/suggest", astroApiBase);
        url.searchParams.set("q", q);

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: json?.detail || json?.error || "Не удалось получить список городов.",
                    cities: [],
                },
                { status: 500 }
            );
        }

        const cities = Array.isArray(json?.items)
            ? json.items
                  .map((item: { title?: string }) => String(item?.title || "").trim())
                  .filter(Boolean)
                  .slice(0, 7)
            : [];

        return NextResponse.json({ ok: true, cities });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        return NextResponse.json(
            { ok: false, error: message, cities: [] },
            { status: 500 }
        );
    }
}