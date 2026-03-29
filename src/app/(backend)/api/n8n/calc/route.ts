import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_WEBHOOK_URL =
    "https://renudrafin.beget.app/webhook-test/c81b2f83-92ea-4aa8-95e0-d4b8237ad2e5";

function getWebhookUrl(): string {
    return DEFAULT_WEBHOOK_URL.trim();
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => null);

        console.log("Incoming body:", body);

        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { ok: false, error: "Invalid JSON body" },
                { status: 400 }
            );
        }

        const webhookUrl = getWebhookUrl();
        console.log("Webhook URL:", webhookUrl);

        const webhookRes = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            cache: "no-store",
        });

        const contentType = webhookRes.headers.get("content-type") || "";
        const rawText = await webhookRes.text();

        console.log("Webhook status:", webhookRes.status);
        console.log("Webhook content-type:", contentType);
        console.log("Webhook raw response:", rawText);

        let parsed: unknown = rawText;
        if (contentType.includes("application/json")) {
            try {
                parsed = JSON.parse(rawText);
            } catch {
                parsed = rawText;
            }
        }

        if (!webhookRes.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: `n8n webhook returned HTTP ${webhookRes.status}`,
                    response: parsed,
                },
                { status: 502 }
            );
        }

        return NextResponse.json({
            ok: true,
            data: parsed,
        });
    } catch (error: unknown) {
        console.error("Route error:", error);

        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "failed to call n8n webhook",
            },
            { status: 500 }
        );
    }
}