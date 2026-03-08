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

type PlanetKind =
    | "mercury"
    | "venus"
    | "earth"
    | "mars"
    | "jupiter"
    | "saturn"
    | "uranus"
    | "neptune";

type Planet = {
    kind: PlanetKind;
    x: number;
    y: number;
    r: number;
    a: number; // alpha base
    vx: number;
    vy: number;
    tw: number; // twinkle/variation speed
    seed: number;

    // NEW: вращение
    spin: number; // текущий угол
    spinV: number; // скорость вращения (rad/sec)
};

function clamp01(v: number) {
    return Math.max(0, Math.min(1, v));
}
function smootherstep(t: number) {
    t = clamp01(t);
    return t * t * t * (t * (t * 6 - 15) + 10);
}
function rand01(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}
function hash(seed: number, k: number) {
    return seed * 374761393 + k * 668265263;
}

function drawCircleClip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    fn: () => void
) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    fn();
    ctx.restore();
}

function drawSaturnRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    alpha: number
) {
    const ringRx = r * 1.9;
    const ringRy = r * 0.62;
    const tilt = -0.35;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    ctx.globalCompositeOperation = "lighter";

    // back arc
    ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.strokeStyle = `rgba(220, 205, 170, ${alpha * 0.16})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRx, ringRy, 0, Math.PI, 0, true);
    ctx.stroke();

    // inner
    ctx.lineWidth = Math.max(0.9, r * 0.07);
    ctx.strokeStyle = `rgba(200, 180, 140, ${alpha * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRx * 0.78, ringRy * 0.78, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

// ----------------------
// Цвет планеты + сила оттенка
// ----------------------
function planetTint(kind: PlanetKind) {
    switch (kind) {
        case "mars":
            return { rgb: "255, 90, 70", strength: 1.0 };
        case "venus":
            return { rgb: "255, 205, 120", strength: 0.7 };
        case "earth":
            return { rgb: "120, 210, 255", strength: 0.85 };
        case "jupiter":
            return { rgb: "255, 210, 160", strength: 0.55 };
        case "saturn":
            return { rgb: "230, 215, 170", strength: 0.55 };
        case "uranus":
            return { rgb: "140, 255, 255", strength: 0.7 };
        case "neptune":
            return { rgb: "90, 140, 255", strength: 0.85 };
        case "mercury":
        default:
            return { rgb: "210, 205, 195", strength: 0.25 };
    }
}

// ----------------------
// Offscreen sprites cache (теперь спрайт = “поверхность”, без блика/тени)
// ----------------------
type SpriteCacheEntry = { canvas: HTMLCanvasElement; usedAt: number };
const planetSpriteCache = new Map<string, SpriteCacheEntry>();

function getPlanetSurfaceSprite(p: Planet) {
    const key = `${p.kind}:${Math.round(p.r)}:${p.seed}`;
    const hit = planetSpriteCache.get(key);
    if (hit) {
        hit.usedAt = performance.now();
        return hit.canvas;
    }

    const r = p.r;
    const tint = planetTint(p.kind);

    const size = Math.max(96, Math.ceil(r * 5.0)); // запас чтобы blur не обрезался
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;

    const ctx = c.getContext("2d");
    if (!ctx) return c;

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);

    // поверхность в клипе (без блика и терминатора — их нарисуем сверху, фиксировано к “Солнцу”)
    drawCircleClip(ctx, 0, 0, r, () => {
        // базовый цвет/объём (мягкий)
        const base = ctx.createRadialGradient(
            -r * 0.35,
            -r * 0.25,
            r * 0.15,
            0,
            0,
            r * 1.25
        );
        base.addColorStop(0, "rgba(255, 250, 238, 1)");
        base.addColorStop(0.6, "rgba(245, 224, 185, 1)");
        base.addColorStop(1, "rgba(120, 105, 80, 1)");
        ctx.fillStyle = base;
        ctx.fillRect(-r, -r, r * 2, r * 2);

        // полосы/мрамор
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        ctx.filter = `blur(${Math.max(1.5, r * 0.1)}px)`;

        const bandCount =
            p.kind === "jupiter"
                ? 12
                : p.kind === "saturn"
                    ? 10
                    : p.kind === "neptune"
                        ? 9
                        : p.kind === "uranus"
                            ? 9
                            : 7;

        for (let i = 0; i < bandCount; i++) {
            const s = hash(p.seed, 3000 + i);
            const yy = -r + (i / (bandCount - 1)) * (r * 2);
            const hh = r * (0.16 + rand01(s) * 0.12);
            const wobble = (rand01(s + 17) * 2 - 1) * r * 0.1;

            const a1 = 0.08 + rand01(s + 33) * 0.1;
            ctx.fillStyle = `rgba(255,255,255,${a1})`;
            ctx.fillRect(-r, yy - hh * 0.5 + wobble, r * 2, hh);

            const a2 = 0.05 + rand01(s + 55) * 0.09;
            ctx.fillStyle = `rgba(30,35,45,${a2})`;
            ctx.fillRect(-r, yy - hh * 0.35 + wobble * 0.6, r * 2, hh * 0.75);
        }

        ctx.globalCompositeOperation = "overlay";
        for (let k = 0; k < Math.max(26, Math.floor(r * 1.2)); k++) {
            const s = hash(p.seed, 4000 + k);
            const px = (rand01(s) * 2 - 1) * r;
            const py = (rand01(s + 11) * 2 - 1) * r;
            const pr = r * (0.08 + rand01(s + 21) * 0.22);
            const pa = 0.04 + rand01(s + 31) * 0.07;
            ctx.fillStyle = `rgba(255,255,255,${pa})`;
            ctx.beginPath();
            ctx.ellipse(
                px,
                py,
                pr * 1.2,
                pr * 0.8,
                rand01(s + 41) * Math.PI,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }

        ctx.filter = "none";
        ctx.restore();

        // цветовой тинт
        ctx.save();
        ctx.globalCompositeOperation = "soft-light";
        const tintG = ctx.createRadialGradient(
            -r * 0.35,
            -r * 0.25,
            r * 0.1,
            0,
            0,
            r * 1.35
        );
        tintG.addColorStop(0, `rgba(${tint.rgb}, ${0.4 * tint.strength})`);
        tintG.addColorStop(1, `rgba(${tint.rgb}, 0)`);
        ctx.fillStyle = tintG;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        // мягкий край (альфа-фейд)
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        const edge = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.06);
        edge.addColorStop(0, "rgba(255,255,255,1)");
        edge.addColorStop(0.8, "rgba(255,255,255,1)");
        edge.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = edge;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    ctx.restore();

    planetSpriteCache.set(key, { canvas: c, usedAt: performance.now() });

    // уборка кэша
    if (planetSpriteCache.size > 64) {
        const arr = [...planetSpriteCache.entries()].sort(
            (a, b) => a[1].usedAt - b[1].usedAt
        );
        for (let i = 0; i < 16; i++) planetSpriteCache.delete(arr[i][0]);
    }

    return c;
}

// фиксированный свет/тень (как будто “я — Солнце слева-сверху”)
function drawPlanetLighting(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    alpha: number
) {
    // блик слева-сверху
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    const hl = ctx.createRadialGradient(
        x - r * 0.55,
        y - r * 0.4,
        0,
        x - r * 0.55,
        y - r * 0.4,
        r * 1.25
    );
    hl.addColorStop(0, "rgba(255,255,255,0.25)");
    hl.addColorStop(0.45, "rgba(255,255,255,0.12)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // терминатор справа (тень)
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = alpha;
    const term = ctx.createRadialGradient(
        x + r * 0.85,
        y + r * 0.05,
        r * 0.15,
        x + r * 0.85,
        y + r * 0.05,
        r * 1.55
    );
    term.addColorStop(0, "rgba(0,0,0,0)");
    term.addColorStop(0.55, "rgba(0,0,0,0.35)");
    term.addColorStop(1, "rgba(0,0,0,0.70)");
    ctx.fillStyle = term;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// планета: вращаем поверхность, свет остаётся
function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, t: number) {
    const { x, y, r } = p;

    const tw = 0.92 + 0.08 * Math.sin(t * p.tw + p.seed * 0.0008);
    const alpha = clamp01(p.a * tw);

    const tint = planetTint(p.kind);
    const sprite = getPlanetSurfaceSprite(p);
    const size = sprite.width;

    // 1) диск поверхности (вращаем)
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;

    const diskBlur = Math.max(1.0, r * 0.1);
    ctx.filter = `blur(${diskBlur}px)`;

    ctx.translate(x, y);
    ctx.rotate(p.spin);
    ctx.drawImage(sprite, -size / 2, -size / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.filter = "none";
    ctx.restore();

    // 2) свет/тень (фиксированные)
    drawPlanetLighting(ctx, x, y, r, alpha);

    // 3) кольца Сатурна (не вращаем поверхность колец вместе с планетой)
    if (p.kind === "saturn") {
        ctx.save();
        ctx.globalAlpha = alpha;
        drawSaturnRing(ctx, x, y, r, 1);
        ctx.restore();
    }

    // 4) glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (0.55 + 0.25 * tint.strength);
    ctx.filter = `blur(${Math.max(10, r * 0.85)}px)`;

    const glowR = r * 1.65;
    const g = ctx.createRadialGradient(x, y, r * 0.38, x, y, glowR);
    g.addColorStop(0, `rgba(${tint.rgb}, ${0.24 * tint.strength})`);
    g.addColorStop(0.55, `rgba(${tint.rgb}, ${0.14 * tint.strength})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.filter = "none";
    ctx.restore();
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

        const PLANET_SPEED_MULT = prefersReduce ? 0.55 : 1.0;
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

            if (planetSpriteCache.size > 32) {
                const arr = [...planetSpriteCache.entries()].sort(
                    (a, b) => a[1].usedAt - b[1].usedAt
                );
                for (let i = 0; i < Math.min(16, arr.length); i++)
                    planetSpriteCache.delete(arr[i][0]);
            }
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
        // planets: слева -> направо + вращение
        // ----------------------
        const order: PlanetKind[] = [
            "mercury",
            "venus",
            "earth",
            "mars",
            "jupiter",
            "saturn",
            "uranus",
            "neptune",
        ];
        const planetCount = Math.max(6, Math.min(10, Math.floor((w * h) / 220000) + 6));

        const planets: Planet[] = Array.from({ length: planetCount }, (_, i) => {
            const kind = order[i % order.length];

            const baseR =
                kind === "jupiter"
                    ? 26
                    : kind === "saturn"
                        ? 24
                        : kind === "uranus"
                            ? 20
                            : kind === "neptune"
                                ? 20
                                : kind === "earth"
                                    ? 18
                                    : kind === "venus"
                                        ? 18
                                        : kind === "mars"
                                            ? 16
                                            : 14;

            const r = baseR + Math.random() * 12;

            const speedBase =
                kind === "neptune" || kind === "uranus"
                    ? 0.02
                    : kind === "saturn"
                        ? 0.024
                        : kind === "jupiter"
                            ? 0.026
                            : 0.03;

            const vx = (speedBase + Math.random() * 0.02) * PLANET_SPEED_MULT;

            // скорость вращения поверхности (rad/sec)
            const spinBase =
                kind === "jupiter"
                    ? 0.9
                    : kind === "saturn"
                        ? 0.75
                        : kind === "mars"
                            ? 1.1
                            : kind === "mercury"
                                ? 0.6
                                : 0.85;

            const spinV = (spinBase + Math.random() * 0.6) * (prefersReduce ? 0.7 : 1);

            const pos = randomOutsideSafe();
            const stagger = (i / Math.max(1, planetCount - 1)) * w;
            const startX = -r * (3 + Math.random() * 8) + stagger * 0.25;

            return {
                kind,
                x: startX,
                y: pos.y,
                r,
                a: 0.34,
                vx,
                vy: (Math.random() * 2 - 1) * 0.03,
                tw: 0.06 + Math.random() * 0.14,
                seed: 1000 + i * 777,
                spin: Math.random() * Math.PI * 2,
                spinV,
            };
        });

        const keepOutsideSafe = (p: Planet) => {
            const safe = safeZone();
            const inside = p.x > safe.x1 && p.x < safe.x2 && p.y > safe.y1 && p.y < safe.y2;
            if (!inside) return;

            const dxLeft = Math.abs(p.x - safe.x1);
            const dxRight = Math.abs(safe.x2 - p.x);
            const dyTop = Math.abs(p.y - safe.y1);
            const dyBottom = Math.abs(safe.y2 - p.y);
            const m = Math.min(dxLeft, dxRight, dyTop, dyBottom);

            if (m === dxLeft) p.x = safe.x1 - p.r - 22;
            else if (m === dxRight) p.x = safe.x2 + p.r + 22;
            else if (m === dyTop) p.y = safe.y1 - p.r - 22;
            else p.y = safe.y2 + p.r + 22;
        };

        // dt-based обновление
        const driftPlanets = (t: number, dt: number) => {
            for (const p of planets) {
                p.x += p.vx * (dt * 60); // сохраняем “ощущение” твоих скоростей, но через dt
                p.spin += p.spinV * dt;

                p.y += Math.sin(t * 0.18 + p.seed * 0.01) * 0.06 + p.vy * (dt * 60);

                const top = p.r * 1.6;
                const bottom = h - p.r * 1.6;
                if (p.y < top) p.y = top;
                if (p.y > bottom) p.y = bottom;

                keepOutsideSafe(p);

                const margin = p.r * 6;
                if (p.x > w + margin) {
                    p.x = -margin;
                    p.y = randomOutsideSafe().y;
                }
            }
        };

        const drawPlanets = (t: number) => {
            const sorted = [...planets].sort((a, b) => a.r - b.r);
            for (const p of sorted) drawPlanet(ctx, p, t);
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
        // tick (dt based)
        // ----------------------
        let lastMs = performance.now();

        const tick = (ms: number) => {
            const t = ms / 1000;
            const dt = Math.min(0.05, (ms - lastMs) / 1000); // clamp на всякий
            lastMs = ms;

            ctx.clearRect(0, 0, w, h);
            drawBackgroundGlow();
            drawStars(t);

            driftPlanets(t, dt);
            drawPlanets(t);

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


