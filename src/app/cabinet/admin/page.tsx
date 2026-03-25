"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCabinetLoading } from "@/components/cabinet/cabinetLoading";

type ProfileRow = {
    id: string;
    email: string | null;
    full_name: string | null;
    birth_date?: string | null;
    birth_time?: string | null;
    birth_city?: string | null;
    created_at?: string | null;
    updated_at: string | null;
};

type UserEditorState = {
    id: string;
    email: string;
    full_name: string;
    birth_date: string;
    birth_time: string;
    birth_city: string;
};

type UsersPagination = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
};

type OrderRow = {
    id: string;
    user_id: string;
    user_email: string | null;
    status: string | null;
    amount_cents: number | null;
    currency: string | null;
    provider: string | null;
    provider_order_id: string | null;
    paid_at: string | null;
    created_at: string | null;
};

type CalculationRow = {
    id: string;
    user_id: string;
    calc_type?: string | null;
    status: string | null;
    created_at: string | null;
    updated_at: string | null;
};

type SavedCalculationOption = {
    id: string;
    kind: string;
    target_date: string | null;
    updated_at: string | null;
    pdf_url: string | null;
    file_name: string | null;
    result_text: string;
};

type EditorCalculationOption = {
    id: string;
    source: "saved" | "queue";
    kind: string;
    target_date: string | null;
    updated_at: string | null;
    status: string | null;
};

type SupportThreadRow = {
    id: string;
    created_at: string;
    last_message_at: string;
    updated_at: string | null;
    user_id: string;
    user_name: string | null;
    user_email: string | null;
    category: string;
    subject: string;
    status: string;
};

type SupportMsgRow = {
    id: string;
    created_at: string;
    thread_id: string;
    author_user_id: string | null;
    author_admin_id: string | null;
    is_admin: boolean;
    message: string;
    attachment_url: string | null;
};

type IdRow = { id: string };

type SegmentKey =
    | "admins_test"
    | "paid"
    | "no_paid"
    | "calculations"
    | "inactive_30d"
    | "manual_list"
    | "zodiac_aries"
    | "zodiac_taurus"
    | "zodiac_gemini"
    | "zodiac_cancer"
    | "zodiac_leo"
    | "zodiac_virgo"
    | "zodiac_libra"
    | "zodiac_scorpio"
    | "zodiac_sagittarius"
    | "zodiac_capricorn"
    | "zodiac_aquarius"
    | "zodiac_pisces"
    | "all";

type EmailCampaignRow = {
    id: string | number;
    created_at: string;
    segment_key: SegmentKey;
    subject: string;
    status: string;
    recipients_count: number;
    sent_count: number;
    failed_count: number;
    created_by: string | null;
};

type EmailSegmentCounts = Record<SegmentKey, number>;

type DashboardStats = {
    total_revenue_cents: number;
    total_paid_orders: number;
    average_check_cents: number;
    total_related_profiles: number;
    total_marketing_contacts: number;
    email_opened: number;
    email_delivered: number;
    email_failed: number;
};

type BuilderState = {
    preheader: string;
    title: string;
    intro: string;
    body: string;
    buttonLabel: string;
    buttonUrl: string;
    footer: string;
    backgroundColor: string;
    cardColor: string;
    textColor: string;
    accentColor: string;
    buttonColor: string;
    imageUrl: string;
    imageAlt: string;
};

const SEGMENT_LABELS: Record<SegmentKey, string> = {
    admins_test: "Список администраторов",
    paid: "Пользователи с оплатой",
    no_paid: "Без оплат",
    calculations: "Пользователи с расчётами",
    inactive_30d: "Неактивные 30 дней",
    manual_list: "Ручной список (email)",
    zodiac_aries: "Зодиак: Овен",
    zodiac_taurus: "Зодиак: Телец",
    zodiac_gemini: "Зодиак: Близнецы",
    zodiac_cancer: "Зодиак: Рак",
    zodiac_leo: "Зодиак: Лев",
    zodiac_virgo: "Зодиак: Дева",
    zodiac_libra: "Зодиак: Весы",
    zodiac_scorpio: "Зодиак: Скорпион",
    zodiac_sagittarius: "Зодиак: Стрелец",
    zodiac_capricorn: "Зодиак: Козерог",
    zodiac_aquarius: "Зодиак: Водолей",
    zodiac_pisces: "Зодиак: Рыбы",
    all: "Вся база",
};

const SEGMENT_DESCRIPTIONS: Record<SegmentKey, string> = {
    admins_test: "Безопасный сегмент для теста и служебных писем.",
    paid: "Только пользователи с подтверждённой оплатой.",
    no_paid: "Пользователи без оплаченных заказов.",
    calculations: "Пользователи, у которых есть расчёты.",
    inactive_30d: "Пользователи без активности последние 30 дней.",
    manual_list: "Ручной список адресов. Новые email автоматически сохраняются в контакты.",
    zodiac_aries: "Пользователи со знаком Овен.",
    zodiac_taurus: "Пользователи со знаком Телец.",
    zodiac_gemini: "Пользователи со знаком Близнецы.",
    zodiac_cancer: "Пользователи со знаком Рак.",
    zodiac_leo: "Пользователи со знаком Лев.",
    zodiac_virgo: "Пользователи со знаком Дева.",
    zodiac_libra: "Пользователи со знаком Весы.",
    zodiac_scorpio: "Пользователи со знаком Скорпион.",
    zodiac_sagittarius: "Пользователи со знаком Стрелец.",
    zodiac_capricorn: "Пользователи со знаком Козерог.",
    zodiac_aquarius: "Пользователи со знаком Водолей.",
    zodiac_pisces: "Пользователи со знаком Рыбы.",
    all: "Вся пользовательская база. Для этого сегмента нужно подтверждение.",
};

const SEGMENT_ORDER: SegmentKey[] = [
    "admins_test",
    "paid",
    "no_paid",
    "calculations",
    "inactive_30d",
    "manual_list",
    "zodiac_aries",
    "zodiac_taurus",
    "zodiac_gemini",
    "zodiac_cancer",
    "zodiac_leo",
    "zodiac_virgo",
    "zodiac_libra",
    "zodiac_scorpio",
    "zodiac_sagittarius",
    "zodiac_capricorn",
    "zodiac_aquarius",
    "zodiac_pisces",
    "all",
];


const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
    payment: "Оплата / покупка",
    calc: "Расчёт не пришёл / завис",
    profile: "Профиль (дата/время/город)",
    other: "Другое",
};

const SUPPORT_STATUS_LABELS: Record<string, string> = {
    open: "Открыт",
    closed: "Закрыт",
};

function getSupportCategoryLabel(category: string) {
    return SUPPORT_CATEGORY_LABELS[category] ?? category;
}

function getSupportStatusLabel(status: string) {
    return SUPPORT_STATUS_LABELS[status] ?? status;
}

function getSupportUserLabel(thread: Pick<SupportThreadRow, "user_name" | "user_email" | "user_id">) {
    const name = thread.user_name?.trim();
    const email = thread.user_email?.trim();

    if (name && email) return `${name} • ${email}`;
    if (name) return name;
    if (email) return email;
    return `ID: ${thread.user_id}`;
}

function getCalculationLabel(kind: string) {
    const labels: Record<string, string> = {
        natal: "Натальная карта",
        day: "Прогноз на день",
        week: "Прогноз на неделю",
        month: "Прогноз на месяц",
        big_calendar: "Большой календарь",
    };

    return labels[kind] ?? kind;
}

const DEFAULT_BUILDER_STATE: BuilderState = {
    preheader: "Короткий анонс письма, который увидят в превью.",
    title: "Заголовок письма",
    intro: "Короткое вступление: зачем это письмо и что в нём важного.",
    body: "Основной текст письма. Здесь можно расписать детали, бонусы, дедлайны и любые пояснения для аудитории.",
    buttonLabel: "Перейти",
    buttonUrl: "https://example.com",
    footer: "Если письмо пришло по ошибке, просто проигнорируйте его.",
    backgroundColor: "#0b1226",
    cardColor: "#16213f",
    textColor: "#f5f0e9",
    accentColor: "#e0c58f",
    buttonColor: "#d7b46d",
    imageUrl: "",
    imageAlt: "Иллюстрация письма",
};

