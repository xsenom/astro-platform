from collections import defaultdict
from datetime import datetime, timedelta
import logging
from random import choice
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import pytz
import requests
import swisseph as swe

from .astro_geo import (
    get_coordinates_smart,
    get_julian_day_utc,
    get_local_time_str,
    get_lunar_events_near_date,
    get_utc_offset,
)
from .geo_suggest import router as geo_router
from .payments import router as payments_router

load_dotenv()

logger = logging.getLogger("uvicorn")
app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # или ["*"] на время отладки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
DEFAULT_DATE_FORMAT = "%Y-%m-%d"
app.include_router(geo_router)
app.include_router(payments_router)
# Путь к эфемеридам
EPHE_PATH = "./ephe"
swe.set_ephe_path(EPHE_PATH)

# Классификации планет для орбусов
personal_planets = {"☉ Солнце", "🌙 Луна", "🖋 Меркурий", "💕 Венера", "⚔️ Марс"}
social_planets = {"🍀 Юпитер", "🕰 Сатурн"}
higher_planets = {"🌪 Уран", "🌊 Нептун", "♇ Плутон"}

PLANETS = {
    swe.SUN: "Солнце",
    swe.MOON: "Луна",
    swe.MERCURY: "Меркурий",
    swe.VENUS: "Венера",
    swe.MARS: "Марс",
    swe.JUPITER: "Юпитер",
    swe.SATURN: "Сатурн",
    swe.URANUS: "Уран",
    swe.NEPTUNE: "Нептун",
    swe.PLUTO: "Плутон"
}

ZODIAC_SIGNS = ["Овен","Телец","Близнецы","Рак","Лев","Дева","Весы","Скорпион","Стрелец","Козерог","Водолей","Рыбы"]

# Положение затмений в градусах зодиака
ECLIPSES = [
    {"type": "Лунное", "date": "2025-09-07", "pos_deg": 330 + 15.3833, "sign": "Рыбы"},
    {"type": "Солнечное", "date": "2025-09-21", "pos_deg": 180 - 0.9167, "sign": "Дева"},
]
ASPECTS = {
    0: "Соединение", 60: "Секстиль", 90: "Квадрат", 120: "Трин", 180: "Оппозиция"
}
# Карта объектов Swiss Ephemeris → названия
objects = {
    swe.SUN: "☉ Солнце",
    swe.MOON: "🌙 Луна",
    swe.MERCURY: "🖋 Меркурий",
    swe.VENUS: "💕 Венера",
    swe.MARS: "⚔️ Марс",
    swe.JUPITER: "🍀 Юпитер",
    swe.SATURN: "🕰 Сатурн",
    swe.URANUS: "🌪 Уран",
    swe.NEPTUNE: "🌊 Нептун",
    swe.PLUTO: "♇ Плутон"
}

# Натальные объекты (узлы, Лилит, Хирон)
natal_objects = {
    **objects,
    swe.MEAN_NODE: "☊ Лунный узел (средний)",
    swe.TRUE_NODE: "☋ Лунный узел "

}
SPECIAL_CLIENTS = [
    {
        "year": 1990, "month": 9, "day": 15,
        "hour": 12, "minute": 0,
        "city": "саратов"
    },
    {
        "year": 1976, "month": 5, "day": 20,
        "hour": 6, "minute": 55,
        "city": "нылга"
    }
]
# Знаки зодиака
zodiac_signs = [
    "♈ Овен", "♉ Телец", "♊ Близнецы", "♋ Рак", "♌ Лев", "♍ Дева",
    "♎ Весы", "♏ Скорпион", "♐ Стрелец", "♑ Козерог", "♒ Водолей", "♓ Рыбы"
]
ZODIAC_SIGNS_LIST = [
    "♈ Овен", "♉ Телец", "♊ Близнецы", "♋ Рак", "♌ Лев", "♍ Дева",
    "♎ Весы", "♏ Скорпион", "♐ Стрелец", "♑ Козерог", "♒ Водолей", "♓ Рыбы"
]

# Основные аспекты
aspects = {
    0: "Соединение",
    60: "Секстиль",
    90: "Квадрат",
    120: "Трин",
    180: "Оппозиция"
}
# Смещения в Зодиаке для проверки аспекта
aspect_zodiac_offsets = {
    "Соединение": [0],
    "Секстиль": [2, 4],
    "Квадрат": [3, 9],
    "Трин": [4, 8],
    "Оппозиция": [6]
}

