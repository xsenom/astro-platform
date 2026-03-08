from datetime import datetime, timedelta
import re
from typing import Dict, List

from fastapi import HTTPException
from geopy.geocoders import Nominatim
import pytz
import swisseph as swe
from pytz import AmbiguousTimeError, NonExistentTimeError
from timezonefinder import TimezoneFinder


def _safe_localize(tz, dt):
    try:
        # обычные даты
        return tz.localize(dt, is_dst=None)
    except AmbiguousTimeError:
        # «повторный час» при откате часов → берем зимнее время
        return tz.localize(dt, is_dst=False)
    except NonExistentTimeError:
        # «пропавший час» при переводе вперед → сдвигаем на +1ч и считаем как летнее
        return tz.localize(dt + timedelta(hours=1), is_dst=True)


def get_julian_day_utc(
        year: int, month: int, day: int,
        hour: int, minute: int,
        lat: float, lon: float
):
    tf = TimezoneFinder()
    tz_name = tf.timezone_at(lng=lon, lat=lat)
    if not tz_name:
        raise HTTPException(400, "❌ Не удалось определить часовой пояс.")
    tz = pytz.timezone(tz_name)

    local_dt = datetime(year, month, day, hour, minute)
    utc_dt = tz.localize(local_dt).astimezone(pytz.utc)

    decimal = utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600

    jd = swe.julday(utc_dt.year, utc_dt.month, utc_dt.day, decimal, swe.GREG_CAL)

    # ⏱ Для отладки
    print(f"UTC datetime: {utc_dt.isoformat()} | ΔT = {swe.deltat(jd):.6f} дней")

    return jd, utc_dt.strftime("%Y-%m-%d %H:%M:%S UTC"), tz_name


def normalize_city_name(city_raw: str) -> str:
    city = city_raw.strip()

    stopwords = [
        "г.", "город", "республика", "область", "край", "район",
        "пгт", "посёлок", "деревня", "село", "аул", "urban-type settlement"
    ]
    # Убираем стоп-слова
    pattern = r'\b(?:' + '|'.join(stopwords) + r')\b'
    city = re.sub(pattern, '', city, flags=re.IGNORECASE)
    city = re.sub(r'\s+', ' ', city)

    # Разбиваем по запятым и пробелам
    fragments = re.split(r'[,\n]', city)
    fragments = [frag.strip() for frag in fragments if frag.strip()]
    if not fragments:
        return city.strip()

    # Берем самый короткий фрагмент (чаще всего — это название населённого пункта)
    main_city = min(fragments, key=len)

    return main_city


def get_lunar_events_near_date(date: datetime) -> List[Dict]:
    jd_start = swe.julday(date.year, date.month, date.day, 0.0, swe.GREG_CAL)
    events = []
    for offset in range(-2, 3):  # 2 дня до и после
        jd = jd_start + offset
        moon, _ = swe.calc_ut(jd, swe.MOON)
        sun, _ = swe.calc_ut(jd, swe.SUN)
        angle = abs((moon[0] - sun[0]) % 360)
        if angle < 1.5:
            events.append({"type": "🌑 Новолуние", "date": date + timedelta(days=offset)})
        elif abs(angle - 180) < 1.5:
            events.append({"type": "🌕 Полнолуние", "date": date + timedelta(days=offset)})
        # Можно добавить затмения отдельно — они сложнее
    return events


def get_coordinates_smart(city_name: str) -> tuple:
    """
    Умный поиск координат города с ручной обработкой и безопасностью.
    """
    geolocator = Nominatim(user_agent="astro_calculator")
    normalized = normalize_city_name(city_name)

    # 🔒 Специальный случай — Алакуртти
    if "алакуртти" in normalized.lower():
        lat, lon = 66.9640, 30.3424
        print(f"[DEBUG] Используем ручные координаты для Алакуртти: {lat}, {lon}")
        return float(lat), float(lon)

    # 📚 Попытки поиска с разными вариантами
    search_variants = [
        city_name,
        normalized,
        f"{normalized}, Россия",
        f"{normalized}, Казахстан",
        f"{normalized}, Украина",
        f"{normalized}, Беларусь",
        f"{normalized}, Грузия",
        f"{city_name}, Россия",
        f"{city_name}, Казахстан"
    ]

    for variant in search_variants:
        try:
            loc = geolocator.geocode(variant, language="ru", exactly_one=True)
            if loc:
                lat, lon = float(loc.latitude), float(loc.longitude)
                if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                    raise ValueError("Получены некорректные координаты")
                print(f"[DEBUG] Найдено по запросу: '{variant}' → {lat}, {lon}")
                return lat, lon
        except Exception:
            continue

    # 🔍 fallback: ищем вручную по словам
    words = normalized.split()
    for i in range(len(words), 0, -1):
        subphrase = " ".join(words[:i])
        try:
            loc = geolocator.geocode(subphrase, language="ru", exactly_one=True)
            if loc:
                lat, lon = float(loc.latitude), float(loc.longitude)
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    print(f"[DEBUG] Найдено перебором: {subphrase} → {lat}, {lon}")
                    return lat, lon
        except Exception:
            continue

    # 🪵 Логируем неудачный случай
    try:
        with open("unresolved_locations.log", "a", encoding="utf-8") as f:
            f.write(f"{city_name}\n")
    except Exception:
        pass

    raise HTTPException(400, f"❌ Не удалось определить координаты по запросу: '{city_name}'")


# ── Геокодирование ─────────────────────────────────────────────────────────
def get_coordinates(city_name: str):
    geolocator = Nominatim(user_agent="astro_calculator")
    loc = geolocator.geocode(city_name, language="ru")
    if not loc:
        raise HTTPException(400, f"❌ Город '{city_name}' не найден.")
    return loc.latitude, loc.longitude


# ── Часовой пояс и локальное время ───────────────────────────────────────────
def get_utc_offset(year, month, day, hour, minute, lat, lon):
    tz_name = TimezoneFinder().timezone_at(lng=lon, lat=lat)
    if not tz_name:
        raise HTTPException(400, "❌ Не удалось определить часовой пояс.")
    tz = pytz.timezone(tz_name)
    loc = _safe_localize(tz, datetime(year, month, day, hour, minute))
    return loc.utcoffset().total_seconds() / 3600


def get_local_time_str(year, month, day, hour, minute, lat, lon):
    tz_name = TimezoneFinder().timezone_at(lng=lon, lat=lat)
    if not tz_name:
        raise HTTPException(400, "❌ Не удалось определить часовой пояс.")
    tz = pytz.timezone(tz_name)
    loc = _safe_localize(tz, datetime(year, month, day, hour, minute))
    return loc.strftime("%Y-%m-%d %H:%M:%S %Z%z"), tz_name
