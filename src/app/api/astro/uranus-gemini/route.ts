import { NextRequest, NextResponse } from 'next/server';

const ASTRO_BACKEND_URL =
    process.env.ASTRO_BACKEND_URL || 'http://127.0.0.1:8015';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const params = new URLSearchParams({
            year: String(body.year),
            month: String(body.month),
            day: String(body.day),
            hour: String(body.hour),
            minute: String(body.minute),
            city_name: String(body.city_name),
            orb: String(body.orb ?? 1.0),
            step_hours: String(body.step_hours ?? 12),
        });

        const resp = await fetch(
            `${ASTRO_BACKEND_URL}/uranus_gemini_7y?${params.toString()}`,
            {
                method: 'GET',
                cache: 'no-store',
            }
        );

        const data = await resp.json();

        if (!resp.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: data?.detail || 'Ошибка расчёта Урана в Близнецах',
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