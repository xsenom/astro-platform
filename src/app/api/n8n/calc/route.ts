import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_WEBHOOK_URL =
  "https://renudrafin.beget.app/webhook/c81b2f83-92ea-4aa8-95e0-d4b8237ad2e5";

function getWebhookUrl(): string {
  return (process.env.N8N_CALC_WEBHOOK_URL || DEFAULT_WEBHOOK_URL).trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { ok: false, error: "question is required" },
        { status: 400 }
      );
    }

    const webhookRes = await fetch(getWebhookUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        ...body,
      }),
      cache: "no-store",
    });

    const contentType = webhookRes.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await webhookRes.json().catch(() => null);
      if (!webhookRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `n8n webhook returned HTTP ${webhookRes.status}`,
            data,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, data });
    }

    const text = await webhookRes.text();

    if (!webhookRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `n8n webhook returned HTTP ${webhookRes.status}`,
          data: text,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data: text });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "failed to call n8n webhook",
      },
      { status: 500 }
    );
  }
}
