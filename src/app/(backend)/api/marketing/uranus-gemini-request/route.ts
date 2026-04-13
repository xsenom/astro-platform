import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin/auth";
import { sendSmtpMail } from "@/lib/email/smtp";

export const runtime = "nodejs";

function log(...args: unknown[]) {
    console.log("[uranus-gemini-request]", ...args);
}

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function normalizeCity(value: unknown) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function getEnv(name: string) {
    return String(process.env[name] || "").trim();
}

function isMissingTableError(message: string) {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("could not find the table") ||
        (normalized.includes("relation") && normalized.includes("does not exist"))
    );
}

function isMissingColumnError(message: string) {
    const normalized = message.toLowerCase();
    return normalized.includes("column") && normalized.includes("does not exist");
}

function isMissingBucketError(message: string) {
    const normalized = message.toLowerCase();
    return (
        normalized.includes("bucket not found") ||
        normalized.includes("the resource was not found") ||
        (normalized.includes("storage") && normalized.includes("not found"))
    );
}

function extractMissingColumnName(message: string) {
    const match = message.match(/column\s+["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
    return match?.[1] || null;
}

function getAstroApiBase() {
    return (
        getEnv("ASTRO_API_BASE") ||
        getEnv("NEXT_PUBLIC_ASTRO_API_BASE") ||
        "http://127.0.0.1:8011"
    ).replace(/\/$/, "");
}

function getPdfBucketName() {
    return (
        getEnv("URANUS_GEMINI_PDF_BUCKET") ||
        getEnv("PDF_BUCKET") ||
        "pdfs"
    ).trim();
}

function isValidBirthDate(value: string) {
    if (!/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(19|20)\d{2}$/.test(value)) {
        return false;
    }

    const [dayRaw, monthRaw, yearRaw] = value.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const date = new Date(year, month - 1, day);

    return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

function isValidBirthTime(value: string) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function isValidBirthCity(value: string) {
    return /^[\p{L}\s.,()-]{2,}$/u.test(value.trim());
}

function toIsoBirthDate(value: string) {
    const [day, month, year] = value.split(".");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function nl2br(value: string) {
    return escapeHtml(value).replace(/\n/g, "<br/>");
}

function cleanJsonFence(value: string) {
    return value
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}

function extractUranusText(payloadData: unknown): string {
    if (typeof payloadData === "string") return payloadData.trim();

    if (!payloadData || typeof payloadData !== "object") {
        return String(payloadData ?? "").trim();
    }

    const candidate = payloadData as Record<string, unknown>;

    const directText = [
        candidate.text,
        candidate.result_text,
        candidate.interpretation_text,
        candidate.interpretation,
        candidate.content,
        candidate.markdown,
        candidate.report,
        candidate.summary,
    ].find((value) => typeof value === "string" && value.trim());

    if (typeof directText === "string") return directText.trim();

    return JSON.stringify(payloadData, null, 2);
}

type OpenAIOutputItem = {
    content?: Array<{ text?: string }>;
};

type OpenAIResponse = {
    output_text?: string;
    output?: OpenAIOutputItem[];
    error?: { message?: string };
};

type UranusAspectItem = {
    period: string;
    title: string;
    text: string;
};

type UranusPdfData = {
    person_line: string;
    block1_title: string;
    block1_text: string;
    reforms_title: string;
    reforms: string[];
    aspects_title: string;
    aspects: UranusAspectItem[];
};

type ExistingRequestRow = {
    id?: string | number | null;
    status?: string | null;
    email_sent?: boolean | null;
    email_error?: string | null;
    pdf_url?: string | null;
    pdf_path?: string | null;
    file_name?: string | null;
    result_text?: string | null;
    full_name?: string | null;
    email?: string | null;
    birth_date?: string | null;
    birth_time?: string | null;
    birth_time_unknown?: boolean | null;
    birth_city?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    sent_at?: string | null;
    consent_personal_data?: boolean | null;
    consent_ads?: boolean | null;
};

const URANUS_OPENAI_MODEL =
    process.env.URANUS_GEMINI_OPENAI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-5.4-mini";

function readOpenAIText(json: OpenAIResponse | null) {
    return (
        json?.output_text ||
        json?.output
            ?.flatMap((item) => item?.content ?? [])
            ?.map((item) => item?.text ?? "")
            ?.join("\n")
            ?.trim() ||
        null
    );
}

async function readPrompt() {
    const promptPath = path.join(
        process.cwd(),
        "backend",
        "app",
        "prompt",
        "uranus-gemini-request.txt"
    );

    try {
        const value = await fs.readFile(promptPath, "utf8");
        if (value.trim()) {
            log("prompt loaded from file", promptPath);
            return value;
        }
    } catch {
        log("prompt file not found, use fallback");
    }

    return [
        "Ты опытный астролог-консультант.",
        "Ты умеешь объяснять сложные вещи простым, точным, понятным и человеческим русским языком.",
        "На основе входных данных верни строго один валидный JSON-объект без markdown и без пояснений.",
        "",
        "Тебе нужно подготовить структуру PDF-прогноза на тему «Уран в Близнецах».",
        "",
        "КРИТИЧЕСКИ ВАЖНО:",
        "- ответ должен быть только JSON;",
        "- нельзя добавлять никакой текст до JSON и после JSON;",
        "- нельзя использовать markdown;",
        "- нельзя использовать блоки ``` и ```json;",
        "- нельзя писать комментарии, пояснения, вступления и заключения;",
        "- нельзя писать «Вот результат», «Готово», «Ниже JSON» и подобные фразы;",
        "- весь ответ должен начинаться с { и заканчиваться };",
        "- используй только двойные кавычки;",
        "- не оставляй лишних запятых;",
        "- все ключи и строки должны быть корректны для JSON.parse;",
        "- не добавляй поля, которых нет в заданной структуре;",
        "- не меняй названия ключей;",
        "- не меняй порядок ключей;",
        "- если внутри текста нужны кавычки, экранируй их корректно;",
        "- ответ должен быть валидным JSON с первой попытки.",
        "",
        "Структура ответа строго такая:",
        "{",
        '  \"person_line\": \"...\",',
        '  \"block1_title\": \"...\",',
        '  \"block1_text\": \"...\",',
        '  \"reforms_title\": \"...\",',
        '  \"reforms\": [\"...\", \"...\"],',
        '  \"aspects_title\": \"...\",',
        '  \"aspects\": [',
        "    {",
        '      \"period\": \"...\",',
        '      \"title\": \"...\",',
        '      \"text\": \"...\"',
        "    }",
        "  ]",
        "}",
        "",
        "Требования к ключам JSON:",
        "- person_line — строка;",
        "- block1_title — строка;",
        "- block1_text — строка;",
        "- reforms_title — строка;",
        "- reforms — массив строк длиной от 3 до 5;",
        "- aspects_title — строка;",
        "- aspects — массив объектов;",
        "- каждый объект в aspects должен содержать только 3 поля: period, title, text;",
        "- period, title и text всегда должны быть строками;",
        "- не добавляй другие поля;",
        "- не переименовывай ключи;",
        "- не меняй порядок ключей.",
        "",
        "Главный смысл прогноза:",
        "- показать, в каких именно темах жизни начнутся перемены;",
        "- показать, что именно там будет происходить;",
        "- объяснить человеку прямо, что именно может случиться, почему это происходит и к чему это может привести;",
        "- если в данных видна смена работы, способа заработка, круга общения, режима, отношений, целей или образа жизни, называй это прямо;",
        "- если в данных виден риск конфликта, срыва планов, нестабильности, отказа от старого или резкого поворота, называй это прямо;",
        "- не прячь главные события за мягкими, красивыми или слишком общими словами;",
        "- если перемена крупная, она должна звучать как крупная, а не как бытовая мелочь.",
        "",
        "Как строить интерпретацию:",
        "- используй сферу, по которой идет транзитный Уран;",
        "- используй сферы натальных планет и точек, к которым транзитный Уран делает аспекты;",
        "- сфера транзита показывает, где именно в жизни идут главные перемены;",
        "- сфера натальной планеты показывает, где еще эти перемены будут заметны и через какие обстоятельства они раскроются;",
        "- транзитный Уран и натальная планета показывают характер перемен;",
        "- аспект между транзитным Ураном и натальной планетой показывает, как именно будут идти перемены: легче или тяжелее, резче или мягче, с пользой или через напряжение;",
        "- всегда переводи это в обычный жизненный язык: работа, деньги, отношения, документы, поездки, учеба, окружение, внутреннее состояние, планы, семья, карьера.",
        "",
        "Главное правило интерпретации:",
        "- этот прогноз должен не намекать, а объяснять;",
        "- не пиши вскользь о главных переменах;",
        "- если видна смена работы, новый способ заработка, отказ от старых отношений, переезд, конфликт, карьерный поворот или запуск нового этапа, говори об этом прямо;",
        "- объясняй не общую атмосферу периода, а конкретные жизненные события и процессы;",
        "- каждый сильный аспект и каждая важная тема должны быть переведены в понятный жизненный смысл;",
        "- если из формулировки нельзя понять, что именно может произойти с человеком, такая формулировка плохая и ее нельзя использовать.",
        "",
        "Главный принцип:",
        "- каждый вывод должен описывать реальную жизнь;",
        "- после каждой фразы должно быть понятно, что именно это значит для человека;",
        "- если фразу нельзя представить как событие, решение, конфликт, перемену, отказ, новую возможность или конкретное действие, такую фразу писать нельзя;",
        "- если из данных следует большая жизненная перемена, нельзя описывать её так, будто это обычная мелочь.",
        "",
        "Приоритет важности событий:",
        "- на первом месте всегда крупные жизненные перемены;",
        "- крупными считаются: смена работы, смена профессии, смена способа заработка, резкий рост или падение дохода, переезд, разрыв отношений, новый важный союз, запуск проекта, смена статуса, сильный конфликт, отказ от старой жизненной схемы, заметный поворот в карьере;",
        "- если такая перемена видна, сначала пиши о ней, а уже потом о фоне и деталях;",
        "- нельзя прятать крупную перемену среди общих фраз;",
        "- нельзя делать вид, что смена работы или дохода — это просто один из многих мелких вариантов.",
        "",
        "Требования к языку:",
        "- пиши нормальным русским языком, как живой адекватный человек;",
        "- пиши просто, ясно и по делу;",
        "- не пиши расплывчато;",
        "- не пиши слишком красиво ради красоты;",
        "- не используй пафос;",
        "- не используй эзотерический туман;",
        "- не используй псевдопсихологические формулировки;",
        "- не используй фразы, которые звучат умно, но ничего не объясняют;",
        "- не используй канцелярит;",
        "- не используй тяжелый книжный стиль;",
        "- не используй длинные запутанные предложения;",
        "- пиши так, чтобы человек сразу понял, что именно происходит в его жизни и почему это важно;",
        "- тон должен быть спокойным, трезвым, уверенным и уважительным;",
        "- не пугай человека;",
        "- не нагнетай;",
        "- если перемена серьезная, называй ее прямо, но спокойно;",
        "- не делай весь прогноз одинаково напряженным;",
        "- в тексте должны быть и перемены, и возможности, и риски;",
        "- не злоупотребляй словами «резко», «жестко», «борьба», «давление», если это не подтверждено очень явно.",
        "",
        "Запрещенные примеры плохого стиля:",
        "- «старый способ жить перестаёт работать»;",
        "- «цикл становится более заметным снаружи»;",
        "- «напряжение растёт в теме свободы действий»;",
        "- «обстоятельства будут заставлять»;",
        "- «не получится плыть по течению»;",
        "- «меняется отношение к одиночеству»;",
        "- «усиливается потребность в дистанции»;",
        "- «идёт перестройка внутренней структуры»;",
        "- «меняется жизненная стратегия»;",
        "- «начинается важный этап перемен»;",
        "- «открывается новое направление развития» без пояснения, какое именно;",
        "- «возможны судьбоносные события»;",
        "- «трансформация» без объяснения, что реально изменится;",
        "- «внутренний хлам»;",
        "- «главный удар периода»;",
        "- «прямой конфликт» без достаточных оснований;",
        "- «старый маршрут»;",
        "- «прежняя схема жизни»;",
        "- «формат стал тесным»;",
        "- «возможны перемены в профессиональной сфере» вместо прямого описания смены работы или формата занятости;",
        "- «финансовые изменения» вместо прямого описания нового способа заработка, роста дохода или нестабильности денег.",
        "",
        "Как писать правильно:",
        "- не пиши общими словами, если можно сказать прямо;",
        "- не пиши «станет легче замечать, что тебя выматывает», а пиши, что человек начнет отказываться от лишней нагрузки, неудобной работы, пустого общения или режима без отдыха;",
        "- не пиши «меняется стиль общения», а пиши, что человек начнет говорить прямее, чаще спорить, искать новые связи или менять круг общения;",
        "- не пиши «меняется внутреннее состояние», а пиши, что станет больше тревоги, усталости, раздражения, желания закрыться, отдохнуть или резко что-то изменить;",
        "- не пиши «возможна нестабильность», а пиши, где именно: в деньгах, работе, графике, отношениях, договоренностях, планах;",
        "- не пиши «новые возможности», а пиши, какие именно: новая работа, новый источник дохода, обучение, поездки, клиенты, знакомства, проект, смена формата жизни;",
        "- если возможна смена работы, пиши именно «смена работы», а не «изменения в рабочей сфере»;",
        "- если возможен новый способ заработка, пиши именно «новый способ заработка», а не «финансовые перемены»;",
        "- если возможен конфликт, увольнение, разрыв, отказ от старого, смена статуса или резкий поворот, называй это прямо;",
        "- если событие крупное, не упоминай его вскользь: выделяй его как одно из главных;",
        "- если в прогнозе есть сильное событие, например увольнение, разрыв, жесткий конфликт или резкий поворот, не подавай это как уже гарантированный факт; пиши как вероятный сценарий, а не как приговор.",
        "",
        "Что нельзя делать:",
        "- нельзя писать только общее настроение периода;",
        "- нельзя заменять конкретные события словами «перемены», «обновление», «напряжение», «рост», если не объяснено, что именно за этим стоит;",
        "- нельзя писать так, будто смена работы, дохода, отношений или жизненного курса — это что-то второстепенное;",
        "- нельзя уводить главный смысл в туманные формулировки;",
        "- нельзя делать весь текст однотонно жестким и конфликтным;",
        "- нельзя перегружать текст внутренними процессами, если по данным сильнее видны внешние события;",
        "- нельзя выдавать вероятный сценарий за стопроцентный факт.",
        "",
        "Что анализировать:",
        "- движение Урана в Близнецах по домам карты;",
        "- аспекты транзитного Урана к натальным планетам и фиктивным точкам;",
        "- если время рождения не указано, не учитывай дома и не анализируй натальную Луну;",
        "- если время рождения указано, учитывай и сферу транзита, и сферу натальной планеты.",
        "",
        "Роль домов и планет:",
        "- дома показывают обстоятельства и темы жизни, в которых будут происходить перемены;",
        "- транзитный Уран и натальные планеты показывают характер этих перемен;",
        "- аспект между транзитным Ураном и натальной планетой показывает, будут ли перемены идти легче или тяжелее, с пользой или через напряжение;",
        "- всегда переводи это в конкретные жизненные формулировки.",
        "",
        "Что должно быть в прогнозе:",
        "- где начнутся главные перемены;",
        "- что именно будет меняться в деньгах, работе, отношениях, общении, привычках, режиме, целях, окружении, поездках, документах, обучении;",
        "- где человек может выиграть;",
        "- где будет путаница, нестабильность или лишнее напряжение;",
        "- от чего придется отказаться;",
        "- что может начаться по-новому;",
        "- какие события являются главными, а какие второстепенными.",
        "",
        "Требования к block1_text:",
        "- это один связный текст;",
        "- примерно 3000 символов;",
        "- без списков;",
        "- простым и понятным языком;",
        "- в тексте обязательно должны быть этапы по годам;",
        "- используй только годы: 2026–2027, 2028–2030, 2031–2033, если это соответствует данным;",
        "- не используй месяцы и точные даты;",
        "- не используй слова «дом», «дома», «аспект», «аспекты»;",
        "- не используй слова «трин», «квадрат», «оппозиция», «секстиль», «соединение»;",
        "- не используй слово «пересборка» и любые его формы;",
        "- не используй туманные формулировки;",
        "- не используй фразы, которые можно вставить в любой прогноз;",
        "- если видна крупная жизненная перемена, назови её прямо;",
        "- если смена работы, дохода или жизненного курса — одно из главных событий периода, это должно звучать как одна из центральных тем текста, а не как случайная деталь;",
        "- после прочтения текста человек должен ясно понимать, что именно будет происходить и что в этом самое важное.",
        "",
        "Что обязательно должно быть в block1_text:",
        "- начало периода;",
        "- середина периода;",
        "- завершающая часть периода;",
        "- конкретные жизненные проявления;",
        "- нормальный человеческий язык;",
        "- понятная логика: что меняется, где плюс, где риск;",
        "- отдельный акцент на самых сильных и важных переменах периода;",
        "- спокойная, зрелая подача без лишней драматизации.",
        "",
        "Требования к reforms:",
        "- reforms — массив из 3–5 коротких и очень конкретных выводов;",
        "- каждый пункт должен быть понятен без дополнительных объяснений;",
        "- каждый пункт должен описывать конкретную перемену в жизни;",
        "- не пиши общие и красивые слова;",
        "- не пиши абстракции;",
        "- не пиши то, что подходит почти всем;",
        "- в reforms должны попадать самые важные события периода, а не фоновые наблюдения;",
        "- если смена работы, дохода, статуса, круга общения или образа жизни — это главное, это должно попасть в reforms;",
        "- формулировки должны быть прямыми и сильными по смыслу.",
        "",
        "Примеры хороших reforms:",
        "- «смена работы или переход в другой формат занятости»;",
        "- «новый способ заработка»;",
        "- «рост дохода через обучение, клиентов, связи или цифровые инструменты»;",
        "- «отказ от бесполезных контактов»;",
        "- «больше поездок, документов и общения по делу»;",
        "- «конфликты из-за спешки, давления и перегруза»;",
        "- «резкий поворот в карьере или целях».",
        "",
        "Требования к aspects:",
        "- aspects_title — строка;",
        "- aspects — массив объектов;",
        "- если аспектов 6 или больше, верни не менее 6;",
        "- не сокращай список до самых важных, если данных больше;",
        "- каждый аспект должен быть отдельным объектом;",
        "- каждый объект должен содержать только period, title, text;",
        "- title обязательно должно быть заполнено всегда;",
        "- название аспекта нельзя пропускать, сокращать или заменять пустой формулировкой;",
        "- title должно содержать понятное полное название аспекта;",
        "- если у аспекта несколько периодов, перечисли все периоды в одном поле period;",
        "- period — строка;",
        "- title — строка;",
        "- text — короткое, ясное и конкретное толкование;",
        "- длина text — не более 1000 символов;",
        "- text должен быть написан простым русским языком;",
        "- если время рождения известно, учитывай сферу транзита и сферу натальной планеты, но не называй дома напрямую;",
        "- если время рождения неизвестно, не учитывай дома и не анализируй натальную Луну.",
        "",
        "Как писать aspects.text:",
        "- объясняй прямо и понятно;",
        "- пиши, что реально может происходить;",
        "- не используй туман;",
        "- не используй красивый пустой стиль;",
        "- не используй одинаковые формулировки для всех аспектов;",
        "- учитывай смысл конкретной планеты;",
        "- если аспект показывает крупную перемену, назови её прямо;",
        "- если аспект может дать смену работы, новый способ заработка, резкий конфликт, разворот в карьере или отказ от старой схемы, это нужно писать как главное следствие аспекта, а не вскользь;",
        "- не делай все аспекты одинаково тяжелыми; различай возможности, риски и нейтральные периоды.",
        "",
        "Правило названия аспектов:",
        "- у каждого элемента в aspects обязательно должно быть поле title;",
        "- поле title всегда заполняй;",
        "- не пропускай название аспекта даже если толкование кажется важнее;",
        "- сначала модель должна определить название аспекта, потом период, потом смысл;",
        "- если title пустое, ответ считается неправильным.",
        "",
        "Что запрещено в любом текстовом поле JSON:",
        "- markdown;",
        "- HTML;",
        "- комментарии;",
        "- служебные пометки;",
        "- эзотерические штампы;",
        "- псевдопсихологический туман;",
        "- пафос;",
        "- фразы без реального смысла;",
        "- слова «дом», «дома», «аспект», «аспекты» в block1_text и aspects.text;",
        "- незакрытые кавычки;",
        "- кривой JSON.",
        "",
        "Если каких-то данных не хватает:",
        "- все равно верни валидный JSON указанной структуры;",
        "- не пропускай обязательные ключи;",
        "- не добавляй пояснения;",
        "- не пиши null, если можно вернуть пустую строку;",
        "- reforms оставь массивом;",
        "- aspects оставь массивом;",
        "- если title для аспекта невозможно определить точно из входных данных, все равно заполни его максимально близким корректным названием, а не оставляй пустым.",
        "",
        "Перед ответом сделай внутреннюю проверку:",
        "- ответ состоит только из одного JSON-объекта;",
        "- JSON парсится через JSON.parse;",
        "- все ключи на месте;",
        "- все строки заключены в двойные кавычки;",
        "- reforms — массив строк;",
        "- aspects — массив объектов с period, title, text;",
        "- у каждого объекта aspects заполнены все три поля: period, title, text;",
        "- нет markdown;",
        "- нет пояснений;",
        "- нет лишних запятых;",
        "- язык простой, русский и понятный;",
        "- в тексте нет бессмысленно красивых фраз;",
        "- крупные жизненные перемены названы прямо и не спрятаны в мягкие слова;",
        "- самые важные события периода звучат как самые важные;",
        "- текст не перегнут в драму;",
        "- текст не звучит как инфобиз, психология или канцелярит.",
        "",
        "Верни только JSON.",
    ].join("\n");
}

async function createOpenAIInterpretation(prompt: string, input: unknown) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY не настроен.");
    }

    log("openai request start", {
        model: URANUS_OPENAI_MODEL,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    let response: Response;

    try {
        response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: URANUS_OPENAI_MODEL,
                input: [
                    {
                        role: "system",
                        content: [{ type: "input_text", text: prompt }],
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text:
                                    typeof input === "string"
                                        ? input
                                        : JSON.stringify(input, null, 2),
                            },
                        ],
                    },
                ],
                max_output_tokens: 6000,
            }),
            signal: controller.signal,
        });
    } catch (error) {
        clearTimeout(timeout);

        const message =
            error instanceof Error ? error.message : String(error);

        log("openai fetch fatal", {
            message,
            cause:
                error instanceof Error && "cause" in error
                    ? String((error as Error & { cause?: unknown }).cause)
                    : null,
        });

        throw new Error(`OpenAI fetch failed: ${message}`);
    }

    clearTimeout(timeout);

    const json = (await response.json().catch(() => null)) as OpenAIResponse | null;

    if (!response.ok) {
        log("openai request failed", {
            status: response.status,
            payload: json,
        });
        throw new Error(json?.error?.message || `OpenAI HTTP ${response.status}`);
    }

    const text = readOpenAIText(json);

    if (!text) {
        throw new Error("OpenAI вернул пустую интерпретацию.");
    }

    log("openai request success", {
        length: text.length,
        preview: text.slice(0, 500),
    });

    return text;
}

