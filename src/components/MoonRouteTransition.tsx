"use client";

import React from "react";

type Props = {
    show: boolean;
};

export default function MoonRouteTransition({ show }: Props) {
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
                aria-hidden="true"
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
                }}
            >
                <div
                    style={{
                        width: "min(980px, 92vw)",
                        display: "flex",
                        gap: "clamp(14px, 3vw, 28px)",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <Moon size={220} base="rgba(30, 38, 62, 0.98)" rim="rgba(120, 150, 220, 0.18)" glow="rgba(120, 150, 220, 0.18)" delayMs={0} />
                    <Moon size={260} base="rgba(72, 92, 138, 0.96)" rim="rgba(190, 210, 255, 0.22)" glow="rgba(170, 200, 255, 0.22)" delayMs={140} />
                    <Moon size={300} base="rgba(232, 236, 248, 0.95)" rim="rgba(255, 255, 255, 0.28)" glow="rgba(224, 197, 143, 0.18)" delayMs={280} />
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
    size: number;
    base: string;
    rim: string;
    glow: string;
    delayMs: number;
}) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: 9999,
                position: "relative",
                background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.20), ${base} 55%, rgba(0,0,0,.20) 100%)`,
                border: `1px solid rgba(224,197,143,.10)`,
                boxShadow: `0 0 0 1px rgba(255,255,255,.02) inset, 0 18px 60px ${glow}`,
                animation: "moonPop 1.65s cubic-bezier(.2,.9,.2,1) infinite alternate",
                animationDelay: `${delayMs}ms`,
                opacity: 0,
                overflow: "hidden",
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