function PaperclipIcon({ size = 18 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
                d="M21.44 11.05l-8.49 8.49a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.19 9.19a2 2 0 01-2.83-2.83l8.49-8.49"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function textToHtml(value: string) {
    return escapeHtml(value).replace(/\n/g, "<br />");
}

function buildEmailHtml(builder: BuilderState) {
    const buttonBlock =
        builder.buttonLabel.trim() && builder.buttonUrl.trim()
            ? `<tr><td style="padding:0 32px 28px;"><a href="${escapeHtml(
                builder.buttonUrl
            )}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:${escapeHtml(
                builder.buttonColor
            )};color:#0b1226;font-weight:700;text-decoration:none;">${escapeHtml(
                builder.buttonLabel
            )}</a></td></tr>`
            : "";

    const imageBlock = builder.imageUrl.trim()
        ? `<tr><td style="padding:32px 32px 0;"><img src="${escapeHtml(
            builder.imageUrl
        )}" alt="${escapeHtml(
            builder.imageAlt
        )}" style="display:block;width:100%;max-width:576px;height:auto;border-radius:20px;border:0;" /></td></tr>`
        : "";

    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(builder.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:${escapeHtml(
        builder.backgroundColor
    )};font-family:Arial,Helvetica,sans-serif;color:${escapeHtml(builder.textColor)};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        builder.preheader
    )}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${escapeHtml(
        builder.backgroundColor
    )};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:${escapeHtml(
        builder.cardColor
    )};border:1px solid rgba(224,197,143,.18);border-radius:28px;overflow:hidden;">
            ${imageBlock}
            <tr><td style="padding:32px 32px 12px;font-size:14px;line-height:1.5;color:${escapeHtml(
        builder.accentColor
    )};">${textToHtml(builder.preheader)}</td></tr>
            <tr><td style="padding:0 32px 12px;font-size:32px;line-height:1.2;font-weight:800;color:${escapeHtml(
        builder.textColor
    )};">${textToHtml(builder.title)}</td></tr>
            <tr><td style="padding:0 32px 14px;font-size:18px;line-height:1.6;color:${escapeHtml(
        builder.textColor
    )};">${textToHtml(builder.intro)}</td></tr>
            <tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.75;color:${escapeHtml(
        builder.textColor
    )};">${textToHtml(builder.body)}</td></tr>
            ${buttonBlock}
            <tr><td style="padding:0 32px 32px;font-size:13px;line-height:1.6;color:rgba(245,240,233,.72);border-top:1px solid rgba(224,197,143,.12);">${textToHtml(
        builder.footer
    )}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paginationButtonStyle(disabled: boolean): CSSProperties {
    return {
        borderRadius: 12,
        padding: "8px 12px",
        border: "1px solid rgba(224,197,143,.16)",
        background: disabled ? "rgba(255,255,255,.04)" : "rgba(120,230,255,.10)",
        color: disabled ? "rgba(245,240,233,.40)" : "rgba(245,240,233,.92)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
    };
}

function actionButtonStyle(disabled: boolean, background: string, border: string): CSSProperties {
    return {
        borderRadius: 14,
        padding: "10px 14px",
        border,
        background: disabled ? "rgba(255,255,255,.04)" : background,
        color: disabled ? "rgba(245,240,233,.40)" : "rgba(245,240,233,.92)",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
    };
}

const editorInputStyle: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(224,197,143,.14)",
    background: "rgba(10,18,38,.28)",
    color: "rgba(245,240,233,.92)",
    outline: "none",
};

function buildEmailText(builder: BuilderState) {
    return [
        builder.title,
        "",
        builder.intro,
        "",
        builder.body,
        builder.buttonLabel && builder.buttonUrl
            ? `Ссылка: ${builder.buttonLabel} — ${builder.buttonUrl}`
            : "",
        "",
        builder.footer,
    ]
        .filter(Boolean)
        .join("\n");
}

