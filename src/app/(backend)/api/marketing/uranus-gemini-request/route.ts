import { NextRequest, NextResponse } from "next/server";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function getEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isValidBirthDate(value: string) {
  if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/.test(value)) return false;
  const [dayRaw, monthRaw, yearRaw] = value.split(".");
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidBirthTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toIsoBirthDate(value: string) {
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractUranusText(payloadData: unknown): string {
  if (typeof payloadData === "string") return payloadData.trim();
  if (!payloadData || typeof payloadData !== "object") return String(payloadData ?? "").trim();

  const candidate = payloadData as Record<string, unknown>;
  const directText = [candidate.text, candidate.result_text, candidate.interpretation_text, candidate.content, candidate.markdown].find(
    (value) => typeof value === "string" && value.trim()
  );

  if (typeof directText === "string") return directText.trim();
  return JSON.stringify(payloadData, null, 2);
}

async function renderPdfFromHtml(html: string) {
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

function buildHtml(fullName: string, birthDate: string, birthCity: string, reportText: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>Уран в Близнецах</title></head><body style="font-family:Arial;padding:24px;line-height:1.6"><h1>Уран в Близнецах — индивидуальный цикл реформ</h1><p><strong>Имя:</strong> ${escapeHtml(fullName)}</p><p><strong>Дата рождения:</strong> ${escapeHtml(birthDate)}</p><p><strong>Город:</strong> ${escapeHtml(birthCity)}</p><pre style="white-space:pre-wrap">${escapeHtml(reportText)}</pre></body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fullName = String(body?.full_name || "").trim();
    const email = normalizeEmail(body?.email);
    const birthDate = String(body?.birth_date || "").trim();
    const birthTimeRaw = String(body?.birth_time || "").trim();
    const birthTimeUnknown = Boolean(body?.birth_time_unknown);
    const birthTime = birthTimeUnknown ? "12:00" : birthTimeRaw;
    const birthCity = String(body?.birth_city || "").trim();

    if (!fullName || !email || !birthDate || !birthCity || !isValidBirthDate(birthDate) || !isValidBirthTime(birthTime)) {
      return NextResponse.json({ ok: false, error: "Проверьте корректность полей формы." }, { status: 400 });
    }

    const [year, month, day] = toIsoBirthDate(birthDate).split("-").map(Number);
    const [hour, minute] = birthTime.split(":").map(Number);

    const calcRes = await fetch(`${new URL(req.url).origin}/api/astro/uranus-gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, day, hour, minute, city_name: birthCity }),
      cache: "no-store",
    });

    const calcJson = (await calcRes.json().catch(() => null)) as { ok?: boolean; error?: string; data?: unknown } | null;

    if (!calcRes.ok || !calcJson?.ok) {
      return NextResponse.json({ ok: false, error: calcJson?.error || "Не удалось получить расчет Урана в Близнецах." }, { status: 500 });
    }

    const reportText = extractUranusText(calcJson.data);
    const pdfBuffer = await renderPdfFromHtml(buildHtml(fullName, birthDate, birthCity, reportText));
    const pdfFileName = "uran-v-bliznetsah.pdf";

    const smtpHost = getEnv("SMTP_HOST");
    const smtpPort = Number(getEnv("SMTP_PORT") || "0");
    const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
    const smtpUser = getEnv("SMTP_USER");
    const smtpPass = getEnv("SMTP_PASS");
    const smtpFrom = getEnv("SMTP_FROM");

    let emailSent = false;
    let emailError: string | null = null;

    if (smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom) {
      try {
        await sendSmtpMail({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          username: smtpUser,
          password: smtpPass,
          from: smtpFrom,
          to: email,
          subject: "Ваш расчет: Уран в Близнецах",
          text: `Здравствуйте, ${fullName}! Ваш расчет готов.`,
          html: `<p>Здравствуйте, ${escapeHtml(fullName)}!</p><p>Ваш расчет <b>«Уран в Близнецах»</b> готов.</p>`,
          attachments: [{ filename: pdfFileName, content: pdfBuffer, contentType: "application/pdf" }],
        });
        emailSent = true;
      } catch (error) {
        emailError = error instanceof Error ? error.message : String(error);
      }
    } else {
      emailError = "SMTP не настроен";
    }

    return NextResponse.json({
      ok: true,
      email_sent: emailSent,
      email_error: emailError,
      pdf_base64: pdfBuffer.toString("base64"),
      pdf_file_name: pdfFileName,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
