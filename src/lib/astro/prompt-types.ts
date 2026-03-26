export type AstroPromptKind =
    | "day"
    | "week"
    | "favorable_days"
    | "natal"
    | "uran";

export function isAstroPromptKind(value: unknown): value is AstroPromptKind {
    return (
        value === "day" ||
        value === "week" ||
        value === "favorable_days" ||
        value === "natal" ||
        value === "uran"
    );
}