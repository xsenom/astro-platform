import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

type MonthTransitItem = {
    date?: string;
    transit?: string;
    natal?: string;
    theme?: string;
    description?: string;
};

const FAVORABLE_DAYS_OPENAI_MODEL =
    process.env.FAVORABLE_DAYS_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini";

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function getEnv(name: string) {
    return String(process.env[name] || "").trim();
}

function isMissingTableError(message: string) {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("could not find the table") ||
        (normalized.includes("relation") && normalized.includes("does not exist"))
    );
}

function isValidBirthDate(value: string) {
    if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/.test(value)) {
        return false;
    }

    const [dayRaw, monthRaw, yearRaw] = value.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function isValidBirthTime(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidBirthCity(value: string) {
    return /^[\p{L}\s.,()-]{2,}$/u.test(value.trim());
}

function toIsoBirthDate(value: string) {
    const [day, month, year] = value.split(".");
    return `${year}-${month}-${day}`;
}

function getAstroApiBase() {
    return (
        getEnv("ASTRO_API_BASE") ||
        getEnv("NEXT_PUBLIC_ASTRO_API_BASE") ||
        "http://127.0.0.1:8011"
    ).replace(/\/$/, "");
}

function readOpenAIText(json: OpenAIResponse | null) {
    return (
        json?.output_text ||
        json?.output
            ?.flatMap((item) => item?.content ?? [])
            ?.map((item) => item?.text ?? "")
            ?.join("\n")
            ?.trim() ||
        null
    );
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function nl2br(value: string) {
    return escapeHtml(value).replace(/\n/g, "<br />");
}

async function readFavorableDaysPrompt() {
    const promptPath = path.join(
        process.cwd(),
        "backend",
        "app",
        "prompt",
        "favorable-days-request.txt"
    );

    try {
        const value = await fs.readFile(promptPath, "utf8");
        if (value.trim()) return value;
    } catch {
        // ignore
    }

    return [
        "Ты астролог-консультант.",
        "На основе month_transits составь понятную и красивую интерпретацию благоприятных дней на ближайший месяц.",
        "Пиши по-русски, структурно, без воды.",
        "Нужны блоки:",
        "1. Краткий итог месяца.",
        "2. Самые сильные благоприятные дни и периоды.",
        "3. Для чего особенно подходят эти дни.",
        "4. Практические рекомендации.",
        "Не придумывай события и аспекты сверх входных данных.",
        "Если есть несколько сильных дней подряд, объединяй их в периоды.",
    ].join("\n");
}

async function createOpenAIInterpretation(prompt: string, input: unknown) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("OPENAI_API_KEY не настроен.");
    }

    let response: Response;

    try {
        response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: FAVORABLE_DAYS_OPENAI_MODEL,
                input: [
                    {
                        role: "system",
                        content: [{ type: "input_text", text: prompt }],
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text:
                                    typeof input === "string"
                                        ? input
                                        : JSON.stringify(input, null, 2),
                            },
                        ],
                    },
                ],
                max_output_tokens: 4500,
            }),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`OpenAI fetch failed: ${message}`);
    }

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;

    if (!response.ok) {
        throw new Error(json?.error?.message || "OpenAI не смог сгенерировать интерпретацию.");
    }

    const text = readOpenAIText(json);
    if (!text) {
        throw new Error("OpenAI вернул пустую интерпретацию.");
    }

    return text;
}

function buildMonthSummary(monthTransits: MonthTransitItem[]) {
    if (!monthTransits.length) {
        return "Персональный астрологический прогноз на месяц.";
    }

    const byDate = new Map<string, number>();
    const themes = new Set<string>();

    for (const item of monthTransits) {
        const date = String(item.date || "").trim();
        const theme = String(item.theme || "").trim();

        if (date) {
            byDate.set(date, (byDate.get(date) || 0) + 1);
        }
        if (theme) {
            themes.add(theme);
        }
    }

    const topDates = [...byDate.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([date]) => date);

    const themeList = [...themes].slice(0, 5);

    return [
        `Найдено благоприятных аспектов: ${monthTransits.length}.`,
        topDates.length ? `Наиболее активные даты: ${topDates.join(", ")}.` : "",
        themeList.length ? `Основные темы: ${themeList.join(", ")}.` : "",
    ]
        .filter(Boolean)
        .join(" ");
}

