"use client";

import React from "react";

type Props = {
    show: boolean;
    message?: string;
};

export default function MoonRouteTransition({ show, message = "Загружаем данные" }: Props) {
    if (!show) return null;

    return (
        <>
            <style>{`
        @keyframes moonOverlayPulse {
          0%   { opacity: .92; }
          50%  { opacity: 1; }
          100% { opacity: .92; }
        }
        @keyframes moonPop {
          0%   { transform: translateY(18px) scale(0.96); opacity: 0; }
          18%  { opacity: 1; }
          55%  { transform: translateY(0px) scale(1.00); opacity: 1; }
          100% { transform: translateY(0px) scale(1.00); opacity: 1; }
        }
        @keyframes moonSheen {
          0%   { opacity: 0; transform: translateX(-18px); }
          25%  { opacity: .35; }
          100% { opacity: .12; transform: translateX(18px); }
        }
      `}</style>

            <div
                aria-live="polite"
                aria-busy="true"
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 9999,
                    pointerEvents: "none",
                    display: "grid",
                    placeItems: "center",
                    animation: "moonOverlayPulse 2.2s ease-in-out infinite",
                    background:
                        "radial-gradient(1200px 600px at 50% 35%, rgba(10,18,38,.30), rgba(10,18,38,.62))",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    padding: "24px 16px",
                }}
            >
                <div
                    style={{
                        width: "min(980px, 100%)",
                        display: "grid",
                        gap: "clamp(16px, 4vw, 28px)",
                        justifyItems: "center",
                    }}
                >
                    <div
                        style={{
                            width: "min(520px, 100%)",
                            padding: "clamp(16px, 4vw, 26px)",
                            borderRadius: 28,
                            border: "1px solid rgba(224,197,143,.16)",
                            background: "linear-gradient(180deg, rgba(9,15,31,.82), rgba(18,28,56,.68))",
                            boxShadow: "0 18px 60px rgba(0,0,0,.28)",
                            textAlign: "center",
                        }}
                    >
                        <div
                            style={{
                                color: "rgba(245,240,233,.95)",
                                fontWeight: 900,
                                fontSize: "clamp(20px, 4vw, 30px)",
                                lineHeight: 1.2,
                            }}
                        >
                            {message}
                        </div>
                        <div
                            style={{
                                marginTop: 10,
                                color: "rgba(245,240,233,.72)",
                                fontSize: "clamp(13px, 2.7vw, 15px)",
                                lineHeight: 1.5,
                            }}
                        >
                            Подождите пару секунд — анимация остановится сразу после завершения загрузки.
                        </div>
                    </div>

                    <div
                        style={{
                            width: "min(980px, 100%)",
                            display: "flex",
                            gap: "clamp(12px, 3vw, 28px)",
                            justifyContent: "center",
                            alignItems: "center",
                            flexWrap: "wrap",
                        }}
                    >
                        <Moon size="clamp(88px, 20vw, 220px)" base="rgba(30, 38, 62, 0.98)" rim="rgba(120, 150, 220, 0.18)" glow="rgba(120, 150, 220, 0.18)" delayMs={0} />
                        <Moon size="clamp(104px, 24vw, 260px)" base="rgba(72, 92, 138, 0.96)" rim="rgba(190, 210, 255, 0.22)" glow="rgba(170, 200, 255, 0.22)" delayMs={140} />
                        <Moon size="clamp(120px, 28vw, 300px)" base="rgba(232, 236, 248, 0.95)" rim="rgba(255, 255, 255, 0.28)" glow="rgba(224, 197, 143, 0.18)" delayMs={280} />
                    </div>
                </div>
            </div>
        </>
    );
}

function Moon({
    size,
    base,
    rim,
    glow,
    delayMs,
}: {
    size: string;
    base: string;
    rim: string;
    glow: string;
    delayMs: number;
}) {
    return (
        <div
            style={{
                width: size,
                aspectRatio: "1 / 1",
                borderRadius: 9999,
                position: "relative",
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.20), ${base} 55%, rgba(0,0,0,.20) 100%)`,
                border: `1px solid rgba(224,197,143,.10)`,
                boxShadow: `0 0 0 1px rgba(255,255,255,.02) inset, 0 18px 60px ${glow}`,
                animation: "moonPop 1.65s cubic-bezier(.2,.9,.2,1) infinite alternate",
                animationDelay: `${delayMs}ms`,
                opacity: 0,
                overflow: "hidden",
                flex: "0 1 auto",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: -2,
                    borderRadius: 9999,
                    boxShadow: `0 0 0 2px ${rim} inset, 0 0 28px ${glow}`,
                    opacity: 0.75,
                }}
            />

            <div
                style={{
                    position: "absolute",
                    left: "18%",
                    top: "14%",
                    width: "42%",
                    height: "78%",
                    borderRadius: 9999,
                    background: "linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,0))",
                    transform: "rotate(-18deg)",
                    opacity: 0.18,
                }}
            />

            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 9999,
                    background:
                        "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.26), rgba(255,255,255,0))",
                    width: "60%",
                    height: "100%",
                    left: "20%",
                    opacity: 0,
                    animation: "moonSheen 1.85s ease-in-out infinite alternate",
                    animationDelay: `${delayMs + 120}ms`,
                    mixBlendMode: "screen",
                }}
            />
        </div>
    );
}
