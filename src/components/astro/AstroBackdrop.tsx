"use client";

import { useEffect, useMemo, useRef } from "react";

type AstroPt = { x: number; y: number };

type AstroConstellation = {
    key:
        | "Овен"
        | "Телец"
        | "Близнецы"
        | "Рак"
        | "Лев"
        | "Дева"
        | "Весы"
        | "Скорпион"
        | "Стрелец"
        | "Козерог"
        | "Водолей"
        | "Рыбы";
    pts: AstroPt[];
    edges: Array<[number, number]>;
};

function clamp01(v: number) {
    return Math.max(0, Math.min(1, v));
}

function smootherstep(t: number) {
    t = clamp01(t);
    return t * t * t * (t * (t * 6 - 15) + 10);
}


export default function AstroBackdrop() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const constellations = useMemo<AstroConstellation[]>(
        () => [
            { key: "Овен", pts: [{ x: 0.18, y: 0.32 }, { x: 0.28, y: 0.28 }, { x: 0.4, y: 0.33 }, { x: 0.52, y: 0.4 }, { x: 0.62, y: 0.44 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] },
            { key: "Телец", pts: [{ x: 0.2, y: 0.55 }, { x: 0.3, y: 0.48 }, { x: 0.42, y: 0.5 }, { x: 0.54, y: 0.56 }, { x: 0.66, y: 0.52 }, { x: 0.58, y: 0.45 }], edges: [[0, 1], [1, 2], [2, 3], [2, 5], [5, 4]] },
            { key: "Близнецы", pts: [{ x: 0.22, y: 0.26 }, { x: 0.22, y: 0.48 }, { x: 0.22, y: 0.7 }, { x: 0.5, y: 0.26 }, { x: 0.5, y: 0.48 }, { x: 0.5, y: 0.7 }], edges: [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [2, 5]] },
            { key: "Рак", pts: [{ x: 0.28, y: 0.38 }, { x: 0.4, y: 0.34 }, { x: 0.52, y: 0.4 }, { x: 0.58, y: 0.54 }, { x: 0.46, y: 0.62 }, { x: 0.32, y: 0.54 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
            { key: "Лев", pts: [{ x: 0.2, y: 0.42 }, { x: 0.32, y: 0.36 }, { x: 0.44, y: 0.38 }, { x: 0.54, y: 0.48 }, { x: 0.48, y: 0.62 }, { x: 0.34, y: 0.64 }, { x: 0.26, y: 0.54 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
            { key: "Дева", pts: [{ x: 0.22, y: 0.32 }, { x: 0.32, y: 0.4 }, { x: 0.42, y: 0.34 }, { x: 0.52, y: 0.4 }, { x: 0.62, y: 0.48 }, { x: 0.54, y: 0.58 }, { x: 0.4, y: 0.62 }, { x: 0.3, y: 0.54 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
            { key: "Весы", pts: [{ x: 0.26, y: 0.46 }, { x: 0.36, y: 0.38 }, { x: 0.5, y: 0.34 }, { x: 0.64, y: 0.38 }, { x: 0.74, y: 0.46 }, { x: 0.5, y: 0.6 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [3, 5]] },
            { key: "Скорпион", pts: [{ x: 0.18, y: 0.38 }, { x: 0.3, y: 0.44 }, { x: 0.42, y: 0.4 }, { x: 0.54, y: 0.46 }, { x: 0.66, y: 0.52 }, { x: 0.74, y: 0.62 }, { x: 0.7, y: 0.72 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
            { key: "Стрелец", pts: [{ x: 0.22, y: 0.62 }, { x: 0.34, y: 0.5 }, { x: 0.48, y: 0.44 }, { x: 0.62, y: 0.4 }, { x: 0.7, y: 0.52 }, { x: 0.54, y: 0.64 }, { x: 0.4, y: 0.7 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6]] },
            { key: "Козерог", pts: [{ x: 0.22, y: 0.4 }, { x: 0.34, y: 0.34 }, { x: 0.46, y: 0.38 }, { x: 0.58, y: 0.46 }, { x: 0.66, y: 0.6 }, { x: 0.52, y: 0.64 }, { x: 0.34, y: 0.58 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]] },
            { key: "Водолей", pts: [{ x: 0.18, y: 0.44 }, { x: 0.3, y: 0.38 }, { x: 0.42, y: 0.44 }, { x: 0.54, y: 0.38 }, { x: 0.66, y: 0.44 }, { x: 0.78, y: 0.38 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
            { key: "Рыбы", pts: [{ x: 0.22, y: 0.42 }, { x: 0.34, y: 0.36 }, { x: 0.48, y: 0.4 }, { x: 0.62, y: 0.48 }, { x: 0.74, y: 0.56 }, { x: 0.58, y: 0.62 }, { x: 0.4, y: 0.58 }], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [2, 6]] },
        ],
        []
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const prefersReduce =
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

        const STAR_DRIFT_MULT = prefersReduce ? 0.35 : 1.0;

        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

        let w = 0;
        let h = 0;

        const resize = () => {
            w = window.innerWidth;
            h = window.innerHeight;
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        };

        resize();
        window.addEventListener("resize", resize);

        // зона под контент
        const safeZone = () => ({
            x1: w * 0.26,
            x2: w * 0.74,
            y1: h * 0.2,
            y2: h * 0.8,
        });

        const randomOutsideSafe = () => {
            const safe = safeZone();
            for (let k = 0; k < 22; k++) {
                const x = w * (0.08 + Math.random() * 0.84);
                const y = h * (0.1 + Math.random() * 0.8);
                const inside = x > safe.x1 && x < safe.x2 && y > safe.y1 && y < safe.y2;
                if (!inside) return { x, y };
            }
            return { x: w * 0.86, y: h * 0.18 };
        };

        const drawBackgroundGlow = () => {
            const g1 = ctx.createRadialGradient(
                w * 0.25,
                h * 0.15,
                0,
                w * 0.25,
                h * 0.15,
                Math.max(w, h) * 0.8
            );
            g1.addColorStop(0, "rgba(60, 80, 112, 0.28)");
            g1.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g1;
            ctx.fillRect(0, 0, w, h);

            const g2 = ctx.createRadialGradient(
                w * 0.8,
                h * 0.1,
                0,
                w * 0.8,
                h * 0.1,
                Math.max(w, h) * 0.9
            );
            g2.addColorStop(0, "rgba(17, 34, 80, 0.26)");
            g2.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g2;
            ctx.fillRect(0, 0, w, h);

            const g3 = ctx.createRadialGradient(
                w * 0.6,
                h * 0.9,
                0,
                w * 0.6,
                h * 0.9,
                Math.max(w, h) * 0.85
            );
            g3.addColorStop(0, "rgba(224, 197, 143, 0.08)");
            g3.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = g3;
            ctx.fillRect(0, 0, w, h);
        };

        // ----------------------
        // stars
        // ----------------------
        const starCount = Math.floor((w * h) / 11000) + 160;
        const stars = Array.from({ length: starCount }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: 0.6 + Math.random() * 1.4,
            a: 0.2 + Math.random() * 0.55,
            tw: 0.25 + Math.random() * 1.0,
            sp: (0.01 + Math.random() * 0.045) * STAR_DRIFT_MULT,
        }));

        const drawStars = (t: number) => {
            for (const s of stars) {
                s.x += s.sp;
                if (s.x > w + 10) {
                    s.x = -10;
                    s.y = Math.random() * h;
                }

                const tw = 0.78 + 0.22 * Math.sin(t * s.tw + s.y * 0.01);
                const alpha = clamp01(s.a * tw);

                ctx.beginPath();
                ctx.fillStyle = `rgba(245, 240, 233, ${alpha})`;
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        // ----------------------
        // constellations
        // ----------------------
        let active = constellations[Math.floor(Math.random() * constellations.length)];
        let pos = randomOutsideSafe();
        let cycleStart = performance.now();

        const FADE_IN = prefersReduce ? 1200 : 4200;
        const HOLD = prefersReduce ? 900 : 2400;
        const FADE_OUT = prefersReduce ? 1400 : 5200;

        const GAP_MIN = 7000;
        const GAP_MAX = 15000;
        let nextCycleAt = performance.now() + (GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN));

        const pickNext = () => {
            active = constellations[Math.floor(Math.random() * constellations.length)];
            pos = randomOutsideSafe();
            cycleStart = performance.now();
            nextCycleAt =
                performance.now() + (GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN));
        };

        const pulseAt = (now: number) => {
            const dt = now - cycleStart;
            const total = FADE_IN + HOLD + FADE_OUT;

            if (dt < 0) return 0;
            if (dt > total) return 0;

            if (dt <= FADE_IN) return smootherstep(dt / FADE_IN);
            if (dt <= FADE_IN + HOLD) return 1;
            return 1 - smootherstep((dt - FADE_IN - HOLD) / FADE_OUT);
        };

        const drawConstellation = (now: number) => {
            const dt = now - cycleStart;
            const total = FADE_IN + HOLD + FADE_OUT;
            if (dt > total && now > nextCycleAt) pickNext();

            const pulse = pulseAt(now);
            const aLine = 0.04 + pulse * 0.18;
            const aPoint = 0.06 + pulse * 0.26;

            const scale = Math.min(w, h) * 0.52;
            const pts = active.pts.map((p) => ({
                x: pos.x + (p.x - 0.5) * scale,
                y: pos.y + (p.y - 0.5) * scale,
            }));

            ctx.save();
            ctx.globalCompositeOperation = "lighter";

            ctx.lineWidth = 1.35;
            ctx.strokeStyle = `rgba(224, 197, 143, ${aLine})`;
            ctx.shadowColor = "rgba(224, 197, 143, 0.18)";
            ctx.shadowBlur = 20;

            ctx.beginPath();
            for (const [i, j] of active.edges) {
                ctx.moveTo(pts[i].x, pts[i].y);
                ctx.lineTo(pts[j].x, pts[j].y);
            }
            ctx.stroke();

            ctx.shadowBlur = 24;
            for (const p of pts) {
                ctx.beginPath();
                ctx.fillStyle = `rgba(224, 197, 143, ${aPoint})`;
                ctx.arc(p.x, p.y, 2.25, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.fillStyle = `rgba(245, 240, 233, ${aPoint * 0.48})`;
                ctx.arc(p.x, p.y, 0.95, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        };

        // ----------------------
        // tick
        // ----------------------
        const tick = (ms: number) => {
            const t = ms / 1000;

            ctx.clearRect(0, 0, w, h);
            drawBackgroundGlow();
            drawStars(t);


            drawConstellation(ms);

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            window.removeEventListener("resize", resize);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [constellations]);

    return <canvas ref={canvasRef} className="astroBackdrop" aria-hidden="true" />;
}