function normalizeAspectItem(item: unknown): UranusAspectItem | null {
    if (!item || typeof item !== "object") return null;

    const src = item as Record<string, unknown>;

    const period = String(src.period ?? "").trim();
    const title = String(src.title ?? "").trim();
    const text = String(src.text ?? "").trim();

    if (!period || !title || !text) return null;

    return {
        period,
        title,
        text,
    };
}

function normalizePdfData(
    raw: unknown,
    fallbackFullName: string,
    fallbackBirthDate: string
): UranusPdfData {
    if (!raw || typeof raw !== "object") {
        throw new Error("OpenAI вернул некорректную структуру прогноза.");
    }

    const src = raw as Record<string, unknown>;

    const personLine =
        String(src.person_line ?? "").trim() ||
        `${fallbackFullName} — ${fallbackBirthDate}`;

    const block1Title =
        String(src.block1_title ?? "").trim() ||
        "ОБЩАЯ ХАРАКТЕРИСТИКА ПЕРИОДА ДЛЯ ВАС";

    const block1Text = String(src.block1_text ?? "").trim();

    const reformsTitle =
        String(src.reforms_title ?? "").trim() ||
        "ОСНОВНЫЕ ПЕРЕМЕНЫ В ЖИЗНИ";

    const reformsRaw = Array.isArray(src.reforms) ? src.reforms : [];
    const reforms = reformsRaw
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, 5);

    const aspectsTitle =
        String(src.aspects_title ?? "").trim() ||
        "ОСНОВНЫЕ ДАТЫ ПЕРИОДА И ОПИСАНИЕ АСПЕКТОВ";

    const aspectsRaw = Array.isArray(src.aspects) ? src.aspects : [];
    const aspects = aspectsRaw
        .map(normalizeAspectItem)
        .filter((item): item is UranusAspectItem => Boolean(item));

    if (!block1Text) {
        throw new Error("В ответе OpenAI отсутствует block1_text.");
    }

    if (reforms.length === 0) {
        throw new Error("В ответе OpenAI отсутствуют reforms.");
    }

    if (aspects.length === 0) {
        throw new Error("В ответе OpenAI отсутствуют aspects.");
    }

    return {
        person_line: personLine,
        block1_title: block1Title,
        block1_text: block1Text,
        reforms_title: reformsTitle,
        reforms,
        aspects_title: aspectsTitle,
        aspects,
    };
}

