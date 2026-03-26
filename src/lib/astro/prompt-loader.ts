import path from "path";
import { promises as fs } from "fs";
import type { AstroPromptKind } from "./prompt-types";

const PROMPT_FILE_MAP: Record<AstroPromptKind, string> = {
    day: "day.txt",
    week: "week.txt",
    favorable_days: "favorable_days.txt",
    natal: "natal.txt",
    uran: "uran.txt",
};

export async function loadAstroPrompt(kind: AstroPromptKind): Promise<string> {
    const fileName = PROMPT_FILE_MAP[kind];
    const filePath = path.join(process.cwd(), "src", "lib", "astro", "prompts", fileName);

    const content = await fs.readFile(filePath, "utf-8");
    return content.trim();
}