import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

function getGuidePdfConfig() {
  const externalUrl = (process.env.URANUS_GUIDE_PDF_URL || process.env.NEXT_PUBLIC_URANUS_GUIDE_PDF_URL || "").trim();
  const localPath = (process.env.URANUS_GUIDE_PDF_PATH || "/guides/uran-v-bliznetsah.pdf").trim();
  return { externalUrl, localPath };
}

function buildAbsoluteUrl(req: NextRequest, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, req.nextUrl.origin).toString();
}

function resolveGuidePdfUrl(req: NextRequest) {
  const { externalUrl, localPath } = getGuidePdfConfig();
  if (externalUrl) return externalUrl;
  return buildAbsoluteUrl(req, localPath || "/guides/uran-v-bliznetsah.pdf");
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const email = normalizeEmail(body?.email);
    const fullName = String(body?.full_name || "").trim();
    const acceptedPersonalData = body?.accepted_personal_data === true;
    const acceptedAds = body?.accepted_ads === true;

    if (!fullName) {
      return NextResponse.json({ ok: false, error: "Укажите имя." }, { status: 400 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "Укажите корректный email." }, { status: 400 });
    }

    if (!acceptedPersonalData) {
      return NextResponse.json(
        { ok: false, error: "Нужно согласие на обработку персональных данных." },
        { status: 400 }
      );
    }

    if (!acceptedAds) {
      return NextResponse.json(
        { ok: false, error: "Нужно согласие на получение рекламной информации." },
        { status: 400 }
      );
    }

    const guidePdfUrl = resolveGuidePdfUrl(req);

    const admin = getAdminClient();
    const nowIso = new Date().toISOString();

    const { error: upsertError } = await admin
      .from("marketing_contacts")
      .upsert(
        {
          email,
          full_name: fullName,
          source: "uranus_guide_pdf",
          marketing_email_opt_in: true,
          updated_at: nowIso,
        },
        { onConflict: "email" }
      );

    if (upsertError) {
      console.error("[guide-request] marketing_contacts upsert failed", upsertError);
      return NextResponse.json({ ok: false, error: "Не удалось сохранить заявку." }, { status: 500 });
    }

    const smtpHost = process.env.SMTP_HOST || "";
    const smtpPort = Number(process.env.SMTP_PORT || "0");
    const smtpSecure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
    const smtpUser = process.env.SMTP_USER || "";
    const smtpPass = process.env.SMTP_PASS || "";
    const smtpFrom = process.env.SMTP_FROM || "";

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
      return NextResponse.json(
        {
          ok: false,
          error: "SMTP не настроен: письмо с путеводителем отправить нельзя.",
        },
        { status: 500 }
      );
    }

    const subject = "Ваш путеводитель «Уран в Близнецах»";
    const text = [
      `${fullName}, добрый день!`,
      "",
      "Спасибо за интерес к путеводителю «Уран в Близнецах».",
      `Открыть путеводитель: ${guidePdfUrl}`,
      "",
      "Если ссылка не открывается, просто ответьте на это письмо.",
    ].join("\n");

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
        <p>${fullName}, добрый день!</p>
        <p>Спасибо за интерес к путеводителю «Уран в Близнецах».</p>
        <p>
          <a href="${guidePdfUrl}" target="_blank" rel="noopener noreferrer">Открыть путеводитель</a>
        </p>
        <p>Если ссылка не открывается, просто ответьте на это письмо.</p>
      </div>
    `;

    await sendSmtpMail({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      username: smtpUser,
      password: smtpPass,
      from: smtpFrom,
      to: email,
      subject,
      text,
      html,
    });

    return NextResponse.json({ ok: true, pdf_url: guidePdfUrl });
  } catch (error) {
    console.error("[guide-request][POST] failed", error);
    return NextResponse.json({ ok: false, error: "Внутренняя ошибка сервера." }, { status: 500 });
  }
}