async function createStructuredInterpretation(
    prompt: string,
    input: unknown,
    fallbackFullName: string,
    fallbackBirthDate: string
) {
    const rawText = await createOpenAIInterpretation(prompt, input);

    let parsed: unknown;

    try {
        parsed = JSON.parse(cleanJsonFence(rawText));
    } catch (error) {
        log("json parse failed", {
            rawTextPreview: rawText.slice(0, 1000),
            error: error instanceof Error ? error.message : String(error),
        });
        throw new Error("OpenAI вернул невалидный JSON для PDF.");
    }

    const pdfData = normalizePdfData(parsed, fallbackFullName, fallbackBirthDate);

    log("structured interpretation success", {
        person_line: pdfData.person_line,
        reformsCount: pdfData.reforms.length,
        aspectsCount: pdfData.aspects.length,
        block1Length: pdfData.block1_text.length,
    });

    return pdfData;
}

async function readImageAsDataUrl(imagePath: string) {
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    let mime = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    if (ext === ".webp") mime = "image/webp";

    return `data:${mime};base64,${buffer.toString("base64")}`;
}

function getShortCityName(value: string) {
    return String(value || "")
        .split(",")[0]
        .trim();
}

function buildPdfHtml(payload: {
    fullName: string;
    birthDate: string;
    birthTime: string;
    birthTimeUnknown: boolean;
    birthCity: string;
    pdfData: UranusPdfData;
    coverImageDataUrl?: string | null;
}) {
    const renderedBirthTime = payload.birthTimeUnknown
        ? "Неизвестно"
        : payload.birthTime;
    
    const shortBirthCity = getShortCityName(payload.birthCity);
    
    function formatAspectPeriod(value: string) {
    const parts = String(value || "")
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean);

    const formatted = parts.map((part) => {
        const rangeMatch = part.match(
            /(\d{2})\.(\d{2})\.(\d{4})\s*[–-]\s*(\d{2})\.(\d{2})\.(\d{4})/
        );

        if (rangeMatch) {
            const [, , startMonth, startYear, , endMonth, endYear] = rangeMatch;
            return `${startMonth}.${startYear}–${endMonth}.${endYear}`;
        }

        const singleMatch = part.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (singleMatch) {
            const [, , month, year] = singleMatch;
            return `${month}.${year}`;
        }

        return part;
    });

    return formatted.join(" • ");
}