async function readBannerAsDataUri() {
    const bannerCandidates = [
        path.join(process.cwd(), "public", "banners", "favorable-days-request.jpg"),
        path.join(process.cwd(), "public", "banners", "favorable-days-request.jpeg"),
        path.join(process.cwd(), "public", "banners", "favorable-days-request.png"),
    ];

    for (const filePath of bannerCandidates) {
        try {
            const file = await fs.readFile(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mime =
                ext === ".png"
                    ? "image/png"
                    : ext === ".jpg" || ext === ".jpeg"
                      ? "image/jpeg"
                      : "application/octet-stream";

            return `data:${mime};base64,${file.toString("base64")}`;
        } catch {
            // try next
        }
    }

    return null;
}

function buildPdfHtml(payload: {
    fullName: string;
    email: string;
    birthDate: string;
    birthTime: string;
    birthCity: string;
    interpretation: string;
    summary: string;
    bannerDataUri: string | null;
}) {
    const {
        fullName,
        email,
        birthDate,
        birthTime,
        birthCity,
        interpretation,
        summary,
        bannerDataUri,
    } = payload;

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Благоприятные дни на месяц</title>
<style>
  @page {
    size: A4;
    margin: 0;
  }

  * {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #0f172a;
    font-family: Arial, Helvetica, sans-serif;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    background: #ffffff;
  }
  
  .banner {
      width: 120mm;
      height: 52mm;
      overflow: hidden
      background: #f3f4f6;
      border-radius: 14px;
    }

  .bannerWrap {
      display: flex;
      justify-content: center;
      margin-top: 40px;
      margin-bottom: 10mm;
    }

  .banner img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  .content {
    padding: calc(16mm + 40px) 16mm 18mm;
  }

  .title {
    margin: 0 0 10mm;
    font-size: 24pt;
    line-height: 1.15;
    font-weight: 700;
    color: #111827;
  }

  .meta {
    margin: 0 0 10mm;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fafafa;
  }

  .metaRow {
    margin: 0 0 6px;
    font-size: 11.5pt;
    line-height: 1.45;
    color: #111827;
  }

  .metaRow:last-child {
    margin-bottom: 0;
  }

  .label {
    font-weight: 700;
  }

  .summary {
    margin: 0 0 10mm;
    padding: 12px 14px;
    border-radius: 12px;
    background: #f8fafc;
    border-left: 4px solid #caa96b;
    font-size: 11.5pt;
    line-height: 1.6;
    color: #1f2937;
  }

  .sectionTitle {
    margin: 0 0 5mm;
    font-size: 16pt;
    line-height: 1.2;
    font-weight: 700;
    color: #111827;
  }

  .text {
    font-size: 11.5pt;
    line-height: 1.72;
    color: #111827;
    white-space: normal;
    word-break: break-word;
  }

  .footerNote {
    margin-top: 12mm;
    font-size: 9.5pt;
    line-height: 1.5;
    color: #6b7280;
  }
</style>
</head>
<body>
  <div class="page">
    ${
        bannerDataUri
            ? `<div class="bannerWrap"><div class="banner"><img src="${bannerDataUri}" alt="Баннер" /></div></div>`
            : ""
    }

    <div class="content">
      <h1 class="title">Расчет благоприятных дней на месяц</h1>

      <div class="meta">
        <p class="metaRow"><span class="label">Имя:</span> ${escapeHtml(fullName)}</p>
        <p class="metaRow"><span class="label">Email:</span> ${escapeHtml(email)}</p>
                <p class="metaRow"><span class="label">Дата рождения:</span> ${escapeHtml(birthDate)}</p>
      </div>

      

      <h2 class="sectionTitle">Интерпретация</h2>
      <div class="text">${nl2br(interpretation)}</div>

      
    </div>
  </div>
</body>
</html>`;
}

async function renderPdfFromHtml(html: string) {
    let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null =
        null;

    try {
        const { chromium } = await import("playwright");

        const executablePath =
            getEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH") || undefined;

        browser = await chromium.launch({
            headless: true,
            executablePath,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle" });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "0mm",
                right: "0mm",
                bottom: "0mm",
                left: "0mm",
            },
        });

        return Buffer.from(pdf);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Не удалось собрать PDF: ${message}`);
    } finally {
        if (browser) {
            await browser.close().catch(() => undefined);
        }
    }
}

