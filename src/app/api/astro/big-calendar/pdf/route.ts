import { NextRequest, NextResponse } from "next/server";

type PdfRequestBody = {
    content?: string;
    general_p2?: string;
    name?: string;
    birth_date?: string;
    birth_time?: string;
};

const PDF_RENDER_URL =
    process.env.BIG_CALENDAR_PDF_RENDER_URL?.trim() ||
    "http://45.90.35.133:1800/pdf/render";

function formatBirthDate(value: string | undefined) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as PdfRequestBody;
        const content = body.content?.trim();
        const summary = body.general_p2?.trim();
        const name = body.name?.trim() || "Клиент";
        const birthDate = body.birth_date?.trim();
        const birthTime = body.birth_time?.trim();

        if (!content || !summary || !birthDate || !birthTime) {
            return NextResponse.json(
                { ok: false, error: "Недостаточно данных для сборки PDF." },
                { status: 400 }
            );
        }

        const form = new URLSearchParams({
            content,
            general_p2: summary,
            name,
            birth_date: formatBirthDate(birthDate),
            birth_time: birthTime,
        });

        const response = await fetch(PDF_RENDER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: form.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(errorText || `HTTP ${response.status}`);
        }

        const bytes = await response.arrayBuffer();
        const fileName = `БЖК_${name}_${formatBirthDate(birthDate)}.pdf`;

        return new NextResponse(bytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}
