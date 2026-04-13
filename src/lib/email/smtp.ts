import net from "node:net";
import tls from "node:tls";

type SmtpAttachment = {
    filename: string;
    content: Buffer | string;
    contentType?: string;
};

function onceLine(socket: net.Socket | tls.TLSSocket): Promise<string> {
    return new Promise((resolve, reject) => {
        let buffer = "";

        const cleanup = () => {
            socket.off("data", onData);
            socket.off("error", onError);
            socket.off("close", onClose);
        };

        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        const onClose = () => {
            cleanup();
            reject(new Error("SMTP connection closed"));
        };

        const onData = (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            const lines = buffer.split(/\r?\n/).filter(Boolean);
            const last = lines[lines.length - 1];

            if (last && /^\d{3} /.test(last)) {
                cleanup();
                resolve(buffer);
            }
        };

        socket.on("data", onData);
        socket.on("error", onError);
        socket.on("close", onClose);
    });
}

async function writeAndRead(
    socket: net.Socket | tls.TLSSocket,
    command: string,
    expectedCodes: number[]
) {
    socket.write(`${command}\r\n`);
    const response = await onceLine(socket);
    const code = Number(response.slice(0, 3));

    if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP ${command} failed: ${response.trim()}`);
    }

    return response;
}

function toBase64(value: Buffer | string) {
    const base64 = Buffer.isBuffer(value)
        ? value.toString("base64")
        : Buffer.from(value, "utf8").toString("base64");

    return base64.replace(/.{1,76}/g, "$&\r\n");
}

function encodeMimeHeader(value: string) {
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMailboxHeader(email: string, name?: string) {
    const trimmedEmail = String(email || "").trim();
    const trimmedName = String(name || "").trim();

    if (!trimmedName) {
        return trimmedEmail;
    }

    return `${encodeMimeHeader(trimmedName)} <${trimmedEmail}>`;
}

function buildMessage(params: {
    fromEmail: string;
    fromName?: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SmtpAttachment[];
}) {
    const altBoundary = `astro_alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const mixedBoundary = `astro_mix_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const hasAttachments = Array.isArray(params.attachments) && params.attachments.length > 0;

    const fromHeader = buildMailboxHeader(params.fromEmail, params.fromName);

    const headers = [
        `From: ${fromHeader}`,
        `Sender: ${fromHeader}`,
        `To: ${params.to}`,
        `Subject: ${encodeMimeHeader(params.subject)}`,
        ...(params.replyTo ? [`Reply-To: ${params.replyTo}`] : []),
        "MIME-Version: 1.0",
        hasAttachments
            ? `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`
            : `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
    ];

    const altParts: string[] = [];

    if (params.text) {
        altParts.push(
            `--${altBoundary}`,
            "Content-Type: text/plain; charset=utf-8",
            "Content-Transfer-Encoding: 8bit",
            "",
            params.text,
            ""
        );
    }

    if (params.html) {
        altParts.push(
            `--${altBoundary}`,
            "Content-Type: text/html; charset=utf-8",
            "Content-Transfer-Encoding: 8bit",
            "",
            params.html,
            ""
        );
    }

    altParts.push(`--${altBoundary}--`, "");

    if (!hasAttachments) {
        return [...headers, ...altParts].join("\r\n");
    }

    const mixedParts: string[] = [
        `--${mixedBoundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
        ...altParts,
    ];

    for (const attachment of params.attachments || []) {
        mixedParts.push(
            `--${mixedBoundary}`,
            `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${attachment.filename}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${attachment.filename}"`,
            "",
            toBase64(attachment.content),
            ""
        );
    }

    mixedParts.push(`--${mixedBoundary}--`, "");

    return [...headers, ...mixedParts].join("\r\n");
}

export async function sendSmtpMail(params: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName?: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    attachments?: SmtpAttachment[];
}) {
    const socket = params.secure
        ? tls.connect({
              host: params.host,
              port: params.port,
              servername: params.host,
          })
        : net.connect({
              host: params.host,
              port: params.port,
          });

    await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("error", reject);
    });

    try {
        const greeting = await onceLine(socket);
        if (!greeting.startsWith("220")) {
            throw new Error(`SMTP greeting failed: ${greeting.trim()}`);
        }

        await writeAndRead(socket, "EHLO astro-platform", [250]);
        await writeAndRead(socket, "AUTH LOGIN", [334]);
        await writeAndRead(
            socket,
            Buffer.from(params.username, "utf8").toString("base64"),
            [334]
        );
        await writeAndRead(
            socket,
            Buffer.from(params.password, "utf8").toString("base64"),
            [235]
        );

        await writeAndRead(socket, `MAIL FROM:<${params.fromEmail}>`, [250]);
        await writeAndRead(socket, `RCPT TO:<${params.to}>`, [250, 251]);
        await writeAndRead(socket, "DATA", [354]);

        socket.write(`${buildMessage(params)}\r\n.\r\n`);

        const dataResponse = await onceLine(socket);
        if (!dataResponse.startsWith("250")) {
            throw new Error(`SMTP DATA failed: ${dataResponse.trim()}`);
        }

        await writeAndRead(socket, "QUIT", [221]);
    } finally {
        socket.end();
    }
}