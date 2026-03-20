"use client";

import { useEffect, useMemo, useState } from "react";

function collectLines(lines: string[], marker: string) {
    const startIndex = lines.indexOf(marker);
    if (startIndex === -1) return [];

    const items: string[] = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^(👤|🏛|✨)/.test(line)) break;
        if (line.startsWith("•")) items.push(line);
    }
    return items;
}

function renderInlineMarkdown(text: string) {
    const normalized = text.replace(/\*\*\*/g, "**").replace(/###\s*/g, "");
    const parts = normalized.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);

    return parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function parseMarkdownBlocks(text: string) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const blocks: Array<
        | { type: "heading"; text: string }
        | { type: "paragraph"; text: string }
        | { type: "ordered"; items: string[] }
        | { type: "unordered"; items: string[] }
    > = [];

    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (/^#{1,3}\s+/.test(line)) {
            blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s+/, "") });
            index += 1;
            continue;
        }

        if (/^\d+\.\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\d+\.\s+/, ""));
                index += 1;
            }
            blocks.push({ type: "ordered", items });
            continue;
        }

        if (/^[-•]\s+/.test(line)) {
            const items: string[] = [];
            while (index < lines.length && /^[-•]\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^[-•]\s+/, ""));
                index += 1;
            }
            blocks.push({ type: "unordered", items });
            continue;
        }

        const paragraphLines: string[] = [];
        while (
            index < lines.length &&
            !/^#{1,3}\s+/.test(lines[index]) &&
            !/^\d+\.\s+/.test(lines[index]) &&
            !/^[-•]\s+/.test(lines[index])
        ) {
            paragraphLines.push(lines[index]);
            index += 1;
        }

        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    }

    return blocks;
}

