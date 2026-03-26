export type CalcKind =
    | "natal"
    | "day"
    | "week"
    | "month"
    | "big_calendar"
    | "uranus_gemini";

export type ApiResult =
    | { kind: "natal"; text: string; meta?: any }
    | { kind: "day"; text: string; raw?: any }
    | { kind: "week"; text: string; raw?: any }
    | { kind: "month"; text: string; raw?: any }
    | { kind: "big_calendar"; text: string; raw?: any }
    | { kind: "uranus_gemini"; text: string; raw?: any };

export type BirthProfile = {
    birth_date: string | null;
    birth_time: string | null;
    birth_city: string | null;
};

export type ProductRow = {
    code: CalcKind;
    title: string;
    description: string | null;
    price_rub: number;
    is_free: boolean;
    is_active: boolean;
    sort_order: number;
};

export type AccessRow = {
    product_code: CalcKind;
};

export type SavedCalculationRow = {
    id: string;
    kind: CalcKind;
    target_date: string | null;
    result_text: string;
    result_json: any;
    input_params: any;
    updated_at: string;
    interpretation_text?: string | null;
    interpretation_model?: string | null;
    interpretation_updated_at?: string | null;
    pdf_url?: string | null;
    pdf_path?: string | null;
    file_name?: string | null;
};

export type AdminState = {
    isAdmin: boolean;
    isSuper: boolean;
};

export type InterpretationState = {
    loading: boolean;
    text: string | null;
    error: string | null;
    model: string | null;
};

export type MarkdownSection = {
    title: string;
    body: string[];
};
