import { NextRequest, NextResponse } from 'next/server';

const ASTRO_BACKEND_URL =
    process.env.ASTRO_BACKEND_URL || 'http://127.0.0.1:8015';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const year = Number.parseInt(String(body?.year ?? ''), 10);
        const month = Number.parseInt(String(body?.month ?? ''), 10);
        const day = Number.parseInt(String(body?.day ?? ''), 10);
        const hour = Number.parseInt(String(body?.hour ?? ''), 10);
        const minute = Number.parseInt(String(body?.minute ?? ''), 10);
        const cityName = String(body?.city_name ?? '').trim();

        if (
            !Number.isFinite(year) ||
            !Number.isFinite(month) ||
            !Number.isFinite(day) ||
            !Number.isFinite(hour) ||
            !Number.isFinite(minute) ||
            !cityName
        ) {
            return NextResponse.json(
                { ok: false, error: 'Недостаточно данных: year/month/day/hour/minute/city_name обязательны.' },
                { status: 400 }
            );
        }

        const params = new URLSearchParams({
            year: String(year),
            month: String(month),
            day: String(day),
            hour: String(hour),
            minute: String(minute),
            city_name: cityName,
        });

        const resp = await fetch(
            `${ASTRO_BACKEND_URL}/uranus_gemini_7y?${params.toString()}`,
            {
                method: 'GET',
                cache: 'no-store',
            }
        );

        const contentType = resp.headers.get('content-type') || '';
        const rawText = await resp.text();
        let data: unknown = rawText;

        if (contentType.includes('application/json')) {
            try {
                data = rawText ? JSON.parse(rawText) : null;
            } catch {
                data = rawText;
            }
        }

        if (!resp.ok) {
            const errorFromJson =
                typeof data === 'object' && data
                    ? (data as { detail?: string; error?: string }).detail ||
                      (data as { detail?: string; error?: string }).error
                    : null;
            return NextResponse.json(
                {
                    ok: false,
                    error:
                        errorFromJson ||
                        (typeof data === 'string' && data.trim()
                            ? data
                            : `Ошибка расчёта Урана в Близнецах (HTTP ${resp.status})`),
                    upstream_status: resp.status,
                    upstream_url: `${ASTRO_BACKEND_URL}/uranus_gemini_7y`,
                },
                { status: resp.status }
            );
        }

        return NextResponse.json({
            ok: true,
            kind: 'uranus_gemini',
            data,
        });
    } catch (error) {
        console.error('POST /api/astro/uranus-gemini failed', error);
        return NextResponse.json(
            { ok: false, error: 'Внутренняя ошибка прокси-роута' },
            { status: 500 }
        );
    }
}