async function buildFavorableDaysPdf(payload: {
    fullName: string;
    email: string;
    birthDate: string;
    birthTime: string;
    birthCity: string;
    interpretation: string;
    summary: string;
}) {
    const bannerDataUri = await readBannerAsDataUri();

    const html = buildPdfHtml({
        ...payload,
        bannerDataUri,
    });

    const content = await renderPdfFromHtml(html);

    return {
        fileName: "blagopriyatnye-dni-na-mesyac.pdf",
        content,
    };
}



export async function POST(req: NextRequest) {
    const admin = getAdminClient();
    let requestId: string | null = null;

    try {
        const body = await req.json();

        const fullName = String(body?.full_name || "").trim();
        const email = normalizeEmail(body?.email);
        const birthDate = String(body?.birth_date || "").trim();
        const birthTimeRaw = String(body?.birth_time || "").trim();
        const birthTimeUnknown = Boolean(body?.birth_time_unknown);
        const birthTime = birthTimeUnknown ? "12:00" : birthTimeRaw;
        const birthCity = String(body?.birth_city || "").trim();
        const months = Number(body?.months || 1);
        const consentPersonalData = body?.consent_personal_data === true;
        const consentAds = body?.consent_ads === true;
        const safeMonths =
            Number.isFinite(months) && months > 0 ? Math.min(Math.floor(months), 3) : 1;

        if (!fullName || !email || !birthDate || !birthCity || (!birthTime && !birthTimeUnknown)) {
            return NextResponse.json(
                { ok: false, error: "Заполните имя, email, дату, город рождения и укажите время либо нажмите «Не знаю»." },
                { status: 400 }
            );
        }
        if (!consentPersonalData) {
            return NextResponse.json(
                { ok: false, error: "Нужно согласие на обработку персональных данных." },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { ok: false, error: "Некорректный email." },
                { status: 400 }
            );
        }

        if (!isValidBirthDate(birthDate)) {
            return NextResponse.json(
                { ok: false, error: "Дата рождения должна быть в формате ДД.ММ.ГГГГ." },
                { status: 400 }
            );
        }

        if (!isValidBirthTime(birthTime)) {
            return NextResponse.json(
                { ok: false, error: "Время рождения должно быть в формате HH:MM." },
                { status: 400 }
            );
        }

        if (!isValidBirthCity(birthCity)) {
            return NextResponse.json(
                { ok: false, error: "Укажите корректный город рождения." },
                { status: 400 }
            );
        }

        const normalizedBirthDate = toIsoBirthDate(birthDate);
        const [birthYear, birthMonth, birthDay] = normalizedBirthDate.split("-").map(Number);
        const [birthHour, birthMinute] = birthTime.split(":").map(Number);
        
        const nowIso = new Date().toISOString();
        const { data: inserted, error: insertError } = await admin
            .from("favorable_days_requests")
            .insert({
                full_name: fullName,
                email,
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_city: birthCity,
                months: safeMonths,
                status: "requested",
                email_sent: false,
        
                consent_personal_data: consentPersonalData,
                consent_ads: consentAds,
                consent_personal_data_at: consentPersonalData ? nowIso : null,
                consent_ads_at: consentAds ? nowIso : null,
            })
            .select("id")
            .single();

        if (insertError && !isMissingTableError(insertError.message)) {
            return NextResponse.json(
                { ok: false, error: insertError.message },
                { status: 500 }
            );
        }

        requestId = inserted?.id ? String(inserted.id) : null;

        const astroApiBase = getAstroApiBase();
        const transitsMonthUrl = new URL("/transits_month", astroApiBase);

        transitsMonthUrl.searchParams.set("year", String(birthYear));
        transitsMonthUrl.searchParams.set("month", String(birthMonth));
        transitsMonthUrl.searchParams.set("day", String(birthDay));
        transitsMonthUrl.searchParams.set("hour", String(birthHour));
        transitsMonthUrl.searchParams.set("minute", String(birthMinute));
        transitsMonthUrl.searchParams.set("city_name", birthCity);

        let monthRes: Response;

        try {
            monthRes = await fetch(transitsMonthUrl.toString(), {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`transits_month fetch failed: ${message}`);
        }

        const monthJson = (await monthRes.json().catch(() => null)) as
            | { month_transits?: MonthTransitItem[]; detail?: string; error?: string }
            | null;

        if (!monthRes.ok) {
            const message =
                monthJson?.detail ||
                monthJson?.error ||
                "Не удалось получить аспекты месяца.";

            if (requestId) {
                await admin
                    .from("favorable_days_requests")
                    .update({
                        status: "failed",
                        email_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const monthTransits = Array.isArray(monthJson?.month_transits)
            ? monthJson.month_transits
            : [];

        if (!monthTransits.length) {
            const message = "Бекенд не вернул аспекты месяца.";

            if (requestId) {
                await admin
                    .from("favorable_days_requests")
                    .update({
                        status: "failed",
                        email_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const favorablePrompt = await readFavorableDaysPrompt();

        const aiInterpretation = await createOpenAIInterpretation(favorablePrompt, {
            name: fullName,
            birth_date: normalizedBirthDate,
            birth_time: birthTime,
            birth_city: birthCity,
            months: safeMonths,
            month_transits: monthTransits,
        });

        const summaryText = buildMonthSummary(monthTransits);
        const siteUrl =
            getEnv("NEXT_PUBLIC_SITE_URL") ||
            getEnv("SITE_URL") ||
            "https://starstalking.ru";
        
        const favorableDaysPageUrl = `${siteUrl.replace(/\/$/, "")}/blagopriyatnye-dni-na-mesyac`;

        const pdf = await buildFavorableDaysPdf({
            fullName,
            email,
            birthDate,
            birthTime,
            birthCity,
            interpretation: aiInterpretation,
            summary: summaryText,
        });
        const storageBucket = "marketing-pdfs";
        const safeEmail = email.replace(/[^a-z0-9@._-]/gi, "_");
        const pdfPath = `favorable-days/${new Date().toISOString().slice(0, 10)}/${safeEmail}/${Date.now()}_${pdf.fileName}`;
        
        const { error: uploadError } = await admin.storage
            .from(storageBucket)
            .upload(pdfPath, pdf.content, {
                contentType: "application/pdf",
                upsert: false,
            });
        
        if (uploadError) {
            throw new Error(`Не удалось сохранить PDF в Supabase Storage: ${uploadError.message}`);
        }
        
        const { data: publicPdf } = admin.storage
            .from(storageBucket)
            .getPublicUrl(pdfPath);
        
        const pdfUrl = publicPdf?.publicUrl || null;
        
        if (requestId) {
            await admin
                .from("favorable_days_requests")
                .update({
                    result_text: aiInterpretation,
                    pdf_url: pdfUrl,
                    pdf_path: pdfPath,
                    pdf_file_name: pdf.fileName,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId);
        }
        
        if (!pdfUrl) {
            throw new Error("Не удалось получить публичную ссылку на PDF.");
        }
        const ATTACHMENT_LIMIT_BYTES = 1024 * 1024 * 1.5;

        
        const shouldAttachPdf = pdf.content.length <= ATTACHMENT_LIMIT_BYTES;
        const smtpHost = getEnv("SMTP_HOST");
        const smtpPort = Number(getEnv("SMTP_PORT") || "0");
        const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
        const smtpUser = getEnv("SMTP_USER");
        const smtpPass = getEnv("SMTP_PASS");
        const smtpFrom = getEnv("SMTP_FROM");
        
        const mailText =
            `Здравствуйте, ${fullName}!\n\n` +
            `Ваш расчёт «Благоприятные дни на месяц» готов.\n\n` +
            (pdfUrl ? `Открыть PDF:\n${pdfUrl}\n\n` : "") +
            `Хорошего дня!`;
        
        const mailHtml =
            `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1f2937">` +
            `<p>Здравствуйте, ${escapeHtml(fullName)}!</p>` +
            `<p>Ваш расчёт <strong>«Благоприятные дни на месяц»</strong> готов.</p>` +
            (pdfUrl
                ? `<p><a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">Открыть PDF</a></p>`
                : "") +
            `<p>Хорошего дня!</p>` +
            `</div>`;
        
        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            if (requestId) {
                await admin
                    .from("favorable_days_requests")
                    .update({
                        status: "failed",
                        email_error: "SMTP не настроен",
                        result_text: aiInterpretation,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", requestId);
            }

            return NextResponse.json(
                { ok: false, error: "SMTP не настроен." },
                { status: 500 }
            );
        }


        
        let emailSent = false;
        let emailError: string | null = null;

        try {
            await sendSmtpMail({
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                username: smtpUser,
                password: smtpPass,
                from: smtpFrom,
                to: email,
                subject: "Ваши благоприятные дни на месяц",
                text:
                    `Здравствуйте, ${fullName}!\n\n` +
                    `Ваш расчёт «Благоприятные дни на месяц» готов.\n\n` +
                    `Открыть PDF:\n${pdfUrl}\n\n` +
                    `Хорошего дня!`,
                html:
                    `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#1f2937">` +
                    `<p>Здравствуйте, ${escapeHtml(fullName)}!</p>` +
                    `<p>Ваш расчёт <strong>«Благоприятные дни на месяц»</strong> готов.</p>` +
                    `<p>Открыть PDF: <a href="${escapeHtml(pdfUrl)}" target="_blank" rel="noopener noreferrer">открыть PDF</a></p>` +
                    `<p>Хорошего дня!</p>` +
                    `</div>`,
                attachments: shouldAttachPdf
                    ? [
                          {
                              filename: pdf.fileName,
                              content: pdf.content,
                              contentType: "application/pdf",
                          },
                      ]
                    : [],
            });
        
            emailSent = true;
        } catch (error) {
            emailError = error instanceof Error ? error.message : String(error);
            console.error("[favorable-days] SMTP send failed:", emailError);
        }
        
        if (requestId) {
            await admin
                .from("favorable_days_requests")
                .update({
                    status: emailSent ? "sent" : "email_failed",
                    email_sent: emailSent,
                    email_error: emailError,
                    result_text: aiInterpretation,
                    sent_at: emailSent ? new Date().toISOString() : null,
                    updated_at: new Date().toISOString(),
                    pdf_url: pdfUrl,
                    pdf_path: pdfPath,
                    pdf_file_name: pdf.fileName,
                })
                .eq("id", requestId);
        }
        
        return NextResponse.json({
            ok: true,
            email_sent: emailSent,
            email_error: emailError,
            interpretation: aiInterpretation,
            pdf_base64: pdf.content.toString("base64"),
            pdf_file_name: pdf.fileName,
            pdf_url: pdfUrl,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (requestId) {
            await admin
                .from("favorable_days_requests")
                .update({
                    status: "failed",
                    email_error: message,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId);
        }

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  
}