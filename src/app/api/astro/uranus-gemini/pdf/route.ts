import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";

type UranAspect = {
    periods?: string;
    title?: string;
    text?: string;
};

type UranPdfBody = {
    title?: string;
    banner_url?: string;
    name?: string;
    birth_date?: string;
    birth_time?: string;
    block1?: string;
    reforms?: string[];
    aspects?: UranAspect[];
    file_name?: string;
};

class RouteError extends Error {
    status: number;

    constructor(message: string, status = 500) {
        super(message);
        this.status = status;
    }
}

function esc(value: string) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function nl2br(value: string) {
    return esc(value).replace(/\n/g, "<br>");
}

function formatBirthDate(value?: string) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function buildHtml(body: UranPdfBody) {
    const title = body.title?.trim() || "Уран в Близнецах";
    const name = body.name?.trim() || "Клиент";
    const birthDate = formatBirthDate(body.birth_date);
    const birthTime = body.birth_time?.trim() || "";
    const banner = body.banner_url?.trim() || "";
    const block1 = body.block1?.trim() || "";
    const reforms = Array.isArray(body.reforms) ? body.reforms : [];
    const aspects = Array.isArray(body.aspects) ? body.aspects : [];

    return `
  <!doctype html>
  <html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <style>
      @page { size: A4; margin: 18mm 14mm 18mm 14mm; }
      * { box-sizing: border-box; }
      body {
        font-family: Arial, sans-serif;
        color: #1c1c1c;
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
      }
      .banner {
        width: 100%;
        border-radius: 14px;
        margin-bottom: 16px;
        display: block;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .meta {
        font-size: 13px;
        color: #555;
        margin-bottom: 18px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 700;
        margin: 18px 0 10px;
        text-transform: uppercase;
      }
      .block {
        white-space: normal;
      }
      .reforms {
        margin: 10px 0 0;
        padding-left: 20px;
      }
      .reforms li {
        margin-bottom: 6px;
      }
      .aspect {
        margin-top: 14px;
        padding-top: 10px;
        border-top: 1px solid #ddd;
        break-inside: avoid;
      }
      .aspect-periods {
        font-weight: 700;
        margin-bottom: 4px;
      }
      .aspect-title {
        font-size: 14px;
        font-weight: 700;
        margin-bottom: 6px;
      }
    </style>
  </head>
  <body>
    ${banner ? `<img class="banner" src="${esc(banner)}" alt="">` : ""}

    <div class="title">${esc(title)}</div>
    <div class="meta">
      ${esc(name)}<br>
      ${esc(birthDate)}${birthTime ? ` ${esc(birthTime)}` : ""}
    </div>

    <div class="section-title">Общая характеристика периода для вас</div>
    <div class="block">${nl2br(block1)}</div>

    ${
        reforms.length
            ? `
      <div class="section-title">Какие реформы будут в жизни</div>
      <ul class="reforms">
        ${reforms.map((item) => `<li>${esc(item)}</li>`).join("")}
      </ul>
    `
            : ""
    }

    ${
        aspects.length
            ? `
      <div class="section-title">Основные даты периода и описание аспектов</div>
      ${aspects
                .map(
                    (item) => `
            <div class="aspect">
              <div class="aspect-periods">${esc(item.periods ?? "")}</div>
              <div class="aspect-title">${esc(item.title ?? "")}</div>
              <div>${nl2br(item.text ?? "")}</div>
            </div>
          `
                )
                .join("")}
    `
            : ""
    }
  </body>
  </html>
  `;
}

export async function POST(req: NextRequest) {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

    try {
        const body = (await req.json().catch(() => ({}))) as UranPdfBody;

        if (!body.block1?.trim()) {
            throw new RouteError("Нет данных для PDF Урана.", 400);
        }

        const html = buildHtml(body);

        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });

        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "18mm",
                right: "14mm",
                bottom: "18mm",
                left: "14mm",
            },
        });

        const pdfBytes = new Uint8Array(pdfBuffer);

        const fileName =
            body.file_name?.trim() ||
            `Уран_в_Близнецах_${body.birth_date || "report"}.pdf`;

        return new NextResponse(pdfBytes, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = error instanceof RouteError ? error.status : 500;
        return NextResponse.json({ ok: false, error: message }, { status });
    } finally {
        if (browser) await browser.close();
    }
}