# Расчёт аспектов
def calculate_aspects(
        natal_positions: Dict[str, float],
        transit_positions: Dict[str, float],
        natal_houses: Dict[str, int],
        transit_houses: Dict[str, int],
        allowed_transits: set = None
):
    found = []
    for natal_name, natal_pos in natal_positions.items():
        natal_sign = int(natal_pos // 30)
        natal_orb = get_planet_orb(natal_name)
        for transit_name, transit_pos in transit_positions.items():
            if allowed_transits and transit_name not in allowed_transits:
                continue
            transit_sign = int(transit_pos // 30)
            angle = abs(natal_pos - transit_pos) % 360
            sign_diff = abs(transit_sign - natal_sign) % 12
            transit_orb = get_planet_orb(transit_name)
            pair_orb = min(natal_orb, transit_orb)
            for ang, name in aspects.items():
                orb = abs(angle - ang)
                if orb <= pair_orb and sign_diff in aspect_zodiac_offsets[name]:
                    found.append({
                        "transit": transit_name,
                        "transit_house": transit_houses.get(transit_name),
                        "aspect": name,
                        "natal": natal_name,

                        "orb": round(orb, 2)
                    })
    return found

# ── Система домов (Equal) ────────────────────────────────────────────────────
def get_houses(jd: float, lat: float, lon: float) -> List[float]:
    """
    Возвращает куспиды домов:
    - при широтах ≤ 64° используется Placidus;
    - при широтах > 64° — Equal-система, где 10-й дом (индекс 9) = MC,
      остальные — через равные 30° от него.
    """
    if not (-90 <= lat <= 90):
        raise HTTPException(400, f"❌ Недопустимая широта: {lat}")
    if not (-180 <= lon <= 180):
        raise HTTPException(400, f"❌ Недопустимая долгота: {lon}")

    # Placidus для «низких» широт
    if abs(lat) <= 64.0:
        try:
            cusps, _ = swe.houses_ex(jd, lat, lon, b'P')
            return cusps
        except Exception as e:
            raise HTTPException(400, f"❌ Ошибка при расчете домов (Placidus): {e}")
    # Equal-дома от MC для «высоких» широт
    else:
        try:
            # ascmc[1] = Medium Coeli в градусах
            _, ascmc = swe.houses_ex(jd, lat, lon, b'E')
            mc_long = ascmc[1]

            # 10-й дом = MC; дальше по 30° вверх и вниз
            cusps = [ (mc_long + (i - 9) * 30.0) % 360 for i in range(12) ]

            print(f"[DEBUG] Высокая широта → Equal‐дома от MC")
            print(f"[DEBUG] MC = {mc_long:.2f}° → куспид X (i=9) = {cusps[9]:.2f}°")
            return cusps
        except Exception as e:
            raise HTTPException(400, f"❌ Ошибка при расчете домов (Equal от MC): {e}")

def get_house(long: float, cusps: List[float]) -> int:
    long = long % 360
    for i in range(12):
        start = cusps[i % 12] % 360
        end = cusps[(i + 1) % 12] % 360
        width = (end - start) % 360
        if (long - start) % 360 < width:
            return i + 1
    return 12

# ── Домоуправители и тематика ───────────────────────────────────────────────
sign_rulers = {i: p for i, p in enumerate([
    "⚔️ Марс","💕 Венера","🖋 Меркурий","🌙 Луна",
    "☉ Солнце","🖋 Меркурий","💕 Венера","⚔️ Марс",
    "🍀 Юпитер","🕰 Сатурн","🌪 Уран","🍀 Юпитер"
])}

def decimal_to_dms(degree: float) -> str:
    deg = int(degree)
    minutes_full = (degree - deg) * 60
    min_ = int(minutes_full)
    sec = int((minutes_full - min_) * 60)
    return f"{deg:02d}°{min_:02d}′{sec:02d}″"

def format_degree_sotis(decimal_deg: float) -> str:
    zodiac_signs = [
        "♈", "♉", "♊", "♋", "♌", "♍",
        "♎", "♏", "♐", "♑", "♒", "♓"
    ]
    sign_index = int(decimal_deg // 30)
    deg_in_sign = decimal_deg % 30
    deg = int(deg_in_sign)
    minutes_full = (deg_in_sign - deg) * 60
    min_ = int(minutes_full)
    sec = int((minutes_full - min_) * 60)

    return f"{zodiac_signs[sign_index]} {deg:02d}°{min_:02d}′{sec:02d}″"

def get_house_rulers(jd, lat, lon):
    cusps = get_houses(jd, lat, lon)
    return {i+1: sign_rulers[int(cusps[i]//30)%12] for i in range(12)}

topic_by_house = {5: "Дети/Творчество", 7: "Отношения", 10: "Карьера"}

def group_aspects_by_topics(asps, rulers):
    res = {}
    planet_to_h = defaultdict(list)
    for h, pl in rulers.items(): planet_to_h[pl].append(h)
    for a in asps:
        pl = a["natal"]
        for h in planet_to_h.get(pl, []):
            topic = topic_by_house.get(h)
            if topic:
                res.setdefault(topic, []).append(a)
    return res

@app.get("/natal", response_model=Dict)
async def get_natal_chart(
        year: int,
        month: int,
        day: int,
        hour: Optional[str] = None,
        minute: Optional[str] = None,
        city_name: str = ""
):
    def parse_time(val):
        try:
            if val is None:
                return None
            s = str(val).strip().lower()
            unknown_markers = {
                "я не знаю", "не знаю", "unknown", "null", "",
                "я не помню", "не помню"
            }
            if s in unknown_markers:
                return None
            return int(s)
        except Exception:
            return None

    hour_num = parse_time(hour)
    minute_num = parse_time(minute)
    use_houses = (hour_num is not None) and (minute_num is not None)

    try:
        lat, lon = get_coordinates_smart(city_name)

        # Если время не указано — подставляем 12:00 (можно 0:00), но дома НЕ выводим
        jd, utc_str, tz_name = get_julian_day_utc(
            year, month, day,
            hour_num if hour_num is not None else 12,
            minute_num if minute_num is not None else 0,
            lat, lon
        )

        flags = swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL

        result_lines = [
            f"Натальная карта ({city_name}, {lat:.4f}, {lon:.4f})",
            f"📍 Координаты: {lat:.4f}, {lon:.4f}",
            f"🕒 Часовой пояс: {tz_name}",
            f"🗓 UTC: {utc_str}"
        ]

        # Дома/ASC только если есть точное время
        if use_houses:
            cusps = get_houses(jd, lat, lon)
            asc_long = cusps[0]
            asc_sign = zodiac_signs[int(asc_long // 30)]
            asc_deg = asc_long % 30
            asc_deg_str = format_degree_sotis(asc_long)
            asc_str = f"🌅 Асцендент в {asc_sign} ({asc_deg:.2f}°) {asc_deg_str}"
            result_lines.append(asc_str)
        else:
            cusps = None
            asc_str = ""

        personal = []
        social = []
        transpersonal = []

        # Планеты (Солнце–Плутон)
        for obj, name in objects.items():
            # Узлы отдельно
            if obj in (swe.TRUE_NODE, swe.MEAN_NODE):
                continue
            try:
                pos, _ = swe.calc_ut(jd, obj, flags)
                lon_deg = pos[0]
                sign = zodiac_signs[int(lon_deg // 30)]
                deg_str = format_degree_sotis(lon_deg)  # ✅ градусы в знаке (DMS)
                retro = " (ретроградный)" if pos[3] < 0 else ""

                if use_houses and cusps is not None:
                    house = get_house(lon_deg, cusps)
                    entry = f"{name} в {sign} {deg_str} ({house} дом){retro}"
                else:
                    entry = f"{name} в {sign} {deg_str}{retro}"

                if name in personal_planets:
                    personal.append(entry)
                elif name in social_planets:
                    social.append(entry)
                elif name in higher_planets:
                    transpersonal.append(entry)
            except swe.Error:
                continue

        result_lines.append("👤 Личные планеты:")

        result_lines.extend(f"• {line}" for line in personal)
        result_lines.append("🏛 Социальные планеты:")

        result_lines.extend(f"• {line}" for line in social)
        result_lines.append("✨ Высшие планеты:")

        result_lines.extend(f"• {line}" for line in transpersonal)

        # ==== Лунные узлы (True Node) ====
        tn_pos, _ = swe.calc_ut(jd, swe.TRUE_NODE, flags)
        tn_long = tn_pos[0]
        tn_sign = zodiac_signs[int(tn_long // 30)]
        tn_deg_str = format_degree_sotis(tn_long)
        retro_tn = " (ретроградный)" if tn_pos[3] < 0 else ""

        sn_long = (tn_long + 180) % 360
        sn_sign = zodiac_signs[int(sn_long // 30)]
        sn_deg_str = format_degree_sotis(sn_long)

        # ✅ Южный узел всегда “с тем же движением”, что и Северный
        retro_sn = retro_tn

        if use_houses and cusps is not None:
            tn_house = get_house(tn_long, cusps)
            sn_house = get_house(sn_long, cusps)
            result_lines.append(f"☊ Северный узел в {tn_sign} {tn_deg_str} ({tn_house} дом){retro_tn}")
            result_lines.append(f"☋ Южный узел в {sn_sign} {sn_deg_str} ({sn_house} дом){retro_sn}")
        else:
            result_lines.append(f"☊ Северный узел в {tn_sign} {tn_deg_str}{retro_tn}")
            result_lines.append(f"☋ Южный узел в {sn_sign} {sn_deg_str}{retro_sn}")

        return {
            "natal_chart": "\n".join(result_lines),
            "ascendant": asc_str if use_houses else None,
            "utc": utc_str,
            "timezone": tz_name
        }

    except Exception as e:
        raise HTTPException(400, detail=str(e))

@app.get("/transits_day", response_model=List[Dict])
async def get_transits_day_theme(
        year: int,
        month: int,
        day: int,
        hour: int,
        minute: int,
        city_name: str,
        target_date: str = None
):
    """Прогноз на один день: аспекты от транзитных Солнца и Луны к 10 натальным планетам + Лунные события."""
    try:
        zodiac_signs = [
            "♈ Овен", "♉ Телец", "♊ Близнецы", "♋ Рак", "♌ Лев", "♍ Дева",
            "♎ Весы", "♏ Скорпион", "♐ Стрелец", "♑ Козерог", "♒ Водолей", "♓ Рыбы"
        ]

        def get_zodiac_sign_local(degree: float) -> str:
            index = int(degree // 30) % 12
            return zodiac_signs[index]

        lat, lon = get_coordinates_smart(city_name)
        utc_off_birth = get_utc_offset(year, month, day, hour, minute, lat, lon)
        jd_natal = swe.julday(
            year, month, day,
            hour + minute / 60.0 - utc_off_birth,
            swe.GREG_CAL
        )

        natal_positions = {}
        allowed_natal = {
            "☉ Солнце", "🌙 Луна", "🖋 Меркурий", "💕 Венера", "⚔️ Марс",
            "🍀 Юпитер", "🕰 Сатурн", "🌪 Уран", "🌊 Нептун", "♇ Плутон"
        }
        for obj, name in objects.items():
            if name in allowed_natal:
                body, _ = swe.calc_ut(jd_natal, obj)
                natal_positions[name] = body[0]

        if target_date:
            date = datetime.strptime(target_date, DEFAULT_DATE_FORMAT)
        else:
            now_utc = datetime.utcnow()
            utc_off_now = get_utc_offset(now_utc.year, now_utc.month, now_utc.day, 0, 0, lat, lon)
            date = now_utc + timedelta(hours=utc_off_now)

        aspect_meanings = {
            "Соединение": "усиление влияния планет",
            "Трин": "позитивная поддержка",
            "Секстиль": "легкая возможность",
            "Квадрат": "напряжение и вызовы",
            "Оппозиция": "противоречия и внешние конфликты",
        }

        planetary_combinations = {
            ("🌙 Луна", "💕 Венера"): "день для любви и приятных эмоций",
            ("🌙 Луна", "⚔️ Марс"): "эмоциональная активность, споры",
            ("🌙 Луна", "🖋 Меркурий"): "день для общения и коротких поездок",
            ("🌙 Луна", "🍀 Юпитер"): "расширение горизонтов, удачные моменты",
            ("🌙 Луна", "🕰 Сатурн"): "эмоциональная сдержанность",
            ("🌙 Луна", "♇ Плутон"): "эмоциональные трансформации",
            ("☉ Солнце", "🖋 Меркурий"): "успех в переговорах, ясность мысли",
            ("☉ Солнце", "⚔️ Марс"): "действие и борьба",
            ("☉ Солнце", "🍀 Юпитер"): "удачные возможности, везение",
            ("☉ Солнце", "🕰 Сатурн"): "ответственность и тесты",
            ("☉ Солнце", "🌪 Уран"): "новшества и неожиданные перемены",
        }

        aspects_dict = {
            0:   "Соединение", 60:  "Секстиль",
            90:  "Квадрат",    120: "Трин",
            180: "Оппозиция",  240: "Трин",
            270: "Квадрат",    300: "Секстиль"
        }

        orb = 3.5
        flags = swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL
        aspects_map = {}

        for hour in range(24):
            utc_off = get_utc_offset(date.year, date.month, date.day, hour, 0, lat, lon)
            jd = swe.julday(date.year, date.month, date.day, hour - utc_off, swe.GREG_CAL)

            transit_positions = {}
            for obj, name in objects.items():
                if name not in {"☉ Солнце", "🌙 Луна"}:
                    continue
                body, _ = swe.calc_ut(jd, obj, flags)
                transit_positions[name] = body[0]

            for tr_name, tr_pos in transit_positions.items():
                for nat_name, nat_pos in natal_positions.items():
                    angle = (tr_pos - nat_pos + 360) % 360
                    for asp_angle, asp_name in aspects_dict.items():
                        diff = ((angle - asp_angle + 180) % 360) - 180
                        if abs(diff) <= orb:
                            key = (tr_name, nat_name, asp_name)
                            if key not in aspects_map:
                                aspects_map[key] = {
                                    "transit": tr_name,
                                    "natal": nat_name,
                                    "aspect_type": asp_name
                                }

        aspects_text = []
        for v in aspects_map.values():
            tr = v["transit"]
            nt = v["natal"]
            at = v["aspect_type"]
            desc = aspect_meanings[at]
            spec = planetary_combinations.get((tr, nt))
            text = f"{tr} делает {at.lower()} к {nt}"
            if spec:
                text += f" — {spec} ({desc})."
            else:
                text += f" — {desc}."
            aspects_text.append(text)

        if not aspects_text:
            fallback = [
                "Сегодня лучше уделить внимание себе и восстановлению.",
                "Подходящий день для повседневных дел и внутреннего баланса.",
                "Можно просто наслаждаться моментом — день без астрологических напряжений.",
                "Подходящее время для спокойствия, расслабления и интуитивных решений.",
                "Хороший день, чтобы навести порядок в мыслях и пространстве."
            ]
            aspects_text = [choice(fallback)]

        # 🌕 Лунные события
        lunar_events_raw = get_lunar_events_near_date(date)
        lunar_events = []

        if lunar_events_raw:
            for event in lunar_events_raw:
                type_ = event["type"]
                description = (
                    "время начинать новое" if type_ == "🌑 Новолуние"
                    else "время завершений и кульминаций"
                )
                formatted = f"{type_} — {description} ({event['date'].strftime('%d.%m.%Y')})"
                aspects_text.insert(0, formatted)
                lunar_events.append({
                    "type": type_,
                    "date": event["date"].strftime("%Y-%m-%d"),
                    "description": description
                })
        else:
            # Найдём ближайшее новолуние или полнолуние (вперёд на 30 дней)
            jd_start = swe.julday(date.year, date.month, date.day, 0.0, swe.GREG_CAL)
            found = None
            for offset in range(1, 31):  # 30 дней вперёд
                jd = jd_start + offset
                moon, _ = swe.calc_ut(jd, swe.MOON)
                sun, _ = swe.calc_ut(jd, swe.SUN)
                angle = abs((moon[0] - sun[0]) % 360)
                if angle < 1.5:
                    found = ("🌑 Новолуние", date + timedelta(days=offset))
                    break
                elif abs(angle - 180) < 1.5:
                    found = ("🌕 Полнолуние", date + timedelta(days=offset))
                    break

            if found:
                type_, next_date = found
                formatted = f"{type_} — ближайшее событие {next_date.strftime('%d.%m.%Y')}"
                aspects_text.insert(0, formatted)
                lunar_events.append({
                    "type": type_,
                    "date": next_date.strftime("%Y-%m-%d"),
                    "description": f"Следующее событие: {type_.strip()} {next_date.strftime('%d.%m.%Y')}"
                })
            else:
                lunar_events.append({
                    "type": "ℹ️",
                    "date": "",
                    "description": "В ближайшие 30 дней не найдено лунных событий"
                })

        sun_sign = f"знак транзитного Солнца: {get_zodiac_sign_local(transit_positions.get('☉ Солнце', 0))}"
        moon_sign = f"знак транзитной Луны: {get_zodiac_sign_local(transit_positions.get('🌙 Луна', 0))}"
        day_summary = f"Сегодня {date.strftime('%d.%m.%Y')}: {sun_sign}, {moon_sign}."

        aspects_text = [f"{i + 1}. {line}" for i, line in enumerate(aspects_text)]

        return [{
            "date": date.strftime(DEFAULT_DATE_FORMAT),
            "sun_sign": sun_sign,
            "moon_sign": moon_sign,
            "aspects_text": aspects_text,
            "day_summary": day_summary,
            "lunar_events": lunar_events
        }]

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/transits_week_theme", response_model=Dict)
async def get_transits_week_theme(
        year: int, month: int, day: int, hour: int, minute: int, city_name: str
):
    """Тематический прогноз на каждый день недели: аспекты только от транзитных Солнца и Луны к 10 натальным планетам."""
    try:
        lat, lon = get_coordinates_smart(city_name)
        utc_offset = get_utc_offset(year, month, day, hour, minute, lat, lon)
        jd_natal = swe.julday(year, month, day, hour + minute / 60.0 - utc_offset, swe.GREG_CAL)

        # Натальные позиции (только 10 основных планет)
        natal_positions = {}
        for obj, name in objects.items():
            body, _ = swe.calc_ut(jd_natal, obj)
            natal_positions[name] = body[0]

        # Темы по натальным планетам
        planet_themes = {
            "☉ Солнце": "самореализация и воля",
            "🌙 Луна": "эмоции и внутренний мир",
            "🖋 Меркурий": "мышление и общение",
            "💕 Венера": "чувства и отношения",
            "⚔️ Марс": "действия и мотивация",
            "🍀 Юпитер": "рост и возможности",
            "🕰 Сатурн": "ответственность и структура",
            "🌪 Уран": "перемены и свобода",
            "🌊 Нептун": "интуиция и вдохновение",
            "♇ Плутон": "трансформация и глубинные процессы"
        }

        # Собираем данные по каждому дню
        today = datetime.utcnow()
        week_dates = [today + timedelta(days=i) for i in range(7)]
        daily_results = []

        for date in week_dates:
            themes_counter = {}

            for hour in [0, 6, 12, 18]:  # каждые 6 часов
                jd = swe.julday(date.year, date.month, date.day, hour - utc_offset, swe.GREG_CAL)

                # Транзиты только Солнца и Луны
                transit_positions = {}
                for obj, name in objects.items():
                    if name not in {"☉ Солнце", "🌙 Луна"}:
                        continue
                    body, _ = swe.calc_ut(jd, obj)
                    transit_positions[name] = body[0]

                # Сравниваем с натальными позициями
                for transit_name, transit_pos in transit_positions.items():
                    for natal_name, natal_pos in natal_positions.items():
                        angle = (transit_pos - natal_pos + 360) % 360
                        for asp_angle in aspects:
                            diff = (angle - asp_angle + 360) % 360
                            if diff > 180:
                                diff -= 360
                            if -3.0 <= diff <= 3.0:
                                theme = planet_themes.get(natal_name)
                                if theme:
                                    themes_counter[theme] = themes_counter.get(theme, 0) + 1

            # Формируем текстовое описание дня
            if themes_counter:
                lines = [f"📅 {date.strftime('%d.%m.%Y')} — выраженные темы:"]
                for theme, count in sorted(themes_counter.items(), key=lambda x: x[1], reverse=True):
                    lines.append(f"• {theme.capitalize()} ({count} проявлений)")
            else:
                lines = [f"📅 {date.strftime('%d.%m.%Y')} — выраженных тем не зафиксировано."]

            daily_results.append({
                "date": date.strftime(DEFAULT_DATE_FORMAT),
                "themes": themes_counter,
                "summary_text": "\n".join(lines)
            })

        return {
            "weekly_theme_forecast": daily_results
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/transits_week", response_model=Dict)
async def get_transits_week(
        year: int, month: int, day: int, hour: int, minute: int, city_name: str,
        target_date: str = None
):
    """Прогноз транзитов на неделю (7 дней подряд)."""
    return await calculate_transits_by_dates(year, month, day, hour, minute, city_name, mode="week", target_date=target_date)

@app.get("/transits_month", response_model=Dict)
async def get_transits_month(
        year: int, month: int, day: int, hour: int, minute: int, city_name: str
):
    """Месячный прогноз: только точные благоприятные аспекты от Солнца, Венеры и Юпитера, с темами."""
    try:
        lat, lon = get_coordinates_smart(city_name)
        utc_offset = get_utc_offset(year, month, day, hour, minute, lat, lon)
        jd_natal = swe.julday(year, month, day, hour + minute / 60.0 - utc_offset, swe.GREG_CAL)

        natal_positions = {}
        allowed_natal = {
            "☉ Солнце", "🌙 Луна", "🖋 Меркурий", "💕 Венера", "⚔️ Марс",
            "🍀 Юпитер", "🕰 Сатурн", "🌪 Уран", "🌊 Нептун", "♇ Плутон"
        }
        for obj, name in objects.items():
            if name in allowed_natal:
                body, _ = swe.calc_ut(jd_natal, obj)
                natal_positions[name] = body[0]

        planet_themes = {
            "☉ Солнце": "самореализация и уверенность",
            "🌙 Луна": "эмоции и внутренний настрой",
            "🖋 Меркурий": "мышление и коммуникация",
            "💕 Венера": "отношения и гармония",
            "⚔️ Марс": "действия и энергия",
            "🍀 Юпитер": "удача и рост",
            "🕰 Сатурн": "ответственность и зрелость",
            "🌪 Уран": "новизна и перемены",
            "🌊 Нептун": "интуиция и вдохновение",
            "♇ Плутон": "глубокие преобразования"
        }

        aspect_meanings = {
            "Трин": "поддержка и лёгкость",
            "Секстиль": "возможности и гармония",
            "Соединение": "сильное выражение темы"
        }

        good_aspects = {
            0: "Соединение",
            60: "Секстиль",
            120: "Трин",
            240: "Трин",
            300: "Секстиль"
        }

        allowed_transits = {"☉ Солнце", "🍀 Юпитер", "💕 Венера"}

        today = datetime.utcnow().date()
        results = []

        for i in range(30):
            current_date = today + timedelta(days=i)
            jd = swe.julday(current_date.year, current_date.month, current_date.day, 12.0, swe.GREG_CAL)

            transit_positions = {}
            for obj, name in objects.items():
                if name in allowed_transits:
                    body, _ = swe.calc_ut(jd, obj)
                    transit_positions[name] = body[0]

            for transit_name, transit_pos in transit_positions.items():
                for natal_name, natal_pos in natal_positions.items():
                    angle = (transit_pos - natal_pos + 360) % 360
                    for asp_angle, asp_name in good_aspects.items():
                        diff = ((angle - asp_angle + 180) % 360) - 180
                        if transit_name == "🍀 Юпитер" and natal_name == "♇ Плутон":
                            print(f"🍀 Юпитер -> ♇ Плутон | {current_date} | angle={angle:.2f} | aspect={asp_name} | diff={diff:.2f}")
                        orb = 1.0 if natal_name == "🌙 Луна" else 0.5
                        if abs(diff) <= orb:
                            theme = planet_themes.get(natal_name)
                            meaning = aspect_meanings[asp_name]
                            if theme:
                                results.append({
                                    "date": current_date.strftime(DEFAULT_DATE_FORMAT),
                                    "transit": transit_name,
                                    "natal": natal_name,
                                    "theme": theme,
                                    "description": f"{transit_name} формирует {asp_name.lower()} к {natal_name} — день благоприятен для: {theme} ({meaning})"
                                })

        return {
            "month_transits": results
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Функция форматирования адреса для кнопки
def format_address(loc):
    parts = []
    addr = loc.raw.get("address", {})
    for key in ["city", "town", "village", "hamlet", "municipality", "county", "state", "region", "country"]:
        val = addr.get(key)
        if val and val not in parts:
            parts.append(val)
    return ", ".join(parts)
@app.get("/ephemerides", response_model=Dict)
async def get_ephemerides(
        year: int, month: int, day: int, hour: int, minute: int, city_name: str,
        start_year: int = 2026, start_month: int = 1, start_day: int = 1,
        horizon_days: int = 365
):
    """
    Прогноз эфемерид с шагом 21 день, начиная с заданной даты (по умолчанию 2026-01-01).
    Учитываются аспекты от транзитных: Плутон, Нептун, Уран, Сатурн, Юпитер, Марс.
    Орбисы: Марс ±3°, остальные ±1°. Внутри окна сканируется каждый день на 12:00 местного.
    """
    try:
        # ---- хелперы ---------------------------------------------------------
        def signed_delta(a: float, b: float) -> float:
            # кратчайшая подписанная разница углов a-b в диапазоне [-180, +180)
            return ((a - b + 180.0) % 360.0) - 180.0

        def aspect_delta(angle: float, target: int) -> float:
            # минимальная разница до угла аспекта target (учёт комплементарного 360 - target)
            base = abs(signed_delta(angle, float(target)))
            if target in (0, 180):
                return base
            comp = abs(signed_delta(angle, float(360 - target)))
            return min(base, comp)

        # ---- подготовка исходных данных -------------------------------------
        lat, lon = get_coordinates_smart(city_name)
        utc_offset = get_utc_offset(year, month, day, hour, minute, lat, lon)

        natal_jd = swe.julday(
            year, month, day,
            hour + minute / 60.0 - utc_offset,
            swe.GREG_CAL
        )

        # Натальные позиции (10 планет)
        natal_positions: Dict[str, float] = {}
        for obj, name in objects.items():
            body, _ = swe.calc_ut(natal_jd, obj, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL)
            natal_positions[name] = body[0]

        # Управитель 7 дома для пометки «личное»
        natal_cusps = get_houses(natal_jd, lat, lon)
        house_rulers_map = get_house_rulers(natal_jd, lat, lon)
        ruler_of_7 = house_rulers_map[7]

        # ---- параметры окна/периода -----------------------------------------
        window = 21
        start_date = datetime(start_year, start_month, start_day)
        EPS = 1e-6

        ASPECTS_BASE = {
            0: "Соединение", 60: "Секстиль", 90: "Квадрат", 120: "Трин", 180: "Оппозиция"
        }
        SLOW_TRANSITS = {"🍀 Юпитер", "🕰 Сатурн", "🌪 Уран", "🌊 Нептун", "♇ Плутон", "⚔️ Марс"}

        forecast_results = []

        # цикл по окнам до исчерпания горизонта
        for day_offset in range(0, horizon_days, window):
            period_start = start_date + timedelta(days=day_offset)
            span = min(window, horizon_days - day_offset)
            period_end = period_start + timedelta(days=span - 1)

            # копим лучшее попадание по каждому (транзит, натал, аспект) внутри окна
            best_hits: Dict[tuple, Dict] = {}

            for d in range(span):
                cur = period_start + timedelta(days=d)
                # считаем на 12:00 местного времени → UTC час = 12.0 - utc_offset
                jd = swe.julday(cur.year, cur.month, cur.day, 12.0 - utc_offset, swe.GREG_CAL)

                # транзитные позиции — только медленные
                transit_positions: Dict[str, float] = {}
                for obj, name in objects.items():
                    if name not in SLOW_TRANSITS:
                        continue
                    body, _ = swe.calc_ut(jd, obj, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL)
                    transit_positions[name] = body[0]

                # сравнение транзит → натал
                for t_name, t_pos in transit_positions.items():
                    for n_name, n_pos in natal_positions.items():
                        angle = (t_pos - n_pos + 360.0) % 360.0
                        # орбис по транзитной планете
                        orb_limit = 3.0 if t_name == "⚔️ Марс" else 1.0

                        for ang, asp_name in ASPECTS_BASE.items():
                            delta = aspect_delta(angle, ang)
                            if delta <= orb_limit + EPS:
                                key = (t_name, n_name, asp_name)
                                hit = {
                                    "transit": t_name,
                                    "natal": n_name,
                                    "aspect": asp_name,
                                    "angle": round(angle, 2),
                                    "orb": round(delta, 2),
                                    "date": cur.strftime(DEFAULT_DATE_FORMAT),
                                }
                                # оставляем попадание с минимальным орбисом
                                if key not in best_hits or delta < best_hits[key]["orb"] - EPS:
                                    best_hits[key] = hit

            aspects_found = list(best_hits.values())

            # выделяем «ключевые» и «личные»
            important_transits, personal_transits = [], []

            key_aspects = [
                ("🍀 Юпитер", "♇ Плутон", "Квадрат"),
                ("🌊 Нептун", "☉ Солнце", "Секстиль"),
                ("🌊 Нептун", "🌪 Уран", "Трин"),
                ("🌪 Уран", "☉ Солнце", "Трин"),
                ("🌪 Уран", "🌪 Уран", "Оппозиция"),
            ]

            for asp in aspects_found:
                t, n, a, orb = asp["transit"], asp["natal"], asp["aspect"], asp["orb"]

                for kt, kn, ka in key_aspects:
                    if t == kt and n == kn and a == ka and orb <= 1.0 + EPS:
                        flag = dict(asp)
                        flag["highlight"] = True
                        flag["theme"] = "ключевые транзиты"
                        important_transits.append(flag)

                if n == ruler_of_7:
                    flag = dict(asp)
                    flag["highlight"] = True
                    flag["theme"] = "личное"
                    personal_transits.append(flag)

            if aspects_found or important_transits or personal_transits:
                asc_long = natal_cusps[0]
                asc_sign = ZODIAC_SIGNS_LIST[int(asc_long // 30)]
                asc_deg = asc_long % 30.0
                period_str = f"с {period_start.strftime('%d %B')} по {period_end.strftime('%d %B')}"

                forecast_results.append({
                    "period": period_str,
                    "aspects": aspects_found,  # лучшие по орбису в каждом окне
                    "ascendant": f"{asc_sign} ({asc_deg:.2f}°)",
                    "themes": {
                        "ключевые": important_transits,
                        "личное": personal_transits
                    }
                })

        local_time_str, timezone_str = get_local_time_str(year, month, day, hour, minute, lat, lon)
        utc_offset_str = f"{utc_offset:+.0f}"

        return {
            "ephemerides": forecast_results,
            "local_time": local_time_str,
            "timezone": timezone_str,
            "utc_offset": utc_offset_str
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def parse_month(month_raw):
    MONTHS = {
        "январь": 1, "февраль": 2, "март": 3, "апрель": 4,
        "май": 5, "июнь": 6, "июль": 7, "август": 8,
        "сентябрь": 9, "октябрь": 10, "ноябрь": 11, "декабрь": 12
    }
    if isinstance(month_raw, int):
        return month_raw
    if isinstance(month_raw, str):
        return MONTHS.get(month_raw.strip().lower())
    return None

@app.post("/salebot/lunar_events")
async def handle_salebot_lunar_events(request: Request):
    try:
        data = await request.json()
        logger.info("Тело запроса от Salebot (лунные события): %s", data)

        year = int(data.get("год"))
        month_raw = data.get("месяц")
        month = parse_month(month_raw)
        if not month:
            raise HTTPException(status_code=400, detail=f"Некорректный месяц: {month_raw}")
        day = int(data.get("день"))
        city = data.get("место_рождения", "Москва")

        lat, lon = get_coordinates_smart(city)
        lunar_events = get_lunar_events(year, month, day, lat, lon)

        reply = {
            "user_id": data.get("platform_id"),
            "message": data.get("возврат", "Лунные события и их толкование"),
            "group_id": data.get("group"),
            "array": [e["description"] for e in lunar_events],
            "array_rod": ["🌕 Лунные события"] + [e["summary"] for e in lunar_events],
        }

        api_key = data.get("api_key")
        if api_key:
            salebot_url = f"https://chatter.salebot.pro/api/{api_key}/tg_callback"
            headers = {"Content-Type": "application/json"}
            try:
                requests.post(salebot_url, json=reply, headers=headers, timeout=8)
            except Exception as e:
                logger.warning("Не удалось отправить в Salebot: %s", e)

        return {"status": "ok", "count": len(lunar_events)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Ошибка в /salebot/lunar_events: %s", str(e))
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/saturn_summer", response_model=Dict)
async def get_jupiter_aspects(year: int, month: int, day: int, hour: int, minute: int, city_name: str):
    """Аспекты Юпитера к натальным планетам ТОЛЬКО когда Юпитер находится в ♋ Раке — с 10.06.2025 по 30.06.2026."""
    try:
        lat, lon = get_coordinates_smart(city_name)
        utc_offset = get_utc_offset(year, month, day, hour, minute, lat, lon)
        jd_natal = swe.julday(year, month, day, hour + minute / 60.0 - utc_offset, swe.GREG_CAL)

        # Натальные планеты (Солнце–Плутон)
        natal_positions = {}
        allowed_natal = {
            "☉ Солнце", "🌙 Луна", "🖋 Меркурий", "💕 Венера", "⚔️ Марс",
            "🍀 Юпитер", "🕰 Сатурн", "🌪 Уран", "🌊 Нептун", "♇ Плутон"
        }
        for obj, name in objects.items():
            if name in allowed_natal:
                pos, _ = swe.calc_ut(jd_natal, obj)
                natal_positions[name] = pos[0]

        # Период анализа
        start = datetime(2025, 6, 10)
        end = datetime(2026, 6, 30)
        orb = 1.0  # Орбис для аспектов

        # Поддерживаемые аспекты
        aspects_dict = {
            0: "Соединение", 60: "Секстиль", 90: "Квадрат",
            120: "Трин", 180: "Оппозиция", 240: "Трин",
            270: "Квадрат", 300: "Секстиль"
        }

        summary_parts = []
        seen = set()

        for i in range((end - start).days + 1):
            date = start + timedelta(days=i)
            for hour in [0, 6, 12, 18]:
                jd = swe.julday(date.year, date.month, date.day, hour, swe.GREG_CAL)
                transit_jupiter, _ = swe.calc_ut(jd, swe.JUPITER)
                jup_long = transit_jupiter[0]

                # ⛔ Фильтр: Юпитер должен быть в ♋ Раке
                sign_index = int(jup_long // 30)
                if sign_index != 3:
                    continue

                for nat_name, nat_long in natal_positions.items():
                    angle = (jup_long - nat_long + 360) % 360
                    for asp_angle, asp_name in aspects_dict.items():
                        diff = ((angle - asp_angle + 180) % 360) - 180
                        if abs(diff) <= orb:
                            key = (date, asp_name, nat_name)
                            if key not in seen:
                                seen.add(key)
                                summary_parts.append(
                                    f"{date.strftime('%d.%m.%Y')} {hour:02d}:00 — {asp_name} — {nat_name}"
                                )

        summary_str = " | ".join(summary_parts)

        return {
            "period": "10.06.2025 – 30.06.2026",
            "themes": summary_str,
            "summary": f"Всего аспектов при Юпитере в ♋ Раке: {len(summary_parts)}"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ──────────────────────────────────────────────────────────
# Код для определения управителей домов

sign_rulers = {
    0: "⚔️ Марс",     # Овен (0)
    1: "💕 Венера",    # Телец (1)
    2: "🖋 Меркурий",  # Близнецы (2)
    3: "🌙 Луна",      # Рак (3)
    4: "☉ Солнце",    # Лев (4)
    5: "🖋 Меркурий",  # Дева (5)
    6: "💕 Венера",    # Весы (6)
    7: "⚔️ Марс",     # Скорпион (7)
    8: "🍀 Юпитер",    # Стрелец (8)
    9: "🕰 Сатурн",    # Козерог (9)
    10: "🌪 Уран",     # Водолей (10)
    11: "🍀 Юпитер"    # Рыбы (11)
}

def get_house_rulers(jd: float, lat: float, lon: float) -> Dict[int, str]:
    """
    Возвращает словарь {номер_дома: 'планета-управитель'},
    определяя знак на куспиде каждого дома и подставляя
    классического/современного управителя из sign_rulers.
    """
    cusps = get_houses(jd, lat, lon)
    house_rulers = {}
    for i in range(12):
        cusp_long = cusps[i]
        sign_index = int(cusp_long // 30) % 12
        ruler_planet = sign_rulers[sign_index]
        house_rulers[i+1] = ruler_planet
    return house_rulers

topic_by_house = {
    5: "Дети/Творчество",
    7: "Отношения",
    10: "Карьера"
    # Дополните по желанию...
}

def group_aspects_by_topics(aspects_list: list, house_rulers: Dict[int, str]) -> Dict[str, list]:
    """
    На вход: aspects_list - список аспектов.
    house_rulers - {номер_дома: 'Планета-управитель'}.
    Выдаёт словарь {тема: [список_аспектов]}.
    """
    result = {}
    # Разворачиваем: какая планета управляет каким(и) домом(ами)
    planet_to_houses = {}
    for house_num, planet_name in house_rulers.items():
        planet_to_houses.setdefault(planet_name, []).append(house_num)

    for aspect in aspects_list:
        natal_planet = aspect["natal"]
        # Если эта натальная планета управляет каким-то домом
        if natal_planet in planet_to_houses:
            for h in planet_to_houses[natal_planet]:
                # Если этот дом связан с темой
                if h in topic_by_house:
                    topic = topic_by_house[h]
                    if topic not in result:
                        result[topic] = []
                    result[topic].append(aspect)
    return result

@app.get("/eclipse_aspects")
def eclipse_aspects(
        year: int = Query(...), month: int = Query(...), day: int = Query(...),
        hour: int = Query(...), minute: int = Query(...), city: str = Query(...)
):
    # Получаем координаты города
    from geopy.geocoders import Nominatim
    geolocator = Nominatim(user_agent="astro_eclipse")
    location = geolocator.geocode(city)
    if not location:
        raise HTTPException(400, f"Не найден город: {city}")
    lat, lon = location.latitude, location.longitude

    # Расчёт натальной карты
    tz = pytz.timezone("Europe/Moscow")  # лучше сделать поиск по базе!
    dt = datetime(year, month, day, hour, minute)
    dt_utc = tz.localize(dt).astimezone(pytz.utc)
    jd = swe.julday(dt_utc.year, dt_utc.month, dt_utc.day, dt_utc.hour + dt_utc.minute/60.0, swe.GREG_CAL)

    natal_pos = {}
    for pl, name in PLANETS.items():
        pos, _ = swe.calc_ut(jd, pl)
        natal_pos[name] = pos[0]

    found = []
    for eclipse in ECLIPSES:
        for pl_name, pl_deg in natal_pos.items():
            for asp_angle, asp_name in ASPECTS.items():
                diff = ((eclipse["pos_deg"] - pl_deg + 360) % 360)
                if diff > 180: diff = 360 - diff

                # Выбор орбиса
                if eclipse["type"] == "Солнечное":
                    orb_min = -10
                    orb_max = 2
                else:
                    orb_min = -12
                    orb_max = 4

                delta = diff - asp_angle
                if orb_min <= delta <= orb_max:
                    found.append({
                        "eclipse": eclipse["type"],
                        "eclipse_date": eclipse["date"],
                        "aspect": asp_name,
                        "planet": pl_name,
                        "planet_degree": f"{pl_deg:.2f}°",
                        "eclipse_degree": f"{eclipse['pos_deg']:.2f}° {eclipse['sign']}",
                        "diff": round(delta, 2)
                    })

    # Тема жизни по планете (кратко)
    themes = {
        "Солнце": "Самореализация, эго, воля, здоровье",
        "Луна": "Эмоции, дом, семья, подсознание",
        "Меркурий": "Мысли, коммуникация, обучение",
        "Венера": "Отношения, любовь, финансы",
        "Марс": "Активность, действия, конкуренция",
        "Юпитер": "Развитие, успех, дальние горизонты",
        "Сатурн": "Долг, работа, ограничения, зрелость",
        "Уран": "Изменения, свобода, неожиданные события",
        "Нептун": "Вдохновение, иллюзии, мистицизм",
        "Плутон": "Трансформация, кризисы, сила"
    }
    recommendations = {
        "Соединение": "Максимум внимания к сфере этой планеты. События могут быть судьбоносными.",
        "Трин": "Возможности для гармоничного обновления.",
        "Секстиль": "Благоприятные шансы, стоит проявить инициативу.",
        "Квадрат": "Испытания, важные решения. Не игнорируйте проблему.",
        "Оппозиция": "Внешние вызовы, балансируйте между крайностями."
    }

    result = []
    for asp in found:
        theme = themes.get(asp["planet"], "Общая тема")
        rec = recommendations.get(asp["aspect"], "")
        result.append({
            "eclipse": asp["eclipse"],
            "date": asp["eclipse_date"],
            "aspect": asp["aspect"],
            "planet": asp["planet"],
            "theme": theme,
            "recommendation": rec,
            "period": "07.08.2025 — 21.10.2025"
        })

    return {
        "eclipse_aspects": result,
        "explanation": "Найденные аспекты от затмений к вашим натальным планетам. Период влияния: 07.08.2025 — 21.10.2025."
    }

from datetime import datetime as _dt

def group_events_into_periods(events: List[Dict]) -> List[Dict]:
    """
    Склеивает повторяющиеся аспекты в подряд идущие даты в периоды.
    Ключ склейки: (transit, natal, aspect, note).
    Статистика: count, min_orb, max_orb, avg_orb.
    """
    if not events:
        return []

    # сортируем по (ключ, дата)
    def _key(ev):
        return (ev["transit"], ev["natal"], ev["aspect"], ev.get("note", ""))

    events_sorted = sorted(
        events,
        key=lambda e: (_key(e), e["date"])
    )

    periods = []
    cur = None
    prev_date = None

    for ev in events_sorted:
        ev_date = _dt.strptime(ev["date"], DEFAULT_DATE_FORMAT).date()
        k = _key(ev)
        if cur is None:
            cur = {
                "transit": ev["transit"],
                "natal": ev["natal"],
                "aspect": ev["aspect"],
                "note": ev.get("note", ""),
                "start_date": ev["date"],
                "end_date": ev["date"],
                "count": 1,
                "min_orb": ev["orb"],
                "max_orb": ev["orb"],
                "sum_orb": ev["orb"],
            }
            prev_date = ev_date
            continue

        if (_key(cur) == k) and (ev_date == prev_date + timedelta(days=1)):
            # продолжаем период
            cur["end_date"] = ev["date"]
            cur["count"] += 1
            cur["min_orb"] = min(cur["min_orb"], ev["orb"])
            cur["max_orb"] = max(cur["max_orb"], ev["orb"])
            cur["sum_orb"] += ev["orb"]
            prev_date = ev_date
        else:
            # закрываем предыдущий и открываем новый
            cur["avg_orb"] = round(cur["sum_orb"] / cur["count"], 3)
            del cur["sum_orb"]
            periods.append(cur)

            cur = {
                "transit": ev["transit"],
                "natal": ev["natal"],
                "aspect": ev["aspect"],
                "note": ev.get("note", ""),
                "start_date": ev["date"],
                "end_date": ev["date"],
                "count": 1,
                "min_orb": ev["orb"],
                "max_orb": ev["orb"],
                "sum_orb": ev["orb"],
            }
            prev_date = ev_date

    # финализируем последний
    if cur:
        cur["avg_orb"] = round(cur["sum_orb"] / cur["count"], 3)
        del cur["sum_orb"]
        periods.append(cur)

    # удобная сортировка: по стартовой дате
    periods.sort(key=lambda p: p["start_date"])
    return periods

DOMAIN_CONFIG = {
    "love": {
        "title": "Годовой прогноз на любовь",
        "transits": {"💕 Венера", "☉ Солнце", "⚔️ Марс", "🌊 Нептун"},
        "orbs": {
            "☉ Солнце": 3.0,
            "💕 Венера": 2.0,
            "⚔️ Марс": 2.0,
            "🌊 Нептун": 1.0
        },
        "aspect_meanings": {
            "Соединение": "сильное проявление чувств/темы",
            "Секстиль": "лёгкие шансы, симпатии",
            "Квадрат": "трения, ревность, испытания",
            "Трин": "гармония, притяжение",
            "Оппозиция": "внешние вызовы, баланс интересов",
        },
    },
    "career": {
        "title": "Годовой прогноз на карьеру",
        "transits": {"🕰 Сатурн", "🍀 Юпитер", "⚔️ Марс", "♇ Плутон", "🌪 Уран"},
        "orbs": {
            "🕰 Сатурн": 1.0,
            "🍀 Юпитер": 1.0,
            "⚔️ Марс": 2.0,
            "♇ Плутон": 1.0,
            "🌪 Уран": 1.0
        },
        "aspect_meanings": {
            "Соединение": "яркое проявление амбиций/ответственности",
            "Секстиль": "шанс показать себя",
            "Квадрат": "стресс-тест, дедлайны, напряжение",
            "Трин": "рост, поддержка, признание",
            "Оппозиция": "внешние требования, аудит",
        },
    },
    "finance": {
        "title": "Годовой прогноз на финансы",
        "transits": {"💕 Венера", "🍀 Юпитер", "🕰 Сатурн", "♇ Плутон"},
        "orbs": {
            "💕 Венера": 2.0,
            "🍀 Юпитер": 1.0,
            "🕰 Сатурн": 1.0,
            "♇ Плутон": 1.0
        },
        "aspect_meanings": {
            "Соединение": "сильный фокус на доходы/расходы",
            "Секстиль": "возможности для заработка",
            "Квадрат": "ограничения, дисциплина бюджета",
            "Трин": "прибавка, удачные сделки",
            "Оппозиция": "баланс рисков и обязательств",
        },
    },
}
ASPECTS_ALL = {
    0: "Соединение", 60: "Секстиль", 90: "Квадрат",
    120: "Трин", 180: "Оппозиция", 240: "Трин",
    270: "Квадрат", 300: "Секстиль"
}

def _yearly_forecast_domain(
        domain_key: str,
        birth_year: int, birth_month: int, birth_day: int,
        birth_hour: int, birth_minute: int,
        city_name: str,
        start_year: int, start_month: int, start_day: int,
        days: int = 365,
        compact: bool = True
) -> Dict:
    """
    Универсальный расчёт годового прогноза по домену (love/career/finance).
    Сканирует каждый день на 12:00 локального времени и ищет аспекты
    от заданных транзитных планет к натальным (Солнце–Плутон).

    Параметры:
      - domain_key: ключ домена из DOMAIN_CONFIG ("love" | "career" | "finance")
      - birth_*: дата/время рождения
      - city_name: город рождения (для часового пояса)
      - start_*: стартовая дата прогноза (обычно «сегодня»)
      - days: горизонт прогноза (по умолчанию 365)
      - compact: если True — возвращает сгруппированные периоды; иначе — сырые события

    Возвращает:
      Dict с метаданными прогноза и либо "periods" (compact=True),
      либо "events" (compact=False).
    """
    # 1) Конфиг домена
    if domain_key not in DOMAIN_CONFIG:
        raise HTTPException(status_code=400, detail=f"Неизвестный домен: {domain_key}")
    cfg = DOMAIN_CONFIG[domain_key]

    # 2) Координаты/часовой пояс и натальный JD
    lat, lon = get_coordinates_smart(city_name)
    utc_offset = get_utc_offset(birth_year, birth_month, birth_day, birth_hour, birth_minute, lat, lon)
    jd_natal = swe.julday(
        birth_year, birth_month, birth_day,
        birth_hour + birth_minute / 60.0 - utc_offset,
        swe.GREG_CAL
    )

    # 3) Натальные позиции (10 планет)
    natal_positions: Dict[str, float] = {}
    for obj, name in objects.items():
        body, _ = swe.calc_ut(jd_natal, obj, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL)
        natal_positions[name] = body[0]

    # 4) Итерация по дням
    start_dt = datetime(start_year, start_month, start_day)
    events: List[Dict] = []
    counters = {"Соединение": 0, "Секстиль": 0, "Квадрат": 0, "Трин": 0, "Оппозиция": 0}

    for i in range(days):
        cur = start_dt + timedelta(days=i)
        # считаем на 12:00 местного времени → UTC час = 12.0 - utc_offset
        jd = swe.julday(cur.year, cur.month, cur.day, 12.0 - utc_offset, swe.GREG_CAL)

        # транзитные позиции — только планеты из доменного конфига
        transit_positions: Dict[str, float] = {}
        for obj, name in objects.items():
            if name not in cfg["transits"]:
                continue
            body, _ = swe.calc_ut(jd, obj, swe.FLG_SWIEPH | swe.FLG_SPEED | swe.FLG_TROPICAL)
            transit_positions[name] = body[0]

        # проверка аспектов транзит → натал
        for t_name, t_pos in transit_positions.items():
            for n_name, n_pos in natal_positions.items():
                angle = (t_pos - n_pos + 360.0) % 360.0
                orb_limit = cfg["orbs"].get(t_name, 1.0)

                for asp_angle, asp_name in ASPECTS_ALL.items():
                    # кратчайшая разница до аспектного угла
                    diff = ((angle - asp_angle + 180.0) % 360.0) - 180.0
                    if abs(diff) <= orb_limit:
                        note = cfg["aspect_meanings"][asp_name]
                        events.append({
                            "date": cur.strftime(DEFAULT_DATE_FORMAT),
                            "transit": t_name,
                            "natal": n_name,
                            "aspect": asp_name,
                            "orb": round(abs(diff), 2),
                            "note": note
                        })
                        counters[asp_name] += 1

    # 5) Сводка по датам (ТОП насыщенных)
    by_date: Dict[str, int] = defaultdict(int)
    for ev in events:
        by_date[ev["date"]] += 1
    top_days = sorted(by_date.items(), key=lambda x: x[1], reverse=True)[:10]

    period = f"{start_dt.strftime('%Y-%m-%d')} — {(start_dt + timedelta(days=days-1)).strftime('%Y-%m-%d')}"
    payload: Dict[str, any] = {
        "title": cfg["title"],
        "period": period,
        "city": city_name,
        "transits_used": sorted(cfg["transits"]),
        "orbs_used": cfg["orbs"],                 # полезно видеть настройки
        "summary_aspects": counters,
        "top_days": [{"date": d, "events": c} for d, c in top_days],
    }

    if compact:
        periods = group_events_into_periods(events)
        payload["events_count"] = len(events)
        payload["periods"] = periods
    else:
        payload["events"] = events

    return payload

# -------------------------- РУЧКИ API --------------------------------------

@app.get("/year_love", response_model=Dict)
async def year_love(
        year: int, month: int, day: int,
        hour: int, minute: int,
        city_name: str,
        today_year: int, today_month: int, today_day: int,
        compact: bool = Query(True, description="Сжать события в периоды")
):
    try:
        return _yearly_forecast_domain(
            "love",
            birth_year=year, birth_month=month, birth_day=day,
            birth_hour=hour, birth_minute=minute,
            city_name=city_name,
            start_year=today_year, start_month=today_month, start_day=today_day,
            days=365,
            compact=compact
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/year_career", response_model=Dict)
async def year_career(
        year: int, month: int, day: int,
        hour: int, minute: int,
        city_name: str,
        today_year: int, today_month: int, today_day: int,
        compact: bool = Query(True, description="Сжать события в периоды")
):
    try:
        return _yearly_forecast_domain(
            "career",
            birth_year=year, birth_month=month, birth_day=day,
            birth_hour=hour, birth_minute=minute,
            city_name=city_name,
            start_year=today_year, start_month=today_month, start_day=today_day,
            days=365,
            compact=compact
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/year_finance", response_model=Dict)
async def year_finance(
        year: int, month: int, day: int,
        hour: int, minute: int,
        city_name: str,
        today_year: int, today_month: int, today_day: int,
        compact: bool = Query(True, description="Сжать события в периоды")
):
    try:
        return _yearly_forecast_domain(
            "finance",
            birth_year=year, birth_month=month, birth_day=day,
            birth_hour=hour, birth_minute=minute,
            city_name=city_name,
            start_year=today_year, start_month=today_month, start_day=today_day,
            days=365,
            compact=compact
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