function splitAspectsIntoPages(items: UranusAspectItem[], itemsPerPage = 2) {
    const pages: UranusAspectItem[][] = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
        pages.push(items.slice(i, i + itemsPerPage));
    }
    return pages;
}

const aspectsHtml = payload.pdfData.aspects
    .map(
        (item) => `
            <div class="aspect-item">
                <div class="aspect-item-period">${escapeHtml(formatAspectPeriod(item.period))}</div>
                <div class="aspect-item-title">${escapeHtml(item.title)}</div>
                <div class="aspect-item-text">${nl2br(item.text)}</div>
            </div>
        `
    )
    .join("");

    const reformsHtml = payload.pdfData.reforms
        .map(
            (item) => `
                <div class="reform-item">
                    <div class="reform-dot"></div>
                    <div class="reform-text">${escapeHtml(item)}</div>
                </div>
            `
        )
        .join("");

    return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Уран в Близнецах</title>
<style>
    @page {
        size: A4;
        margin: 0;
    }
    
    * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    
    html, body {
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif;
        color: #2c2625;
        background: #f5ede7;
    }
    
    body {
        background: #f5ede7;
    }
    
    .page {
        width: 210mm;
        min-height: auto;
        position: relative;
        padding: 16mm 14mm 12mm;
        background:
            radial-gradient(circle at 85% 12%, rgba(214, 185, 178, 0.22), transparent 18%),
            radial-gradient(circle at 10% 20%, rgba(231, 211, 206, 0.26), transparent 24%),
            linear-gradient(180deg, #f7efe8 0%, #f3e9e2 100%);
        page-break-after: always;
        overflow: visible;
    }
    
    .page:last-child {
        page-break-after: auto;
    }
    
    .page.cover {
        padding: 0;
        display: flex;
        flex-direction: column;
        background: linear-gradient(180deg, #f7efe8 0%, #f3e9e2 100%);
    }
    
    .cover-image-wrap {
        width: 100%;
        height: 120mm;
        overflow: hidden;
    }
    
    .cover-image {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        margin: 0;
    }
    
    .cover-content {
        padding: 12mm 14mm 18mm;
        display: flex;
        flex-direction: column;
        gap: 5mm;
    }
    
    .eyebrow {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #9c7c73;
    }
    
    .main-title {
        margin: 0;
        font-size: 34px;
        line-height: 1.12;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #2f2726;
    }
    
    .subtitle {
        margin: 0;
        font-size: 16px;
        line-height: 1.7;
        color: #5d514e;
        max-width: none;
    }
    
    .meta-card,
    .text-card,
    .reforms-card,
    .aspect-card {
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid rgba(126, 103, 96, 0.18);
        border-radius: 18px;
        box-shadow: 0 10px 26px rgba(54, 41, 38, 0.05);
    }
    
    .meta-card {
        width: 100%;
        text-align: left;
        padding: 22px 26px;
        margin-top: 4mm;
        border-radius: 22px;
    }
    
    .meta-row {
        margin: 0 0 14px;
        font-size: 19px;
        line-height: 1.6;
        color: #3b3433;
    }
    
    .meta-row:last-child {
        margin-bottom: 0;
    }
    
    .meta-row strong {
        font-size: 19px;
        font-weight: 700;
    }
    
    .section-title {
        margin: 0 0 8mm;
        font-size: 24px;
        line-height: 1.2;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: #302826;
    }

    
    .text-card {
        padding: 12mm;
        font-size: 16px;
        line-height: 1.85;
        color: #2c2625;
    }
    
    .spacer {
        height: 8mm;
    }
    
    .reforms-card {
        padding: 10mm 10mm 8mm;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    
    .reform-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 14px;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    
    .reform-item:last-child {
        margin-bottom: 0;
    }
    
    .reform-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        margin-top: 10px;
        flex: 0 0 auto;
        background: #9b776d;
    }
    
    .reform-text {
        font-size: 16px;
        line-height: 1.7;
        color: #302928;
    }
    
    .aspects-grid {
        display: grid;
        gap: 12px;
    }
    
    .aspect-card {
        padding: 10mm;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    
    .aspect-period {
        margin: 0 0 4mm;
        font-size: 13px;
        line-height: 1.45;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8d6f66;
    }
    
    .aspect-title {
        margin: 0 0 4mm;
        font-size: 20px;
        line-height: 1.35;
        font-weight: 700;
        color: #2d2725;
    }
    
    .aspect-text {
        margin: 0;
        font-size: 16px;
        line-height: 1.8;
        color: #342d2c;
    }
    
    .footer {
        margin-top: 8mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #8d7e79;
    }
    .aspects-block {
        background: rgba(255, 255, 255, 0.76);
        border: 1px solid rgba(126, 103, 96, 0.18);
        border-radius: 18px;
        box-shadow: 0 10px 26px rgba(54, 41, 38, 0.05);
        padding: 10mm;
    }
    
    .aspect-item {
        padding: 0 0 8mm;
        margin: 0 0 8mm;
        border-bottom: 1px solid rgba(126, 103, 96, 0.15);
        page-break-inside: avoid;
        break-inside: avoid;
    }
    
    .aspect-item:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
    }
    
    .aspect-item-period {
        margin: 0 0 4mm;
        font-size: 13px;
        line-height: 1.45;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #8d6f66;
    }
    
    .aspect-item-title {
        margin: 0 0 4mm;
        font-size: 20px;
        line-height: 1.35;
        font-weight: 700;
        color: #2d2725;
    }
    
    .aspect-item-text {
        margin: 0;
        font-size: 16px;
        line-height: 1.8;
        color: #342d2c;
    }
    
    .aspects-section {
    break-inside: auto;
    page-break-inside: auto;
    }
    
    .aspects-title {
        break-after: avoid;
        page-break-after: avoid;
    }
    
    .aspects-block {
        break-inside: auto;
        page-break-inside: auto;
    }
    
    .aspect-item {
        break-inside: avoid;
        page-break-inside: avoid;
    }
</style>
</head>
<body>
    <section class="page cover">
        ${
            payload.coverImageDataUrl
                ? `
                    <div class="cover-image-wrap">
                        <img class="cover-image" src="${payload.coverImageDataUrl}" alt="Уран в Близнецах" />
                    </div>
                `
                : ""
        }

        <div class="cover-content">
            <div class="eyebrow">Персональный астрологический прогноз</div>
            <h1 class="main-title">Уран в Близнецах</h1>

            <p class="subtitle">
                Индивидуальный прогноз периода Урана в Близнецах.
            </p>

            <div class="meta-card">
                <p class="meta-row"><strong>Имя:</strong> ${escapeHtml(payload.fullName)}</p>
                <p class="meta-row"><strong>Дата рождения:</strong> ${escapeHtml(payload.birthDate)}</p>
                <p class="meta-row"><strong>Время рождения:</strong> ${escapeHtml(renderedBirthTime)}</p>
                <p class="meta-row"><strong>Город рождения:</strong> ${escapeHtml(shortBirthCity)}</p>
            </div>
        </div>
    </section>

    <section class="page">
        <h2 class="section-title">${escapeHtml(payload.pdfData.block1_title)}</h2>
        <div class="text-card">
            ${nl2br(payload.pdfData.block1_text)}
        </div>

        <div class="spacer"></div>

        <h2 class="section-title">${escapeHtml(payload.pdfData.reforms_title)}</h2>
        <div class="reforms-card">
            ${reformsHtml}
        </div>

        <div class="spacer"></div>

        ${
            aspectsHtml
                ? `
                    <div class="aspects-section">
                        <h2 class="section-title aspects-title">${escapeHtml(payload.pdfData.aspects_title)}</h2>
                        <div class="aspects-block">
                            ${aspectsHtml}
                        </div>
                    </div>
                `
                : ""
        }
        

        <div class="footer">
            <span>${escapeHtml(payload.fullName)}</span>
            <span>стр. 2</span>
        </div>
    </section>


</body>
</html>`;
}

async function renderPdfFromHtml(html: string) {
    let browser: Awaited<
        ReturnType<(typeof import("playwright"))["chromium"]["launch"]>
    > | null = null;

    try {
        const { chromium } = await import("playwright");

        browser = await chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });

        await page.waitForFunction(() => {
            const img = document.querySelector(".cover-image") as HTMLImageElement | null;
            if (!img) return true;
            return img.complete && img.naturalWidth > 0;
        });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "0",
                right: "0",
                bottom: "0",
                left: "0",
            },
        });

        return Buffer.from(pdf);
    } finally {
        if (browser) {
            await browser.close().catch(() => undefined);
        }
    }
}

async function safeUpdateRequestRow(
    admin: ReturnType<typeof getAdminClient>,
    requestId: string,
    patch: Record<string, unknown>
) {
    let currentPatch = { ...patch };

    for (let attempt = 0; attempt < 10; attempt++) {
        const { error } = await admin
            .from("uranus_gemini_requests")
            .update(currentPatch)
            .eq("id", requestId);

        if (!error) {
            return;
        }

        if (!isMissingColumnError(error.message)) {
            throw error;
        }

        const columnName = extractMissingColumnName(error.message);
        if (!columnName || !(columnName in currentPatch)) {
            throw error;
        }

        log("remove missing column from update payload", {
            requestId,
            columnName,
        });

        delete currentPatch[columnName];
    }

    throw new Error("Не удалось обновить запись заявки: слишком много несовместимых колонок.");
}

async function findExistingCompletedRequest(
    admin: ReturnType<typeof getAdminClient>,
    params: {
        email: string;
        normalizedBirthDate: string;
        birthCity: string;
    }
): Promise<ExistingRequestRow | null> {
    const { email, normalizedBirthDate, birthCity } = params;

    const { data, error } = await admin
        .from("uranus_gemini_requests")
        .select("*")
        .eq("email", email)
        .eq("birth_date", normalizedBirthDate)
        .order("created_at", { ascending: false });

    if (error) {
        if (isMissingTableError(error.message)) {
            log("table uranus_gemini_requests not found on duplicate check");
            return null;
        }
        throw error;
    }

    const rows = (Array.isArray(data) ? data : []) as ExistingRequestRow[];
    const targetCity = normalizeCity(birthCity);

    const matched = rows.find((row) => normalizeCity(row.birth_city) === targetCity) || null;

    if (!matched) return null;

    const isReady =
        Boolean(matched.pdf_url) ||
        matched.email_sent === true ||
        matched.status === "sent";

    if (!isReady) return null;

    return matched;
}

async function createOrReuseRequestRow(
    admin: ReturnType<typeof getAdminClient>,
    payload: {
        fullName: string;
        email: string;
        normalizedBirthDate: string;
        birthTime: string;
        birthTimeUnknown: boolean;
        birthCity: string;
        consentPersonalData: boolean;
        consentAds: boolean;
    }
) {
    const { data: rows, error: selectError } = await admin
        .from("uranus_gemini_requests")
        .select("*")
        .eq("email", payload.email)
        .eq("birth_date", payload.normalizedBirthDate)
        .order("created_at", { ascending: false });

    if (selectError) {
        if (isMissingTableError(selectError.message)) {
            log("table uranus_gemini_requests not found, continue without db row");
            return { requestId: null as string | null, existingRow: null as ExistingRequestRow | null };
        }
        throw selectError;
    }

    const rowList = (Array.isArray(rows) ? rows : []) as ExistingRequestRow[];
    const targetCity = normalizeCity(payload.birthCity);

    const matchedRow =
        rowList.find((row) => normalizeCity(row.birth_city) === targetCity) || null;

    if (matchedRow?.id) {
        const requestId = String(matchedRow.id);

        await safeUpdateRequestRow(admin, requestId, {
            full_name: payload.fullName,
            email: payload.email,
            birth_date: payload.normalizedBirthDate,
            birth_time: payload.birthTime,
            birth_time_unknown: payload.birthTimeUnknown,
            birth_city: payload.birthCity,
            consent_personal_data: payload.consentPersonalData,
            consent_ads: payload.consentAds,
            status: "requested",
            email_sent: false,
            email_error: null,
            updated_at: new Date().toISOString(),
        });

        return {
            requestId,
            existingRow: matchedRow,
        };
    }

    const { data: inserted, error: insertError } = await admin
        .from("uranus_gemini_requests")
        .insert({
            full_name: payload.fullName,
            email: payload.email,
            birth_date: payload.normalizedBirthDate,
            birth_time: payload.birthTime,
            birth_time_unknown: payload.birthTimeUnknown,
            birth_city: payload.birthCity,
            consent_personal_data: payload.consentPersonalData,
            consent_ads: payload.consentAds,
            status: "requested",
            email_sent: false,
        })
        .select("id")
        .single();

    if (insertError) {
        if (isMissingTableError(insertError.message)) {
            log("table uranus_gemini_requests not found, continue without db row");
            return { requestId: null as string | null, existingRow: null as ExistingRequestRow | null };
        }
        throw insertError;
    }

    return {
        requestId: inserted?.id ? String(inserted.id) : null,
        existingRow: null,
    };
}

export async function POST(req: NextRequest) {
    const admin = getAdminClient();

    let requestId: string | null = null;
    let pdfData: UranusPdfData | null = null;
    let pdfUrl: string | null = null;
    let storagePath: string | null = null;
    let pdfFileName: string | null = null;

    try {
        const body = await req.json();

        log("incoming body", body);

        const fullName = String(body?.full_name || "").trim();
        const email = normalizeEmail(body?.email);
        const birthDate = String(body?.birth_date || "").trim();
        const birthTimeRaw = String(body?.birth_time || "").trim();
        const birthTimeUnknown = Boolean(body?.birth_time_unknown);
        const birthCity = String(body?.birth_city || "").trim();
        const consentPersonalData = Boolean(body?.consent_personal_data);
        const consentAds = Boolean(body?.consent_ads);

        const birthTime = birthTimeUnknown ? "12:00" : birthTimeRaw;

        log("normalized input", {
            fullName,
            email,
            birthDate,
            birthTimeRaw,
            birthTimeUnknown,
            birthTime,
            birthCity,
            consentPersonalData,
            consentAds,
        });

        if (!fullName || !email || !birthDate || !birthCity) {
            return NextResponse.json(
                { ok: false, error: "Заполните имя, email, дату рождения и город рождения." },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { ok: false, error: "Некорректный email." },
                { status: 400 }
            );
        }

        if (!isValidBirthDate(birthDate)) {
            return NextResponse.json(
                { ok: false, error: "Дата рождения должна быть в формате ДД.ММ.ГГГГ." },
                { status: 400 }
            );
        }

        if (!birthTimeUnknown && !isValidBirthTime(birthTime)) {
            return NextResponse.json(
                { ok: false, error: "Время рождения должно быть в формате HH:MM." },
                { status: 400 }
            );
        }

        if (!isValidBirthCity(birthCity)) {
            return NextResponse.json(
                { ok: false, error: "Укажите корректный город рождения." },
                { status: 400 }
            );
        }

        if (!consentPersonalData) {
            return NextResponse.json(
                { ok: false, error: "Нужно согласие на обработку персональных данных." },
                { status: 400 }
            );
        }

        const normalizedBirthDate = toIsoBirthDate(birthDate);
        const [year, month, day] = normalizedBirthDate.split("-").map(Number);
        const [hour, minute] = birthTime.split(":").map(Number);

        log("parsed birth params", {
            normalizedBirthDate,
            year,
            month,
            day,
            hour,
            minute,
        });

        const existingCompleted = await findExistingCompletedRequest(admin, {
            email,
            normalizedBirthDate,
            birthCity,
        });

        if (existingCompleted) {
            log("duplicate completed request found", {
                existingRequestId: existingCompleted.id,
                pdfUrl: existingCompleted.pdf_url || null,
                emailSent: existingCompleted.email_sent,
                status: existingCompleted.status,
            });

            return NextResponse.json({
                ok: true,
                already_exists: true,
                email_sent: Boolean(existingCompleted.email_sent),
                interpretation: existingCompleted.result_text || null,
                pdf_url: existingCompleted.pdf_url || null,
                pdf_file_name: existingCompleted.file_name || null,
                message:
                    "Вы уже получили расчёт по этому прогнозу, он в вашем личном кабинете и на указанной вами почте.",
            });
        }

        const dbRow = await createOrReuseRequestRow(admin, {
            fullName,
            email,
            normalizedBirthDate,
            birthTime,
            birthTimeUnknown,
            birthCity,
            consentPersonalData,
            consentAds,
        });

        requestId = dbRow.requestId;

        log("request row prepared", { requestId });

        const astroApiBase = getAstroApiBase();
        const astroUrl = new URL("/uranus_gemini_7y", astroApiBase);

        astroUrl.searchParams.set("year", String(year));
        astroUrl.searchParams.set("month", String(month));
        astroUrl.searchParams.set("day", String(day));
        astroUrl.searchParams.set("hour", String(hour));
        astroUrl.searchParams.set("minute", String(minute));
        astroUrl.searchParams.set("city_name", birthCity);

        let calcRes: Response;

        try {
            calcRes = await fetch(astroUrl.toString(), {
                method: "GET",
                headers: { "Content-Type": "application/json" },
                cache: "no-store",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`uranus_gemini_7y fetch failed: ${message}`);
        }

        const calcJson = (await calcRes.json().catch(() => null)) as
            | { ok?: boolean; error?: string; detail?: string; data?: unknown }
            | null;

        log("astro route response", {
            astroUrl: astroUrl.toString(),
            status: calcRes.status,
            ok: calcRes.ok,
            payload: calcJson,
        });

        if (!calcRes.ok) {
            const message =
                calcJson?.detail ||
                calcJson?.error ||
                "Не удалось получить расчёт Урана в Близнецах.";

            if (requestId) {
                await safeUpdateRequestRow(admin, requestId, {
                    status: "failed",
                    email_error: message,
                    updated_at: new Date().toISOString(),
                });
            }

            return NextResponse.json({ ok: false, error: message }, { status: 500 });
        }

        const rawPayload = calcJson?.data ?? calcJson;
        const rawText = extractUranusText(rawPayload);

        log("raw astro text extracted", {
            length: rawText.length,
            preview: rawText.slice(0, 500),
        });

        const prompt = await readPrompt();

        pdfData = await createStructuredInterpretation(
            prompt,
            {
                product: "Уран в Близнецах",
                full_name: fullName,
                birth_date: normalizedBirthDate,
                birth_time: birthTime,
                birth_time_unknown: birthTimeUnknown,
                birth_city: birthCity,
                raw_result: rawPayload,
                raw_text: rawText,
            },
            fullName,
            birthDate
        );

        const coverPath = path.join(
            process.cwd(),
            "public",
            "banners",
            "uranus-gemini-pdf-banner.jpg"
        );

        let coverImageDataUrl: string | null = null;

        try {
            await fs.access(coverPath);
            coverImageDataUrl = await readImageAsDataUrl(coverPath);
            log("cover image loaded", coverPath);
        } catch (error) {
            log("cover image not found", {
                coverPath,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const html = buildPdfHtml({
            fullName,
            birthDate,
            birthTime,
            birthTimeUnknown,
            birthCity,
            pdfData,
            coverImageDataUrl,
        });

        const pdfBuffer = await renderPdfFromHtml(html);

        function toStorageSafeSlug(value: string) {
            const map: Record<string, string> = {
                а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
                з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
                п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
                ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
            };
        
            return String(value || "")
                .trim()
                .toLowerCase()
                .split("")
                .map((char) => map[char] ?? char)
                .join("")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .replace(/-+/g, "-");
        }
        
        const safeName = toStorageSafeSlug(fullName) || "client";
    pdfFileName = `uran-v-bliznetsah-${safeName}.pdf`;
    storagePath = `uranus-gemini/${requestId || Date.now()}-${pdfFileName}`;

        log("custom pdf generated", {
            pdfFileName,
            size: pdfBuffer.length,
        });

        const bucketName = getPdfBucketName();
        storagePath = `uranus-gemini/${requestId || Date.now()}-${pdfFileName}`;

        try {
            const { error: uploadError } = await admin.storage
                .from(bucketName)
                .upload(storagePath, pdfBuffer, {
                    contentType: "application/pdf",
                    upsert: true,
                });

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicData } = admin.storage
                .from(bucketName)
                .getPublicUrl(storagePath);

            pdfUrl = publicData?.publicUrl || null;

            log("pdf uploaded", {
                bucketName,
                storagePath,
                pdfUrl,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            log("pdf upload warning", {
                bucketName,
                storagePath,
                message,
            });

            if (!isMissingBucketError(message)) {
                throw new Error(`PDF upload failed: ${message}`);
            }

            pdfUrl = null;
            storagePath = null;
        }

        const smtpHost = getEnv("SMTP_HOST");
        const smtpPort = Number(getEnv("SMTP_PORT") || "0");
        const smtpSecure = getEnv("SMTP_SECURE").toLowerCase() === "true";
        const smtpUser = getEnv("SMTP_USER");
        const smtpPass = getEnv("SMTP_PASS");
        const smtpFrom = getEnv("SMTP_FROM");

        log("smtp config check", {
            smtpHost: Boolean(smtpHost),
            smtpPort,
            smtpSecure,
            smtpUser: Boolean(smtpUser),
            smtpPass: Boolean(smtpPass),
            smtpFrom: Boolean(smtpFrom),
        });

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
            if (requestId) {
                await safeUpdateRequestRow(admin, requestId, {
                    status: "failed",
                    email_sent: false,
                    email_error: "SMTP не настроен",
                    result_text: pdfData.block1_text,
                    pdf_url: pdfUrl,
                    pdf_path: storagePath,
                    file_name: pdfFileName,
                    updated_at: new Date().toISOString(),
                });
            }

            return NextResponse.json(
                { ok: false, error: "SMTP не настроен." },
                { status: 500 }
            );
        }

        await sendSmtpMail({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUser,
            password: smtpPass,
            fromEmail: smtpFrom,
            fromName: getEnv("SMTP_FROM_NAME") || "Центр прогнозов Татьяны Ермолиной",
            to: email,
            subject: "Ваш расчёт: Уран в Близнецах",
            text:
                `Здравствуйте, ${fullName}!\n\n` +
                `Ваш персональный расчёт «Уран в Близнецах» готов.\n\n` +
                `${pdfData.block1_title}\n\n` +
                `${pdfData.block1_text}\n\n` +
                `${pdfData.reforms_title}\n` +
                pdfData.reforms.map((item, index) => `${index + 1}. ${item}`).join("\n") +
                `\n\n------------------------------\n` +
                `ЦЕНТР ПРОГНОЗОВ ТАТЬЯНЫ ЕРМОЛИНОЙ\n` +
                `ИП Ермолина Т.Н.\n` +
                `ОГРНИП 310618111700022\n` +
                `ИНН 300401721008`,
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                    <p>Здравствуйте, ${escapeHtml(fullName)}!</p>
                    <p>Ваш персональный расчёт <b>«Уран в Близнецах»</b> готов.</p>
                    <p>PDF-файл приложен к письму.</p>
            
                    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
            
                    <div style="font-size:13px;line-height:1.5;color:#6b7280;">
                        <p style="margin:0 0 8px 0;"><strong>ЦЕНТР ПРОГНОЗОВ ТАТЬЯНЫ ЕРМОЛИНОЙ</strong></p>
                        <p style="margin:0;">
                            ИП Ермолина Т.Н.<br>
                            ОГРНИП 310618111700022<br>
                            ИНН 300401721008
                        </p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: pdfFileName,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ],
        });

        log("email sent", {
            to: email,
            fileName: pdfFileName,
            pdfSize: pdfBuffer.length,
        });

        if (requestId) {
            await safeUpdateRequestRow(admin, requestId, {
                status: "sent",
                email_sent: true,
                email_error: null,
                result_text: pdfData.block1_text,
                pdf_url: pdfUrl,
                pdf_path: storagePath,
                file_name: pdfFileName,
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        return NextResponse.json({
            ok: true,
            already_exists: false,
            email_sent: true,
            email_error: null,
            message: "Расчёт успешно отправлен.",
            interpretation: pdfData.block1_text,
            pdf_url: pdfUrl,
            pdf_file_name: pdfFileName,
            pdf_base64: pdfBuffer.toString("base64"),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        log("fatal error", {
            message,
            stack: error instanceof Error ? error.stack : null,
            requestId,
            pdfUrl,
            storagePath,
            pdfFileName,
        });

        if (requestId) {
            try {
                await safeUpdateRequestRow(admin, requestId, {
                    status: "failed",
                    email_sent: false,
                    email_error: message,
                    result_text: pdfData?.block1_text ?? null,
                    pdf_url: pdfUrl,
                    pdf_path: storagePath,
                    file_name: pdfFileName,
                    updated_at: new Date().toISOString(),
                });
            } catch (updateError) {
                log("failed to update request row after fatal error", updateError);
            }
        }

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}