function formatBirthDateForInput(value?: string | null) {
    if (!value) return "";

    const trimmed = value.trim();

    // Уже в формате dd.mm.yyyy
    const ddmmyyyyMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (ddmmyyyyMatch) return trimmed;

    // ISO yyyy-mm-dd
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day}.${month}.${year}`;
    }

    // ISO datetime
    const isoDateTimeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (isoDateTimeMatch) {
        const [, year, month, day] = isoDateTimeMatch;
        return `${day}.${month}.${year}`;
    }

    return trimmed;
}

function normalizeBirthDateInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!match) {
        throw new Error("Дата рождения должна быть в формате ДД.ММ.ГГГГ");
    }

    const [, dayStr, monthStr, yearStr] = match;
    const day = Number(dayStr);
    const month = Number(monthStr);
    const year = Number(yearStr);

    const date = new Date(year, month - 1, day);

    const isValid =
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day;

    if (!isValid) {
        throw new Error("Дата рождения введена некорректно.");
    }

    return `${yearStr}-${monthStr}-${dayStr}`;
}

export default function AdminPage() {
    const { startLoading } = useCabinetLoading();
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [tab, setTab] = useState<"users" | "orders" | "calcs" | "support" | "mail">("users");
    const [q, setQ] = useState("");

    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorSaving, setEditorSaving] = useState(false);
    const [editorResetting, setEditorResetting] = useState(false);
    const [editorMessage, setEditorMessage] = useState<string | null>(null);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [editorState, setEditorState] = useState<UserEditorState | null>(null);
    const [editorSelectedCalcId, setEditorSelectedCalcId] = useState<string>("");
    const [editorCalculations, setEditorCalculations] = useState<EditorCalculationOption[]>([]);
    const [editorCalculationsLoading, setEditorCalculationsLoading] = useState(false);
    const [editorCalcSending, setEditorCalcSending] = useState(false);
    const [usersPagination, setUsersPagination] = useState<UsersPagination>({
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 1,
    });
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [calcs, setCalcs] = useState<CalculationRow[]>([]);
    const [adminId, setAdminId] = useState<string | null>(null);

    const [threads, setThreads] = useState<SupportThreadRow[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [messages, setMessages] = useState<SupportMsgRow[]>([]);
    const [supportText, setSupportText] = useState("");
    const [supportSending, setSupportSending] = useState(false);
    const [supportFile, setSupportFile] = useState<File | null>(null);
    const [supportErr, setSupportErr] = useState<string | null>(null);
    const [supportLoading, setSupportLoading] = useState(false);
    const [supportInitialized, setSupportInitialized] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaignRow[]>([]);
    const [emailSegments, setEmailSegments] = useState<EmailSegmentCounts>({
        admins_test: 0,
        paid: 0,
        no_paid: 0,
        calculations: 0,
        inactive_30d: 0,
        manual_list: 0,
        zodiac_aries: 0,
        zodiac_taurus: 0,
        zodiac_gemini: 0,
        zodiac_cancer: 0,
        zodiac_leo: 0,
        zodiac_virgo: 0,
        zodiac_libra: 0,
        zodiac_scorpio: 0,
        zodiac_sagittarius: 0,
        zodiac_capricorn: 0,
        zodiac_aquarius: 0,
        zodiac_pisces: 0,
        all: 0,
    });

    const [selectedSegment, setSelectedSegment] = useState<SegmentKey>("admins_test");
    const [mailSubject, setMailSubject] = useState("");
    const [mailHtml, setMailHtml] = useState("");
    const [mailText, setMailText] = useState("");
    const [mailSending, setMailSending] = useState(false);
    const [mailResult, setMailResult] = useState<string | null>(null);
    const [manualRecipientsInput, setManualRecipientsInput] = useState("");
    const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
        total_revenue_cents: 0,
        total_paid_orders: 0,
        average_check_cents: 0,
        total_related_profiles: 0,
        total_marketing_contacts: 0,
        email_opened: 0,
        email_delivered: 0,
        email_failed: 0,
    });
    const [builderState, setBuilderState] = useState<BuilderState>(DEFAULT_BUILDER_STATE);
    const [builderMode, setBuilderMode] = useState<"builder" | "html">("builder");
    const [builderImageName, setBuilderImageName] = useState<string | null>(null);

    const previewHtml = useMemo(() => buildEmailHtml(builderState), [builderState]);
    const previewText = useMemo(() => buildEmailText(builderState), [builderState]);
    const userSearch = useMemo(() => q.trim(), [q]);

    const filteredOrders = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return orders;

        return orders.filter(
            (o) =>
                o.id.toLowerCase().includes(s) ||
                o.user_id.toLowerCase().includes(s) ||
                (o.user_email || "").toLowerCase().includes(s) ||
                (o.provider_order_id || "").toLowerCase().includes(s) ||
                (o.provider || "").toLowerCase().includes(s) ||
                (o.status || "").toLowerCase().includes(s)
        );
    }, [orders, q]);

    const filteredCalcs = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return calcs;
        return calcs.filter(
            (c) =>
                c.id.toLowerCase().includes(s) ||
                c.user_id.toLowerCase().includes(s) ||
                String(c.calc_type || "").toLowerCase().includes(s) ||
                (c.status || "").toLowerCase().includes(s)
        );
    }, [calcs, q]);

    const filteredThreads = useMemo(() => {
        const s = q.trim().toLowerCase();

        const base = !s
            ? threads
            : threads.filter(
                (t) =>
                    t.id.toLowerCase().includes(s) ||
                    t.user_id.toLowerCase().includes(s) ||
                    (t.subject || "").toLowerCase().includes(s) ||
                    (t.category || "").toLowerCase().includes(s) ||
                    (t.status || "").toLowerCase().includes(s)
            );

        return [...base].sort((a, b) => {
            const aClosed = a.status === "closed";
            const bClosed = b.status === "closed";

            if (aClosed !== bClosed) {
                return aClosed ? 1 : -1;
            }

            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;

            return bTime - aTime;
        });
    }, [threads, q]);

    const activeThread = useMemo(
        () => threads.find((t) => t.id === activeThreadId) ?? null,
        [threads, activeThreadId]
    );
    const editorAvailableCalcs = useMemo(
        () =>
            [...editorCalculations].sort((a, b) => {
                const aSaved = a.source === "saved";
                const bSaved = b.source === "saved";

                if (aSaved !== bSaved) {
                    return aSaved ? -1 : 1;
                }

                const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
                const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
                return bTime - aTime;
            }),
        [editorCalculations]
    );

    function scrollToBottom() {
        requestAnimationFrame(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        });
    }
    async function closeThread() {
        if (!activeThreadId) return;

        setSupportSending(true);
        setSupportErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch("/api/admin/support/close", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    thread_id: activeThreadId,
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                setSupportErr(json?.error || "Не удалось закрыть обращение.");
                return;
            }

            await loadSupportMessages(activeThreadId);
            await loadSupportThreads();
        } finally {
            setSupportSending(false);
        }
    }
    function syncBuilderToMessage(nextState: BuilderState) {
        setBuilderState(nextState);
        if (builderMode === "builder") {
            setMailHtml(buildEmailHtml(nextState));
            setMailText(buildEmailText(nextState));
        }
    }

    function updateBuilder<K extends keyof BuilderState>(key: K, value: BuilderState[K]) {
        syncBuilderToMessage({ ...builderState, [key]: value });
    }

    async function handleImageUpload(file: File | null) {
        if (!file) return;

        const reader = new FileReader();
        const result = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(reader.error || new Error("Не удалось прочитать картинку."));
            reader.readAsDataURL(file);
        });

        const nextState = {
            ...builderState,
            imageUrl: result,
            imageAlt: builderState.imageAlt.trim() ? builderState.imageAlt : file.name,
        };

        setBuilderImageName(file.name);
        syncBuilderToMessage(nextState);
    }

    function loadBuilderPreset() {
        const preset = { ...DEFAULT_BUILDER_STATE, title: mailSubject || DEFAULT_BUILDER_STATE.title };
        setBuilderMode("builder");
        syncBuilderToMessage(preset);
        if (!mailSubject.trim()) setMailSubject(preset.title);
    }

    async function loadUsers(page = 1, search = userSearch) {
        setUsersLoading(true);
        setErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(usersPagination.pageSize),
            });

            if (search) params.set("q", search);

            const res = await fetch(`/api/admin/users?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                if (res.status === 403) {
                    window.location.href = "/cabinet";
                    return;
                }
                throw new Error(json?.error || "Не удалось загрузить пользователей.");
            }

            setProfiles(Array.isArray(json.profiles) ? json.profiles : []);
            setUsersPagination((prev) => ({
                page: Number(json.pagination?.page) || page,
                pageSize: Number(json.pagination?.pageSize) || prev.pageSize,
                total: Number(json.pagination?.total) || 0,
                totalPages: Math.max(Number(json.pagination?.totalPages) || 1, 1),
            }));
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Не удалось загрузить пользователей.");
        } finally {
            setUsersLoading(false);
        }
    }

    async function loadUserCalculations(userId: string) {
        setEditorCalculationsLoading(true);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`/api/admin/user-calculations?userId=${encodeURIComponent(userId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Не удалось загрузить расчёты пользователя.");
            }

            const savedCalculations = Array.isArray(json.savedCalculations) ? (json.savedCalculations as SavedCalculationOption[]) : [];
            const queuedForecasts = Array.isArray(json.queueCalculations)
                ? (json.queueCalculations as Array<{ id: string; kind: string; status: string | null; updated_at: string | null }>).map((calc) => ({
                      id: calc.id,
                      source: "queue" as const,
                      kind: calc.kind,
                      target_date: null,
                      updated_at: calc.updated_at,
                      status: calc.status,
                  }))
                : [];

            const mergedCalculations = [
                ...savedCalculations.map((calc) => ({
                    id: calc.id,
                    source: "saved" as const,
                    kind: calc.kind,
                    target_date: calc.target_date,
                    updated_at: calc.updated_at,
                    status: null,
                })),
                ...queuedForecasts.filter((queueCalc) => !savedCalculations.some((savedCalc) => savedCalc.kind === queueCalc.kind)),
            ];

            setEditorCalculations(mergedCalculations);
            setEditorSelectedCalcId(mergedCalculations[0]?.id || "");
        } catch (e) {
            setEditorCalculations([]);
            setEditorSelectedCalcId("");
            setEditorError(e instanceof Error ? e.message : "Не удалось загрузить расчёты пользователя.");
        } finally {
            setEditorCalculationsLoading(false);
        }
    }

    function openUserEditor(profile: ProfileRow) {
        setEditorError(null);
        setEditorMessage(null);
        setEditorCalculations([]);
        setEditorSelectedCalcId("");
        setEditorState({
            id: profile.id,
            email: profile.email || "",
            full_name: profile.full_name || "",
            birth_date: formatBirthDateForInput(profile.birth_date),
            birth_time: profile.birth_time || "",
            birth_city: profile.birth_city || "",
        });
        setEditorOpen(true);
        void loadUserCalculations(profile.id);
    }


    function closeUserEditor() {
        if (editorSaving || editorResetting || editorCalcSending) return;
        setEditorOpen(false);
        setEditorError(null);
        setEditorMessage(null);
        setEditorState(null);
        setEditorSelectedCalcId("");
        setEditorCalculations([]);
    }

    async function saveUserEditor() {
        if (!editorState) return;

        setEditorSaving(true);
        setEditorError(null);
        setEditorMessage(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const normalizedBirthDate = editorState.birth_date.trim()
                ? normalizeBirthDateInput(editorState.birth_date)
                : null;

            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    userId: editorState.id,
                    email: editorState.email,
                    full_name: editorState.full_name,
                    birth_date: normalizedBirthDate,
                    birth_time: editorState.birth_time.trim() || null,
                    birth_city: editorState.birth_city.trim() || null,
                }),
            });

            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Не удалось сохранить пользователя.");
            }

            const profile = json.profile as ProfileRow;

            setProfiles((prev) => prev.map((item) => (item.id === profile.id ? profile : item)));

            setEditorState({
                id: profile.id,
                email: profile.email || "",
                full_name: profile.full_name || "",
                birth_date: formatBirthDateForInput(profile.birth_date),
                birth_time: profile.birth_time || "",
                birth_city: profile.birth_city || "",
            });

            setEditorMessage("Изменения сохранены.");
        } catch (e) {
            setEditorError(e instanceof Error ? e.message : "Не удалось сохранить пользователя.");
        } finally {
            setEditorSaving(false);
        }
    }

    async function sendSelectedCalculation() {
        if (!editorState || !editorSelectedCalcId) return;

        setEditorCalcSending(true);
        setEditorError(null);
        setEditorMessage(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const selectedCalc = editorAvailableCalcs.find((calc) => calc.id === editorSelectedCalcId) ?? null;
            if (!selectedCalc) {
                throw new Error("Выбери прогноз для отправки.");
            }

            if (selectedCalc.source === "saved") {
                const res = await fetch("/api/admin/user-calculations", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        userId: editorState.id,
                        calcId: editorSelectedCalcId,
                    }),
                });

                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || "Не удалось отправить расчёт клиенту.");
                }

                setEditorMessage(json?.message || "Расчёт отправлен клиенту на email.");
            } else {
                const res = await fetch("/api/admin/restart-calc", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        calc_id: editorSelectedCalcId,
                    }),
                });

                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || "Не удалось поставить прогноз в очередь.");
                }

                setEditorMessage("Сохранённого прогноза не нашли, поэтому поставили существующий расчёт в очередь на бесплатную повторную отправку.");
                setCalcs((prev) => prev.map((calc) => (calc.id === editorSelectedCalcId ? { ...calc, status: "queued" } : calc)));
                setEditorCalculations((prev) =>
                    prev.map((calc) => (calc.id === editorSelectedCalcId && calc.source === "queue" ? { ...calc, status: "queued" } : calc))
                );
            }
        } catch (e) {
            setEditorError(e instanceof Error ? e.message : "Не удалось отправить расчёт клиенту.");
        } finally {
            setEditorCalcSending(false);
        }
    }

    async function sendPasswordReset() {
        if (!editorState) return;

        setEditorResetting(true);
        setEditorError(null);
        setEditorMessage(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action: "send_password_reset",
                    userId: editorState.id,
                    email: editorState.email,
                }),
            });

            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Не удалось отправить письмо для сброса пароля.");
            }

            setEditorMessage(json.message || "Письмо для сброса пароля отправлено.");
        } catch (e) {
            setEditorError(e instanceof Error ? e.message : "Не удалось отправить письмо для сброса пароля.");
        } finally {
            setEditorResetting(false);
        }
    }

    async function loadSummary() {
        const doneLoading = startLoading({ message: "Загрузка админ-панели" });
        setLoading(true);
        setErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) {
                setErr(userError.message);
                setLoading(false);
                return;
            }

            setAdminId(userData.user?.id ?? null);

            const res = await fetch("/api/admin/summary", {
                headers: { Authorization: `Bearer ${token}` },
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                if (res.status === 403) {
                    window.location.href = "/cabinet";
                    return;
                }
                setErr(json?.error || "Нет доступа (нужен админ).");
                setLoading(false);
                return;
            }

            setOrders(Array.isArray(json.orders) ? json.orders : []);
            setCalcs(Array.isArray(json.calculations) ? json.calculations : []);
            setEmailCampaigns(Array.isArray(json.email_campaigns) ? json.email_campaigns : []);
            setEmailSegments(
                json.email_segments || {
                    admins_test: 0,
                    paid: 0,
                    no_paid: 0,
                    calculations: 0,
                    inactive_30d: 0,
                    manual_list: 0,
                    zodiac_aries: 0,
                    zodiac_taurus: 0,
                    zodiac_gemini: 0,
                    zodiac_cancer: 0,
                    zodiac_leo: 0,
                    zodiac_virgo: 0,
                    zodiac_libra: 0,
                    zodiac_scorpio: 0,
                    zodiac_sagittarius: 0,
                    zodiac_capricorn: 0,
                    zodiac_aquarius: 0,
                    zodiac_pisces: 0,
                    all: 0,
                }
            );
            setDashboardStats(json.dashboard_stats || {
                total_revenue_cents: 0,
                total_paid_orders: 0,
                average_check_cents: 0,
                total_related_profiles: 0,
                total_marketing_contacts: 0,
                email_opened: 0,
                email_delivered: 0,
                email_failed: 0,
            });
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Не удалось загрузить админку.");
        } finally {
            setLoading(false);
            doneLoading();
        }
    }

    async function loadSupportThreads() {
        setSupportLoading(true);
        setSupportErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch("/api/admin/support", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Не удалось загрузить обращения.");
            }

            const list = ((json.threads ?? []) as SupportThreadRow[]).sort((a, b) => {
                const aClosed = a.status === "closed";
                const bClosed = b.status === "closed";

                if (aClosed !== bClosed) {
                    return aClosed ? 1 : -1; // closed вниз
                }

                const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;

                return bTime - aTime; // свежие выше
            });

            setThreads(list);

            if ((!activeThreadId || !list.some((x) => x.id === activeThreadId)) && list[0]) {
                setActiveThreadId(list[0].id);
            }
        } catch (e) {
            setSupportErr(e instanceof Error ? e.message : "Не удалось загрузить обращения.");
        } finally {
            setSupportLoading(false);
            setSupportInitialized(true);
        }
    }

    async function loadSupportMessages(threadId: string) {
        setSupportErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`/api/admin/support?thread_id=${encodeURIComponent(threadId)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                throw new Error(json?.error || "Не удалось загрузить сообщения поддержки.");
            }

            setMessages((json.messages ?? []) as SupportMsgRow[]);
            setTimeout(scrollToBottom, 50);
        } catch (e) {
            setSupportErr(e instanceof Error ? e.message : "Не удалось загрузить сообщения поддержки.");
        }
    }

    useEffect(() => {
        void loadSummary();
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            void loadUsers(1, userSearch);
        }, 300);

        return () => window.clearTimeout(timeoutId);
    }, [userSearch]);

    useEffect(() => {
        if (!mailSubject.trim() && builderState.title.trim()) {
            setMailSubject(builderState.title);
        }
        if (!mailHtml.trim() && !mailText.trim()) {
            setMailHtml(buildEmailHtml(builderState));
            setMailText(buildEmailText(builderState));
        }
    }, []);

    useEffect(() => {
        if (tab === "support" && !supportInitialized && !supportLoading) {
            void loadSupportThreads();
        }
    }, [tab, supportInitialized, supportLoading]);

    useEffect(() => {
        if (tab !== "support" || !activeThreadId) return;
        void loadSupportMessages(activeThreadId);
    }, [tab, activeThreadId]);

    useEffect(() => {
        if (tab !== "support" || !activeThreadId || supportErr) return;

        const channel = supabase
            .channel(`admin_support_messages_${activeThreadId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "support_messages",
                    filter: `thread_id=eq.${activeThreadId}`,
                },
                (payload) => {
                    const message = payload.new as SupportMsgRow;
                    setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
                    void loadSupportThreads();
                    setTimeout(scrollToBottom, 20);
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [tab, activeThreadId, supportErr]);

    async function restartCalc(calcId: string) {
        setErr(null);

        const token = await getAccessToken();
        if (!token) {
            window.location.href = "/login";
            return;
        }

        const res = await fetch("/api/admin/restart-calc", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ calc_id: calcId }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
            setErr(json?.error || "Не удалось перезапустить.");
            return;
        }

        setCalcs((prev) => prev.map((c) => (c.id === calcId ? { ...c, status: "queued" } : c)));
    }

    async function notifyTelegram(params: { thread_id: string; message_id: string }) {
        const token = await getAccessToken();
        if (!token) return;

        try {
            await fetch("/api/support/telegram", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(params),
            });
        } catch {}
    }

    async function uploadAttachmentAsAdmin(file: File, threadId: string) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return null;

        const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
        const path = `${uid}/${threadId}/${Date.now()}_${safeName}`;

        const { error } = await supabase.storage.from("support_attachments").upload(path, file, {
            upsert: false,
            contentType: file.type || "application/octet-stream",
        });

        if (error) {
            setSupportErr(error.message);
            return null;
        }

        const { data } = supabase.storage.from("support_attachments").getPublicUrl(path);
        return data.publicUrl ?? null;
    }

    async function sendAdminMessage() {
        if (!activeThreadId) return;

        const body = supportText.trim();
        if (!body && !supportFile) return;

        setSupportSending(true);
        setSupportErr(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            let attachmentUrl: string | null = null;
            if (supportFile) {
                attachmentUrl = await uploadAttachmentAsAdmin(supportFile, activeThreadId);
                if (!attachmentUrl) return;
            }

            const res = await fetch("/api/admin/support/reply", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    thread_id: activeThreadId,
                    message: body,
                    attachment_url: attachmentUrl,
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                setSupportErr(json?.error || "Не удалось отправить сообщение.");
                return;
            }



            setSupportText("");
            setSupportFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";

            await loadSupportMessages(activeThreadId);
            await loadSupportThreads();
            setTimeout(scrollToBottom, 10);
        } finally {
            setSupportSending(false);
        }
    }

    async function sendEmailCampaign() {
        setErr(null);
        setMailResult(null);
        setMailSending(true);

        try {
            if (selectedSegment === "all") {
                const confirmed = window.confirm(
                    'Вы точно хотите отправить письмо всем пользователям? Это затронет весь сегмент "Вся база".'
                );
                if (!confirmed) return;
            }

            const token = await getAccessToken();
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch("/api/admin/email-campaigns", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    segment_key: selectedSegment,
                    subject: mailSubject,
                    html: mailHtml,
                    text: mailText,
                    test_mode: false,
                    manual_emails: manualRecipientsInput
                        .split(/[,\n; ]+/)
                        .map((item) => item.trim().toLowerCase())
                        .filter(Boolean),
                }),
            });

            const json = await res.json().catch(() => null);

            if (!res.ok || !json?.ok) {
                setErr(json?.error || "Не удалось отправить рассылку.");
                return;
            }

            const warning = json?.warning ? ` Внимание: ${json.warning}` : "";

            if (selectedSegment === "admins_test") {
                setMailResult(
                    `Письмо отправлено по списку администраторов: ${json.sent_count}/${json.recipients_count}, ошибок — ${json.failed_count}.${warning}`
                );
            } else {
                setMailResult(
                    `Готово: ${json.sent_count}/${json.recipients_count} писем отправлено, ошибок — ${json.failed_count}.${warning}`
                );
            }

            await loadSummary();
            setTab("mail");
        } finally {
            setMailSending(false);
        }
    }

    if (loading) {
        return (
            <div
                style={{
                    padding: 18,
                    borderRadius: 18,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                Загрузка админ-панели…
            </div>
        );
    }

    return (
        <div style={{ display: "grid", gap: 14 }}>
            <div
                style={{
                    padding: 18,
                    borderRadius: 22,
                    border: "1px solid rgba(224,197,143,.14)",
                    background: "rgba(17,34,80,.16)",
                }}
            >
                <div style={{ fontSize: 24, fontWeight: 950 }}>Админ-панель</div>
                <div style={{ marginTop: 6, color: "rgba(245,240,233,.75)" }}>
                    Пользователи, покупки, расчёты, поддержка и email-рассылки по базе или сегментам.
                </div>

                <div
                    style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        alignItems: "center",
                    }}
                >
                    <TabButton active={tab === "users"} onClick={() => setTab("users")}>
                        Пользователи
                    </TabButton>
                    <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
                        Покупки
                    </TabButton>
                    <TabButton active={tab === "calcs"} onClick={() => setTab("calcs")}>
                        Прогнозы
                    </TabButton>
                    <TabButton active={tab === "support"} onClick={() => setTab("support")}>
                        Поддержка
                    </TabButton>
                    <TabButton active={tab === "mail"} onClick={() => setTab("mail")}>
                        Почта
                    </TabButton>

                    <div style={{ flex: 1 }} />

                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={
                            tab === "support"
                                ? "Поиск"
                                : tab === "orders"
                                    ? "Поиск (email)"
                                    : "Поиск (email)"
                        }
                        style={{
                            width: "min(520px, 100%)",
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "rgba(10,18,38,.28)",
                            color: "rgba(245,240,233,.92)",
                            outline: "none",
                        }}
                    />

                    <button
                        onClick={() => {
                            if (tab === "support") {
                                void loadSupportThreads();
                            } else if (tab === "users") {
                                void loadUsers(usersPagination.page, userSearch);
                            } else {
                                void loadSummary();
                            }
                        }}
                        style={{
                            borderRadius: 14,
                            padding: "10px 12px",
                            border: "1px solid rgba(224,197,143,.18)",
                            background: "rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.92)",
                            fontWeight: 950,
                            cursor: "pointer",
                        }}
                    >
                        Обновить
                    </button>
                </div>
            </div>

            {err && (
                <div
                    style={{
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid rgba(255,110,90,.22)",
                        background: "rgba(255,110,90,.06)",
                    }}
                >
                    <div style={{ fontWeight: 900 }}>Ошибка</div>
                    <div style={{ marginTop: 6, color: "rgba(245,240,233,.80)" }}>{err}</div>
                </div>
            )}

            {mailResult && (
                <div
                    style={{
                        padding: 16,
                        borderRadius: 18,
                        border: "1px solid rgba(120,230,255,.24)",
                        background: "rgba(120,230,255,.08)",
                        color: "rgba(245,240,233,.92)",
                    }}
                >
                    {mailResult}
                </div>
            )}

            {tab === "users" && (
                <Card title={`Пользователи (${usersPagination.total})`}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "180px 1fr 220px 160px",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 14,
                            background: "rgba(10,18,38,.22)",
                            border: "1px solid rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.70)",
                            fontSize: 12,
                            fontWeight: 950,
                        }}
                    >
                        <div>User ID</div>
                        <div>Email / Имя</div>
                        <div>Обновлён</div>
                        <div>Действия</div>
                    </div>

                    {profiles.map((p) => (
                        <GridRow key={p.id} cols="180px 1fr 220px 160px">
                            <Mono>{p.id.slice(0, 8)}…</Mono>
                            <div>
                                <div style={{ fontWeight: 900 }}>{p.email || "—"}</div>
                                <div style={{ opacity: 0.75, fontSize: 12 }}>{p.full_name || ""}</div>
                            </div>
                            <div style={{ opacity: 0.75, fontSize: 12 }}>
                                {p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}
                            </div>
                            <div>
                                <button
                                    onClick={() => openUserEditor(p)}
                                    style={{
                                        borderRadius: 12,
                                        padding: "8px 10px",
                                        border: "1px solid rgba(224,197,143,.18)",
                                        background: "rgba(224,197,143,.10)",
                                        color: "rgba(245,240,233,.92)",
                                        fontWeight: 900,
                                        cursor: "pointer",
                                    }}
                                >
                                    Редактировать
                                </button>
                            </div>
                        </GridRow>
                    ))}

                    {!usersLoading && !profiles.length && (
                        <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                            Пользователи по этому фильтру не найдены.
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            marginTop: 14,
                            flexWrap: "wrap",
                        }}
                    >
                        <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13 }}>
                            {usersLoading
                                ? "Загружаем пользователей…"
                                : `Страница ${usersPagination.page} из ${usersPagination.totalPages} · всего ${usersPagination.total}`}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                                onClick={() => void loadUsers(1, userSearch)}
                                disabled={usersLoading || usersPagination.page <= 1}
                                style={paginationButtonStyle(usersLoading || usersPagination.page <= 1)}
                            >
                                « Первая
                            </button>
                            <button
                                onClick={() => void loadUsers(usersPagination.page - 1, userSearch)}
                                disabled={usersLoading || usersPagination.page <= 1}
                                style={paginationButtonStyle(usersLoading || usersPagination.page <= 1)}
                            >
                                ‹ Назад
                            </button>
                            <button
                                onClick={() => void loadUsers(usersPagination.page + 1, userSearch)}
                                disabled={usersLoading || usersPagination.page >= usersPagination.totalPages}
                                style={paginationButtonStyle(usersLoading || usersPagination.page >= usersPagination.totalPages)}
                            >
                                Вперёд ›
                            </button>
                            <button
                                onClick={() => void loadUsers(usersPagination.totalPages, userSearch)}
                                disabled={usersLoading || usersPagination.page >= usersPagination.totalPages}
                                style={paginationButtonStyle(usersLoading || usersPagination.page >= usersPagination.totalPages)}
                            >
                                Последняя »
                            </button>
                        </div>
                    </div>
                </Card>
            )}

            {editorOpen && editorState && (
                <div
                    onClick={closeUserEditor}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(6,10,20,.72)",
                        display: "grid",
                        placeItems: "center",
                        padding: 20,
                        zIndex: 60,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(680px, 100%)",
                            borderRadius: 24,
                            border: "1px solid rgba(224,197,143,.14)",
                            background: "linear-gradient(180deg, rgba(17,26,53,.98), rgba(10,16,34,.98))",
                            padding: 20,
                            boxShadow: "0 24px 80px rgba(0,0,0,.45)",
                            display: "grid",
                            gap: 14,
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                            <div>
                                <div style={{ fontSize: 24, fontWeight: 900 }}>Редактор пользователя</div>
                                <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{editorState.id}</div>
                            </div>
                            <button
                                onClick={closeUserEditor}
                                disabled={editorSaving || editorResetting || editorCalcSending}
                                style={paginationButtonStyle(editorSaving || editorResetting || editorCalcSending)}
                            >
                                Закрыть
                            </button>
                        </div>

                        {editorError && (
                            <div style={{ padding: 12, borderRadius: 16, background: "rgba(255,110,90,.08)", border: "1px solid rgba(255,110,90,.22)" }}>
                                {editorError}
                            </div>
                        )}

                        {editorMessage && (
                            <div style={{ padding: 12, borderRadius: 16, background: "rgba(120,230,255,.08)", border: "1px solid rgba(120,230,255,.22)" }}>
                                {editorMessage}
                            </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Email</span>
                                <input
                                    value={editorState.email}
                                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, email: e.target.value } : prev))}
                                    style={editorInputStyle}
                                />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Имя</span>
                                <input
                                    value={editorState.full_name}
                                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, full_name: e.target.value } : prev))}
                                    style={editorInputStyle}
                                />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Дата рождения</span>
                                <input
                                    value={editorState.birth_date}
                                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, birth_date: e.target.value } : prev))}
                                    placeholder="ДД.ММ.ГГГГ"
                                    inputMode="numeric"
                                    style={editorInputStyle}
                                />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                                <span style={{ fontSize: 12, opacity: 0.75 }}>Время рождения</span>
                                <input
                                    value={editorState.birth_time}
                                    onChange={(e) => setEditorState((prev) => (prev ? { ...prev, birth_time: e.target.value } : prev))}
                                    placeholder="HH:MM"
                                    style={editorInputStyle}
                                />
                            </label>
                        </div>

                        <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ fontSize: 12, opacity: 0.75 }}>Город рождения</span>
                            <input
                                value={editorState.birth_city}
                                onChange={(e) => setEditorState((prev) => (prev ? { ...prev, birth_city: e.target.value } : prev))}
                                style={editorInputStyle}
                            />
                        </label>

                        <div
                            style={{
                                display: "grid",
                                gap: 10,
                                padding: 14,
                                borderRadius: 16,
                                border: "1px solid rgba(224,197,143,.14)",
                                background: "rgba(10,18,38,.22)",
                            }}
                        >
                            <div style={{ fontWeight: 900 }}>Отправить готовый расчёт клиенту</div>
                            <div style={{ fontSize: 12, opacity: 0.75 }}>
                                Сначала показываем уже сохранённые прогнозы для бесплатной мгновенной отправки. Если сохранённого прогноза нет, можно выбрать существующий расчёт и поставить его в очередь на повторную бесплатную отправку.
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                                <select
                                    value={editorSelectedCalcId}
                                    onChange={(e) => setEditorSelectedCalcId(e.target.value)}
                                    disabled={editorCalcSending || editorCalculationsLoading || !editorAvailableCalcs.length}
                                    style={editorInputStyle}
                                >
                                    {!editorAvailableCalcs.length ? (
                                        <option value="">
                                            {editorCalculationsLoading ? "Загружаем прогнозы..." : "Нет доступных прогнозов"}
                                        </option>
                                    ) : (
                                        editorAvailableCalcs.map((calc) => (
                                            <option key={calc.id} value={calc.id}>
                                                {getCalculationLabel(String(calc.kind || ""))}
                                                {calc.source === "saved" ? " • сохранён" : " • из очереди"}
                                                {calc.target_date ? ` • ${calc.target_date}` : ""}
                                                {calc.updated_at ? ` • ${new Date(calc.updated_at).toLocaleDateString("ru-RU")}` : ""}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <button
                                    onClick={() => void sendSelectedCalculation()}
                                    disabled={!editorSelectedCalcId || editorCalcSending}
                                    style={actionButtonStyle(
                                        !editorSelectedCalcId || editorCalcSending,
                                        "rgba(147,197,114,.12)",
                                        "1px solid rgba(147,197,114,.24)"
                                    )}
                                >
                                    {editorCalcSending ? "Отправляем..." : "Отправить расчёт"}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
                            <button
                                onClick={() => void sendPasswordReset()}
                                disabled={editorSaving || editorResetting || editorCalcSending}
                                style={actionButtonStyle(editorSaving || editorResetting || editorCalcSending, "rgba(120,230,255,.10)", "1px solid rgba(120,230,255,.22)")}
                            >
                                {editorResetting ? "Отправляем..." : "Сбросить пароль"}
                            </button>

                            <button
                                onClick={() => void saveUserEditor()}
                                disabled={editorSaving || editorResetting || editorCalcSending}
                                style={actionButtonStyle(editorSaving || editorResetting || editorCalcSending, "rgba(224,197,143,.10)", "1px solid rgba(224,197,143,.22)")}
                            >
                                {editorSaving ? "Сохраняем..." : "Сохранить изменения"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {tab === "orders" && (
                <Card title={`Покупки (${filteredOrders.length})`}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "160px 220px 120px 140px 1fr",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 14,
                            background: "rgba(10,18,38,.22)",
                            border: "1px solid rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.70)",
                            fontSize: 12,
                            fontWeight: 950,
                        }}
                    >
                        <div>Order</div>
                        <div>Email / User</div>
                        <div>Status</div>
                        <div>Amount</div>
                        <div>Provider / Meta</div>
                    </div>

                    {filteredOrders.slice(0, 250).map((o) => (
                        <GridRow key={o.id} cols="160px 220px 120px 140px 1fr">
                            <Mono>{o.id.slice(0, 8)}…</Mono>

                            <div>
                                <div style={{ fontWeight: 900 }}>{o.user_email || "—"}</div>
                                <div style={{ opacity: 0.7, fontSize: 12 }}>{o.user_id.slice(0, 8)}…</div>
                            </div>

                            <Badge>{o.status || "—"}</Badge>

                            <div style={{ fontWeight: 900 }}>
                                {o.amount_cents != null ? `${(o.amount_cents / 100).toFixed(2)} ${o.currency || ""}` : "—"}
                            </div>

                            <div style={{ opacity: 0.8, fontSize: 12 }}>
                                {o.provider || "—"}
                                {o.provider_order_id ? ` · ${o.provider_order_id}` : ""}
                                {o.paid_at ? ` · paid ${new Date(o.paid_at).toLocaleString()}` : ""}
                            </div>
                        </GridRow>
                    ))}

                    {!filteredOrders.length && (
                        <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                            Покупок по этому фильтру не найдено.
                        </div>
                    )}
                </Card>
            )}

            {tab === "calcs" && (
                <Card title={`Прогнозы (${filteredCalcs.length})`}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "170px 170px 160px 140px 160px",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 14,
                            background: "rgba(10,18,38,.22)",
                            border: "1px solid rgba(224,197,143,.10)",
                            color: "rgba(245,240,233,.70)",
                            fontSize: 12,
                            fontWeight: 950,
                        }}
                    >
                        <div>Calc</div>
                        <div>User</div>
                        <div>Тип</div>
                        <div>Status</div>
                        <div>Action</div>
                    </div>

                    {filteredCalcs.slice(0, 250).map((c) => (
                        <GridRow key={c.id} cols="170px 170px 160px 140px 160px">
                            <Mono>{c.id.slice(0, 8)}…</Mono>
                            <Mono>{c.user_id.slice(0, 8)}…</Mono>
                            <Mono>{String(c.calc_type || "—")}</Mono>
                            <Badge>{c.status || "—"}</Badge>
                            <button
                                onClick={() => void restartCalc(c.id)}
                                style={{
                                    borderRadius: 12,
                                    padding: "8px 10px",
                                    border: "1px solid rgba(120,230,255,.22)",
                                    background: "rgba(120,230,255,.10)",
                                    color: "rgba(245,240,233,.92)",
                                    fontWeight: 950,
                                    cursor: "pointer",
                                }}
                            >
                                Перезапуск
                            </button>
                        </GridRow>
                    ))}
                </Card>
            )}

            {tab === "mail" && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(320px, 380px) 1fr",
                        gap: 14,
                    }}
                >
                    <Card title="Сегменты рассылки">
                        <div style={{ display: "grid", gap: 10 }}>
                            {SEGMENT_ORDER.map((segment) => {
                                const active = selectedSegment === segment;
                                return (
                                    <button
                                        key={segment}
                                        onClick={() => setSelectedSegment(segment)}
                                        style={{
                                            textAlign: "left",
                                            padding: 14,
                                            borderRadius: 16,
                                            border: active
                                                ? "1px solid rgba(224,197,143,.28)"
                                                : "1px solid rgba(224,197,143,.10)",
                                            background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)",
                                            color: "rgba(245,240,233,.92)",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <div style={{ fontWeight: 900 }}>{SEGMENT_LABELS[segment]}</div>
                                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.68)" }}>
                                            {SEGMENT_DESCRIPTIONS[segment]}
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.68)" }}>
                                            Получателей: {emailSegments[segment] ?? 0}
                                        </div>
                                        {segment === "all" && (
                                            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,208,120,.88)" }}>
                                                Перед отправкой появится дополнительное подтверждение.
                                            </div>
                                        )}
                                    </button>
                                );
                            })}




                        </div>
                    </Card>

                    <Card title="Новая рассылка">
                        <div style={{ display: "grid", gap: 12 }}>
                            <div style={{ fontSize: 13, color: "rgba(245,240,233,.74)" }}>
                                Сегмент: <strong>{SEGMENT_LABELS[selectedSegment]}</strong> · получателей:{" "}
                                <strong>{emailSegments[selectedSegment] ?? 0}</strong>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                                <div style={{ padding: 10, borderRadius: 10, background: "rgba(10,18,38,.25)", border: "1px solid rgba(224,197,143,.12)", fontSize: 12 }}>
                                    Выручка: <strong>{(dashboardStats.total_revenue_cents / 100).toLocaleString("ru-RU")} ₽</strong>
                                </div>
                                <div style={{ padding: 10, borderRadius: 10, background: "rgba(10,18,38,.25)", border: "1px solid rgba(224,197,143,.12)", fontSize: 12 }}>
                                    Оплачено заказов: <strong>{dashboardStats.total_paid_orders}</strong>
                                </div>
                                <div style={{ padding: 10, borderRadius: 10, background: "rgba(10,18,38,.25)", border: "1px solid rgba(224,197,143,.12)", fontSize: 12 }}>
                                    Средний чек: <strong>{(dashboardStats.average_check_cents / 100).toLocaleString("ru-RU")} ₽</strong>
                                </div>
                                <div style={{ padding: 10, borderRadius: 10, background: "rgba(10,18,38,.25)", border: "1px solid rgba(224,197,143,.12)", fontSize: 12 }}>
                                    Доп. анкеты: <strong>{dashboardStats.total_related_profiles}</strong>
                                </div>
                            </div>

                            {selectedSegment === "manual_list" && (
                                <textarea
                                    value={manualRecipientsInput}
                                    onChange={(e) => setManualRecipientsInput(e.target.value)}
                                    placeholder="email1@example.com, email2@example.com"
                                    style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                                />
                            )}

                            <input
                                value={mailSubject}
                                onChange={(e) => setMailSubject(e.target.value)}
                                placeholder="Тема письма"
                                style={inputStyle}
                            />

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                    type="button"
                                    onClick={() => setBuilderMode("builder")}
                                    style={builderMode === "builder" ? selectedModeButtonStyle : modeButtonStyle}
                                >
                                    Конструктор
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setBuilderMode("html");
                                        setMailHtml(previewHtml);
                                        setMailText(previewText);
                                    }}
                                    style={builderMode === "html" ? selectedModeButtonStyle : modeButtonStyle}
                                >
                                    HTML / текст
                                </button>

                                <button type="button" onClick={loadBuilderPreset} style={modeButtonStyle}>
                                    Сбросить шаблон
                                </button>
                            </div>

                            {builderMode === "builder" ? (
                                <div style={{ display: "grid", gap: 12 }}>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                            gap: 12,
                                        }}
                                    >
                                        <input
                                            value={builderState.preheader}
                                            onChange={(e) => updateBuilder("preheader", e.target.value)}
                                            placeholder="Прехедер"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={builderState.title}
                                            onChange={(e) => {
                                                updateBuilder("title", e.target.value);
                                                if (!mailSubject.trim()) setMailSubject(e.target.value);
                                            }}
                                            placeholder="Заголовок"
                                            style={inputStyle}
                                        />
                                    </div>

                                    <textarea
                                        value={builderState.intro}
                                        onChange={(e) => updateBuilder("intro", e.target.value)}
                                        placeholder="Вступление"
                                        style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                                    />

                                    <textarea
                                        value={builderState.body}
                                        onChange={(e) => updateBuilder("body", e.target.value)}
                                        placeholder="Основной текст письма"
                                        style={{ ...inputStyle, minHeight: 140, resize: "vertical" }}
                                    />

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                                            gap: 12,
                                        }}
                                    >
                                        <input
                                            value={builderState.buttonLabel}
                                            onChange={(e) => updateBuilder("buttonLabel", e.target.value)}
                                            placeholder="Текст кнопки"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={builderState.buttonUrl}
                                            onChange={(e) => updateBuilder("buttonUrl", e.target.value)}
                                            placeholder="https://..."
                                            style={inputStyle}
                                        />
                                    </div>

                                    <textarea
                                        value={builderState.footer}
                                        onChange={(e) => updateBuilder("footer", e.target.value)}
                                        placeholder="Футер письма"
                                        style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                                    />

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                                            gap: 12,
                                        }}
                                    >
                                        <label style={fieldLabelStyle}>
                                            Фон
                                            <input
                                                type="color"
                                                value={builderState.backgroundColor}
                                                onChange={(e) => updateBuilder("backgroundColor", e.target.value)}
                                                style={colorInputStyle}
                                            />
                                        </label>

                                        <label style={fieldLabelStyle}>
                                            Карточка
                                            <input
                                                type="color"
                                                value={builderState.cardColor}
                                                onChange={(e) => updateBuilder("cardColor", e.target.value)}
                                                style={colorInputStyle}
                                            />
                                        </label>

                                        <label style={fieldLabelStyle}>
                                            Текст
                                            <input
                                                type="color"
                                                value={builderState.textColor}
                                                onChange={(e) => updateBuilder("textColor", e.target.value)}
                                                style={colorInputStyle}
                                            />
                                        </label>

                                        <label style={fieldLabelStyle}>
                                            Акцент
                                            <input
                                                type="color"
                                                value={builderState.accentColor}
                                                onChange={(e) => updateBuilder("accentColor", e.target.value)}
                                                style={colorInputStyle}
                                            />
                                        </label>

                                        <label style={fieldLabelStyle}>
                                            Кнопка
                                            <input
                                                type="color"
                                                value={builderState.buttonColor}
                                                onChange={(e) => updateBuilder("buttonColor", e.target.value)}
                                                style={colorInputStyle}
                                            />
                                        </label>
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr auto",
                                            gap: 12,
                                            alignItems: "end",
                                        }}
                                    >
                                        <input
                                            value={builderState.imageAlt}
                                            onChange={(e) => updateBuilder("imageAlt", e.target.value)}
                                            placeholder="Alt для картинки"
                                            style={inputStyle}
                                        />
                                        <input
                                            value={builderState.imageUrl}
                                            onChange={(e) => updateBuilder("imageUrl", e.target.value)}
                                            placeholder="URL картинки или data:image/..."
                                            style={inputStyle}
                                        />

                                        <label
                                            style={{
                                                ...modeButtonStyle,
                                                display: "inline-flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                                minHeight: 46,
                                                cursor: "pointer",
                                            }}
                                        >
                                            Загрузить картинку
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ display: "none" }}
                                                onChange={(e) => void handleImageUpload(e.target.files?.[0] ?? null)}
                                            />
                                        </label>
                                    </div>

                                    {builderImageName && (
                                        <div style={{ fontSize: 12, color: "rgba(245,240,233,.65)" }}>
                                            Прикреплена картинка: {builderImageName}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                  <textarea
                      value={mailText}
                      onChange={(e) => setMailText(e.target.value)}
                      placeholder="Текстовая версия письма"
                      style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                  />

                                    <textarea
                                        value={mailHtml}
                                        onChange={(e) => setMailHtml(e.target.value)}
                                        placeholder="HTML-версия письма"
                                        style={{
                                            ...inputStyle,
                                            minHeight: 260,
                                            resize: "vertical",
                                            fontFamily:
                                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                        }}
                                    />
                                </>
                            )}

                            <div
                                style={{
                                    padding: 14,
                                    borderRadius: 16,
                                    border: "1px solid rgba(224,197,143,.12)",
                                    background: "rgba(10,18,38,.18)",
                                }}
                            >
                                <div style={{ fontWeight: 900, marginBottom: 10 }}>Предпросмотр письма</div>
                                <div
                                    style={{
                                        borderRadius: 16,
                                        overflow: "hidden",
                                        border: "1px solid rgba(224,197,143,.12)",
                                        background: "#ffffff",
                                    }}
                                >
                                    <iframe
                                        title="Предпросмотр email"
                                        srcDoc={builderMode === "builder" ? previewHtml : mailHtml}
                                        style={{ width: "100%", minHeight: 520, border: 0, background: "#fff" }}
                                    />
                                </div>
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    alignItems: "center",
                                    flexWrap: "wrap",
                                }}
                            >
                                <div style={{ fontSize: 12, color: "rgba(245,240,233,.65)" }}>
                                    Письма уходят каждому адресу отдельно. Для сегмента «Вся база» будет дополнительное подтверждение.
                                </div>

                                <button
                                    onClick={() => void sendEmailCampaign()}
                                    disabled={mailSending || !mailSubject.trim() || (!mailText.trim() && !mailHtml.trim())}
                                    style={{
                                        borderRadius: 14,
                                        padding: "12px 16px",
                                        border:
                                            selectedSegment === "all"
                                                ? "1px solid rgba(255,208,120,.28)"
                                                : "1px solid rgba(224,197,143,.20)",
                                        background:
                                            selectedSegment === "all"
                                                ? "rgba(255,208,120,.12)"
                                                : "rgba(224,197,143,.12)",
                                        color: "rgba(245,240,233,.92)",
                                        fontWeight: 950,
                                        cursor: mailSending ? "default" : "pointer",
                                        opacity: mailSending ? 0.75 : 1,
                                    }}
                                >
                                    {mailSending
                                        ? "Отправка…"
                                        : selectedSegment === "all"
                                            ? "Отправить всем пользователям"
                                            : `Отправить: ${SEGMENT_LABELS[selectedSegment]}`}
                                </button>
                            </div>
                        </div>
                    </Card>

                    <div style={{ gridColumn: "1 / -1" }}>
                        <Card title={`История рассылок (${emailCampaigns.length})`}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "180px 1fr 140px 160px 160px",
                                    gap: 10,
                                    padding: "10px 10px",
                                    borderRadius: 14,
                                    background: "rgba(10,18,38,.22)",
                                    border: "1px solid rgba(224,197,143,.10)",
                                    color: "rgba(245,240,233,.70)",
                                    fontSize: 12,
                                    fontWeight: 950,
                                }}
                            >
                                <div>Campaign</div>
                                <div>Subject / Segment</div>
                                <div>Status</div>
                                <div>Counts</div>
                                <div>Created</div>
                            </div>

                            {emailCampaigns.map((campaign) => (
                                <GridRow key={campaign.id} cols="180px 1fr 140px 160px 160px">
                                    <Mono>{String(campaign.id).slice(0, 8)}…</Mono>
                                    <div>
                                        <div style={{ fontWeight: 900 }}>{campaign.subject}</div>
                                        <div style={{ opacity: 0.72, fontSize: 12 }}>
                                            {SEGMENT_LABELS[campaign.segment_key] || campaign.segment_key}
                                        </div>
                                    </div>
                                    <Badge>{campaign.status}</Badge>
                                    <div style={{ fontSize: 12, opacity: 0.82 }}>
                                        Всего: {campaign.recipients_count}
                                        <br />
                                        Успех: {campaign.sent_count}
                                        <br />
                                        Ошибки: {campaign.failed_count}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.82 }}>
                                        {new Date(campaign.created_at).toLocaleString()}
                                    </div>
                                </GridRow>
                            ))}

                            {!emailCampaigns.length && (
                                <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                                    Рассылок пока не было или логирование кампаний сейчас недоступно.
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            )}

            {tab === "support" && (
                <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 }}>
                    <Card title={`Поддержка (${filteredThreads.length})`}>
                        {supportErr && (
                            <div
                                style={{
                                    marginBottom: 10,
                                    padding: 12,
                                    borderRadius: 14,
                                    border: "1px solid rgba(255,110,90,.22)",
                                    background: "rgba(255,110,90,.06)",
                                    fontSize: 13,
                                    color: "rgba(245,240,233,.88)",
                                }}
                            >
                                {supportErr}
                            </div>
                        )}

                        {supportLoading ? (
                            <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                                Загрузка обращений…
                            </div>
                        ) : (
                            <div style={{ display: "grid", gap: 10 }}>
                                {filteredThreads.slice(0, 200).map((t) => {
                                    const active = t.id === activeThreadId;
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => setActiveThreadId(t.id)}
                                            style={{
                                                textAlign: "left",
                                                width: "100%",
                                                padding: 12,
                                                borderRadius: 16,
                                                border: active
                                                    ? "1px solid rgba(224,197,143,.28)"
                                                    : "1px solid rgba(224,197,143,.10)",
                                                background: active ? "rgba(224,197,143,.08)" : "rgba(10,18,38,.18)",
                                                color: "rgba(245,240,233,.92)",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <div style={{ fontWeight: 950, fontSize: 13, textDecoration: t.status === "closed" ? "line-through" : "none", opacity: t.status === "closed" ? 0.72 : 1 }}>{t.subject || "Обращение"}</div>
                                            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.70)" }}>
                                                {getSupportCategoryLabel(t.category)} • {getSupportStatusLabel(t.status)}
                                            </div>
                                            <div style={{ marginTop: 6, fontSize: 12, color: "rgba(245,240,233,.55)" }}>
                                                {getSupportUserLabel(t)} • последнее сообщение:{" "}
                                                {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : "—"}
                                            </div>
                                        </button>
                                    );
                                })}

                                {!filteredThreads.length && !supportErr && (
                                    <div style={{ color: "rgba(245,240,233,.65)", fontSize: 13, padding: 10 }}>
                                        Пока нет обращений.
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>

                    <Card title={activeThread ? `Чат: ${activeThread.subject}` : "Чат"}>
                        {!activeThreadId ? (
                            <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>Выбери обращение слева.</div>
                        ) : (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateRows: "auto 1fr auto",
                                    gap: 12,
                                    minHeight: "62vh",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: 12,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <div style={{ color: "rgba(245,240,233,.70)", fontSize: 13 }}>
                                        {activeThread
                                            ? `${getSupportCategoryLabel(activeThread.category)} • ${getSupportStatusLabel(activeThread.status)} • ${getSupportUserLabel(activeThread)}`
                                            : ""}
                                    </div>

                                    {activeThread && (
                                        <button
                                            onClick={() => void closeThread()}
                                            disabled={supportSending || !!supportErr || activeThread.status === "closed"}
                                            style={{
                                                borderRadius: 14,
                                                padding: "10px 12px",
                                                border: "1px solid rgba(255,110,90,.20)",
                                                background: "rgba(255,110,90,.10)",
                                                color: "rgba(245,240,233,.92)",
                                                fontWeight: 950,
                                                cursor:
                                                    supportSending || activeThread.status === "closed"
                                                        ? "default"
                                                        : "pointer",
                                                opacity:
                                                    supportSending || supportErr || activeThread.status === "closed"
                                                        ? 0.75
                                                        : 1,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {activeThread.status === "closed" ? "Обращение закрыто" : "Закрыть обращение"}
                                        </button>
                                    )}
                                </div>

                                <div
                                    style={{
                                        padding: 12,
                                        borderRadius: 16,
                                        border: "1px solid rgba(224,197,143,.10)",
                                        background: "rgba(10,18,38,.18)",
                                        overflow: "auto",
                                    }}
                                >
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {messages.map((m) => {
                                            const mine = m.is_admin && m.author_admin_id && m.author_admin_id === adminId;

                                            return (
                                                <div
                                                    key={m.id}
                                                    style={{
                                                        justifySelf: mine ? "end" : "start",
                                                        maxWidth: "78%",
                                                        padding: "10px 12px",
                                                        borderRadius: 16,
                                                        border: mine
                                                            ? "1px solid rgba(120,230,255,.22)"
                                                            : "1px solid rgba(224,197,143,.10)",
                                                        background: mine ? "rgba(120,230,255,.10)" : "rgba(17,34,80,.18)",
                                                        color: "rgba(245,240,233,.92)",
                                                        whiteSpace: "pre-wrap",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: 12,
                                                            opacity: 0.75,
                                                            fontWeight: 900,
                                                            marginBottom: 6,
                                                        }}
                                                    >
                                                        {m.is_admin ? "Поддержка" : "Пользователь"}
                                                    </div>

                                                    <div>{m.message}</div>

                                                    {m.attachment_url && (
                                                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                                                            📎{" "}
                                                            <a
                                                                href={m.attachment_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{
                                                                    color: "rgba(245,240,233,.92)",
                                                                    textDecoration: "underline",
                                                                }}
                                                            >
                                                                Открыть файл
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div ref={bottomRef} />
                                    </div>
                                </div>

                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    <input
                                        value={supportText}
                                        onChange={(e) => setSupportText(e.target.value)}
                                        placeholder="Ответить пользователю…"
                                        disabled={supportSending || !!supportErr}
                                        style={{
                                            flex: 1,
                                            padding: "12px 12px",
                                            borderRadius: 14,
                                            border: "1px solid rgba(224,197,143,.14)",
                                            background: "rgba(10,18,38,.28)",
                                            color: "rgba(245,240,233,.92)",
                                            outline: "none",
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void sendAdminMessage();
                                            }
                                        }}
                                    />

                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        style={{ display: "none" }}
                                        disabled={supportSending || !!supportErr}
                                        onChange={(e) => setSupportFile(e.target.files?.[0] ?? null)}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={supportSending || !!supportErr}
                                        title={supportFile ? supportFile.name : "Прикрепить файл"}
                                        style={{
                                            width: 46,
                                            height: 46,
                                            borderRadius: 14,
                                            border: "1px solid rgba(224,197,143,.20)",
                                            background: "rgba(10,18,38,.22)",
                                            color: "rgba(245,240,233,.92)",
                                            display: "grid",
                                            placeItems: "center",
                                            cursor: supportSending ? "default" : "pointer",
                                            opacity: supportSending || supportErr ? 0.65 : 1,
                                        }}
                                    >
                                        <PaperclipIcon />
                                    </button>

                                    <button
                                        onClick={() => void sendAdminMessage()}
                                        disabled={supportSending || !!supportErr || (!supportText.trim() && !supportFile)}
                                        style={{
                                            borderRadius: 14,
                                            padding: "12px 14px",
                                            border: "1px solid rgba(224,197,143,.20)",
                                            background: "rgba(224,197,143,.12)",
                                            color: "rgba(245,240,233,.92)",
                                            fontWeight: 950,
                                            cursor: supportSending ? "default" : "pointer",
                                            opacity: supportSending || supportErr ? 0.75 : 1,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {supportSending ? "…" : "Отправить"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </div>
    );
}

const inputStyle: CSSProperties = {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(224,197,143,.14)",
    background: "rgba(10,18,38,.28)",
    color: "rgba(245,240,233,.92)",
    outline: "none",
    width: "100%",
};

const modeButtonStyle: CSSProperties = {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(224,197,143,.16)",
    background: "rgba(17,34,80,.18)",
    color: "rgba(245,240,233,.92)",
    fontWeight: 800,
};

const selectedModeButtonStyle: CSSProperties = {
    ...modeButtonStyle,
    border: "1px solid rgba(224,197,143,.32)",
    background: "rgba(224,197,143,.12)",
};

const fieldLabelStyle: CSSProperties = {
    display: "grid",
    gap: 8,
    fontSize: 12,
    color: "rgba(245,240,233,.72)",
};

const colorInputStyle: CSSProperties = {
    width: "100%",
    height: 42,
    borderRadius: 12,
    border: "1px solid rgba(224,197,143,.14)",
    background: "rgba(10,18,38,.28)",
    padding: 4,
};

function TabButton({
                       active,
                       onClick,
                       children,
                   }: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                borderRadius: 999,
                padding: "8px 12px",
                border: active ? "1px solid rgba(224,197,143,.30)" : "1px solid rgba(224,197,143,.12)",
                background: active ? "rgba(224,197,143,.10)" : "rgba(17,34,80,.16)",
                color: "rgba(245,240,233,.92)",
                fontWeight: 950,
                cursor: "pointer",
            }}
        >
            {children}
        </button>
    );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div
            style={{
                padding: 18,
                borderRadius: 22,
                border: "1px solid rgba(224,197,143,.14)",
                background: "rgba(17,34,80,.16)",
            }}
        >
            <div style={{ fontSize: 16, fontWeight: 950, marginBottom: 10 }}>{title}</div>
            {children}
        </div>
    );
}

function GridRow({ cols, children }: { cols: string; children: ReactNode }) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 10,
                padding: "10px 10px",
                borderRadius: 14,
                border: "1px solid rgba(224,197,143,.10)",
                background: "rgba(10,18,38,.16)",
                alignItems: "center",
                marginTop: 10,
            }}
        >
            {children}
        </div>
    );
}

function Mono({ children }: { children: ReactNode }) {
    return (
        <span
            style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12,
                opacity: 0.9,
            }}
        >
      {children}
    </span>
    );
}

function Badge({ children }: { children: ReactNode }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(224,197,143,.14)",
                background: "rgba(17,34,80,.20)",
                fontSize: 12,
                fontWeight: 900,
            }}
        >
      {children}
    </span>
    );
}
