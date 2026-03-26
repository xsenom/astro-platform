import { NextRequest, NextResponse } from "next/server";

type PdfRequestBody = {
    content?: string;
    general_p2?: string;
    name?: string;
    birth_date?: string;
    birth_time?: string;
    banner_url?: string;
    title?: string;
    template?: string;
    file_name?: string;
};

class RouteError extends Error {
    status: number;

    constructor(message: string, status = 500) {
        super(message);
        this.status = status;
    }
}

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
        const bannerUrl = body.banner_url?.trim();
        const title = body.title?.trim();
        const template = body.template?.trim();
        const customFileName = body.file_name?.trim();

        if (!content || !summary || !birthDate || !birthTime) {
            throw new RouteError("Недостаточно данных для сборки PDF.", 400);
        }

        const payload = {
            content,
            general_p2: summary,
            name,
            birth_date: formatBirthDate(birthDate),
            birth_time: birthTime,
            ...(bannerUrl ? { banner_url: bannerUrl } : {}),
            ...(title ? { title } : {}),
            ...(template ? { template } : {}),
        };

        const requestPdf = async (mode: "json" | "form") =>
            fetch(PDF_RENDER_URL, {
                method: "POST",
                headers:
                    mode === "json"
                        ? { "Content-Type": "application/json" }
                        : { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
                body:
                    mode === "json"
                        ? JSON.stringify(payload)
                        : new URLSearchParams(payload).toString(),
            });

        const primaryResponse = await requestPdf("json");
        const response =
            primaryResponse.status === 415 || primaryResponse.status === 422
                ? await requestPdf("form")
                : primaryResponse;

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            const message =
                response.status === 403
                    ? `Сервис PDF отклонил запрос (403 Forbidden). Проверьте доступ сервера к ${PDF_RENDER_URL}.`
                    : response.status === 422
                        ? "Сервис PDF вернул 422 Unprocessable Entity. Проверьте формат content/general_p2/name/birth_date/birth_time."
                        : errorText || `HTTP ${response.status}`;
            throw new RouteError(
                message,
                response.status >= 400 && response.status < 600 ? response.status : 502
            );
        }

        const bytes = await response.arrayBuffer();
        const fileName =
            customFileName || `БЖК_${name}_${formatBirthDate(birthDate)}.pdf`;

        return new NextResponse(bytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = error instanceof RouteError ? error.status : 500;
        return NextResponse.json({ ok: false, error: message }, { status });
    }
}
