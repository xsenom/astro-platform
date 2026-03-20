import type { CSSProperties } from "react";

export const cardTopRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
    alignItems: "start",
};

export const cardTitleStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    lineHeight: 1.25,
    minHeight: 40,
};

export const cardDescriptionStyle: CSSProperties = {
    color: "rgba(245,240,233,.72)",
    lineHeight: 1.5,
    minHeight: 72,
};

export const cardTagsRowStyle: CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    minHeight: 36,
    marginBottom: 12,
};

export function productCardStyle(): CSSProperties {
    return {
        padding: 16,
        borderRadius: 18,
        border: "1px solid rgba(224,197,143,.14)",
        background: "rgba(10,18,38,.18)",
        display: "flex",
        flexDirection: "column",
        minHeight: 266,
    };
}

export const bigCalendarCardStyle: CSSProperties = {
    padding: 20,
    borderRadius: 20,
    border: "1px solid rgba(224,197,143,.18)",
    background: "linear-gradient(180deg, rgba(20,35,75,.26), rgba(10,18,38,.22))",
    display: "flex",
    flexDirection: "column",
    minHeight: 244,
};

export const bigCalendarTopRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "start",
};

export const bigCalendarTitleStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: 18,
    lineHeight: 1.25,
    textAlign: "center",
    minHeight: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 44,
};

export const bigCalendarDescriptionStyle: CSSProperties = {
    color: "rgba(245,240,233,.72)",
    lineHeight: 1.5,
    minHeight: 62,
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

export const bigCalendarTagsRowStyle: CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    marginBottom: 12,
};

export function topBadgeStyle(mode: "free" | "bought" | "price"): CSSProperties {
    const background =
        mode === "free"
            ? "rgba(90,220,150,.12)"
            : mode === "bought"
                ? "rgba(110,170,255,.14)"
                : "rgba(224,197,143,.10)";

    return {
        minWidth: 114,
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background,
        color: "rgba(245,240,233,.92)",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1,
        flexShrink: 0,
    };
}

export function tagStyle(bg: string): CSSProperties {
    return {
        minWidth: 116,
        height: 28,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid rgba(224,197,143,.18)",
        background: bg,
        color: "rgba(245,240,233,.92)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        lineHeight: 1,
        whiteSpace: "nowrap",
    };
}

export function btn(): CSSProperties {
    return {
        borderRadius: 14,
        padding: "13px 16px",
        border: "1px solid rgba(224,197,143,.18)",
        background: "rgba(224,197,143,.10)",
        color: "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: "pointer",
        textAlign: "center",
    };
}