function PlanetSection({ title, items }: { title: string; items: string[] }) {
    if (!items.length) return null;

    return (
        <div
            style={{
                padding: 16,
                borderRadius: 18,
                border: "1px solid rgba(224,197,143,.12)",
                background: "rgba(10,18,38,.18)",
                display: "grid",
                gap: 10,
            }}
        >
            <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
            <div
                style={{
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                }}
            >
                {items.map((item) => (
                    <div
                        key={item}
                        style={{
                            padding: 12,
                            borderRadius: 14,
                            border: "1px solid rgba(224,197,143,.10)",
                            background: "rgba(17,34,80,.16)",
                            lineHeight: 1.6,
                        }}
                    >
                        {item.replace(/^•\s*/, "")}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AnimatedDots() {
    const [dots, setDots] = useState(".");

    useEffect(() => {
        const timer = window.setInterval(() => {
            setDots((prev) => {
                if (prev === "...") return ".";
                return prev + ".";
            });
        }, 450);

        return () => window.clearInterval(timer);
    }, []);

    return <span>{dots}</span>;
}

export function AstroLoading() {
    const phrases = useMemo(
        () => [
            "Сопоставляем положения планет и раскрываем главные смыслы…",
            "Считываем взаимосвязи планет и выделяем главное…",
            "Изучаем астрологические акценты и формируем ваш разбор…",
            "Соединяем положения планет в цельную картину…",
            "Выделяем сильные акценты карты и ключевые тенденции…",
            "Анализируем небесные влияния и собираем персональный разбор…",
            "Рассматриваем аспекты планет и ищем важные подсказки…",
            "Выявляем ведущие темы периода и основные энергии…",
            "Собираем ключевые астрологические акценты вашего прогноза…",
            "Определяем, какие влияния сейчас выходят на первый план…",
        ],
        []
    );

    const [phraseIndex, setPhraseIndex] = useState(() =>
        Math.floor(Math.random() * phrases.length)
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            setPhraseIndex((prev) => {
                if (phrases.length <= 1) return prev;

                let next = prev;
                while (next === prev) {
                    next = Math.floor(Math.random() * phrases.length);
                }
                return next;
            });
        }, 3000);

        return () => window.clearInterval(timer);
    }, [phrases]);

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                color: "rgba(245,240,233,.88)",
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: 54,
                    height: 54,
                    flex: "0 0 54px",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "50%",
                        border: "1px solid rgba(224,197,143,.22)",
                        animation: "astroOrbit 5.5s linear infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        inset: 8,
                        borderRadius: "50%",
                        border: "1px solid rgba(110,170,255,.22)",
                        animation: "astroOrbitReverse 4.2s linear infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: 10,
                        height: 10,
                        marginLeft: -5,
                        marginTop: -5,
                        borderRadius: "50%",
                        background: "rgba(224,197,143,.95)",
                        boxShadow: "0 0 16px rgba(224,197,143,.45)",
                        animation: "astroPulse 1.8s ease-in-out infinite",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: 1,
                        width: 6,
                        height: 6,
                        marginLeft: -3,
                        borderRadius: "50%",
                        background: "rgba(214,244,157,.95)",
                        boxShadow: "0 0 10px rgba(214,244,157,.35)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        right: 7,
                        top: "50%",
                        width: 5,
                        height: 5,
                        marginTop: -2.5,
                        borderRadius: "50%",
                        background: "rgba(110,170,255,.95)",
                        boxShadow: "0 0 10px rgba(110,170,255,.35)",
                    }}
                />
            </div>

            <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 900 }}>Анализируем аспекты</div>
                <div
                    key={phraseIndex}
                    style={{
                        color: "rgba(245,240,233,.62)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        animation: "astroFade 0.45s ease",
                    }}
                >
                    {phrases[phraseIndex]}
                </div>
            </div>

            <style jsx>{`
                @keyframes astroOrbit {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                @keyframes astroOrbitReverse {
                    from {
                        transform: rotate(360deg);
                    }
                    to {
                        transform: rotate(0deg);
                    }
                }

                @keyframes astroPulse {
                    0%,
                    100% {
                        transform: scale(0.9);
                        opacity: 0.85;
                    }
                    50% {
                        transform: scale(1.18);
                        opacity: 1;
                    }
                }

                @keyframes astroFade {
                    from {
                        opacity: 0;
                        transform: translateY(4px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}

export function NatalResultView({ text }: { text: string }) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const facts = lines.filter((line) => /^(🌅|☊|☋)/.test(line));
    const personal = collectLines(lines, "👤 Личные планеты:");
    const social = collectLines(lines, "🏛 Социальные планеты:");
    const higher = collectLines(lines, "✨ Высшие планеты:");

    return (
        <div style={{ display: "grid", gap: 14 }}>
            {!!facts.length && (
                <div
                    style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    }}
                >
                    {facts.map((item) => (
                        <div
                            key={item}
                            style={{
                                padding: 14,
                                borderRadius: 16,
                                border: "1px solid rgba(224,197,143,.12)",
                                background: "rgba(10,18,38,.18)",
                                lineHeight: 1.6,
                            }}
                        >
                            {item}
                        </div>
                    ))}
                </div>
            )}

            <PlanetSection title="Личные планеты" items={personal} />
            <PlanetSection title="Социальные планеты" items={social} />
            <PlanetSection title="Высшие планеты" items={higher} />
        </div>
    );
}

export function MarkdownCard({ text }: { text: string }) {
    const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

    return (
        <div style={{ display: "grid", gap: 12, color: "rgba(245,240,233,.94)" }}>
            {blocks.map((block, index) => {
                if (block.type === "heading") {
                    return (
                        <div
                            key={`${block.type}-${index}`}
                            style={{ fontWeight: 900, fontSize: 18 }}
                        >
                            {renderInlineMarkdown(block.text)}
                        </div>
                    );
                }

                if (block.type === "ordered") {
                    return (
                        <ol
                            key={`${block.type}-${index}`}
                            style={{
                                margin: 0,
                                paddingLeft: 22,
                                display: "grid",
                                gap: 10,
                                lineHeight: 1.75,
                            }}
                        >
                            {block.items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`}>
                                    {renderInlineMarkdown(item)}
                                </li>
                            ))}
                        </ol>
                    );
                }

                if (block.type === "unordered") {
                    return (
                        <ul
                            key={`${block.type}-${index}`}
                            style={{
                                margin: 0,
                                paddingLeft: 20,
                                display: "grid",
                                gap: 8,
                                lineHeight: 1.7,
                            }}
                        >
                            {block.items.map((item, itemIndex) => (
                                <li key={`${item}-${itemIndex}`}>
                                    {renderInlineMarkdown(item)}
                                </li>
                            ))}
                        </ul>
                    );
                }

                return (
                    <p
                        key={`${block.type}-${index}`}
                        style={{ margin: 0, lineHeight: 1.75 }}
                    >
                        {renderInlineMarkdown(block.text)}
                    </p>
                );
            })}
        </div>
    );
}
