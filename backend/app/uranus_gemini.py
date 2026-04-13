from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional

from fastapi import FastAPI, HTTPException, Query
import swisseph as swe
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder
import pytz
from pytz import AmbiguousTimeError, NonExistentTimeError

app = FastAPI(
    title="Astro Uranus API",
    version="1.1.0",
)

# ---------------------------------------------------
# Настройки
# ---------------------------------------------------
EPHE_PATH = "/opt/astro-uran/ephe"
swe.set_ephe_path(EPHE_PATH)

HIGH_LATITUDE_LIMIT = 64.0

OBJECTS = {
    swe.SUN: "☉ Солнце",
    swe.MOON: "🌙 Луна",
    swe.MERCURY: "🖋 Меркурий",
    swe.VENUS: "💕 Венера",
    swe.MARS: "⚔️ Марс",
    swe.JUPITER: "🍀 Юпитер",
    swe.SATURN: "🕰 Сатурн",
    swe.URANUS: "🌪 Уран",
    swe.NEPTUNE: "🌊 Нептун",
    swe.PLUTO: "♇ Плутон",
}

ASPECTS = {
    0: "Соединение",
    60: "Секстиль",
    90: "Квадрат",
    120: "Трин",
    180: "Оппозиция",
    240: "Трин",
    270: "Квадрат",
    300: "Секстиль",
}

# Окна фактического нахождения Урана в Близнецах в этом цикле
URANUS_GEMINI_WINDOWS = [
    (datetime(2026, 4, 25), datetime(2032, 8, 3)),
    (datetime(2032, 12, 12), datetime(2033, 5, 22)),
]

ALLOWED_NATAL = set(OBJECTS.values())

GENERAL_HOUSE_THEMES = {
    1: "реформа личности, внешности, способа заявлять о себе и курса жизни",
    2: "реформа денег, доходов, самоценности и отношения к ресурсам",
    3: "реформа мышления, общения, обучения, документов, поездок и контактов",
    4: "реформа дома, семьи, базы, места жительства и чувства опоры",
    5: "реформа любви, детей, творчества, удовольствия и самовыражения",
    6: "реформа работы, режима, навыков, здоровья и повседневной организации",
    7: "реформа партнёрства, брака, договорённостей и способа строить союз",
    8: "реформа общих денег, кризисов, интимности, долгов и глубинных трансформаций",
    9: "реформа мировоззрения, обучения, релокации, права и дальних горизонтов",
    10: "реформа карьеры, статуса, профессии, репутации и жизненной цели",
    11: "реформа дружбы, сообщества, аудитории, будущих планов и командных проектов",
    12: "реформа внутренней жизни, завершений, одиночества, психики и скрытых процессов",
}

ASPECT_INTERPRETATIONS: Dict[Tuple[str, str], str] = {
    ("Соединение", "☉ Солнце"): "Перезапуск личности, резкая смена самовыражения, образа жизни и личной роли.",
    ("Секстиль", "☉ Солнце"): "Мягкое обновление самоощущения, новые роли и идеи легче внедряются в жизнь.",
    ("Квадрат", "☉ Солнце"): "Напряжённая ломка старой идентичности, конфликт между свободой и привычным образом себя.",
    ("Трин", "☉ Солнце"): "Естественное обновление личности, смелость быть собой и жить по-новому.",
    ("Оппозиция", "☉ Солнце"): "Внешние события заставляют пересмотреть цели, статус и образ себя.",

    ("Соединение", "🌙 Луна"): "Глубокая эмоциональная перестройка, перемены в быту, семье и чувстве безопасности.",
    ("Секстиль", "🌙 Луна"): "Легче отпустить старые эмоциональные привычки и сделать жизнь живее.",
    ("Квадрат", "🌙 Луна"): "Нервное напряжение, смена быта или семейных правил, выход из эмоциональной клетки.",
    ("Трин", "🌙 Луна"): "Освобождение чувств, внутреннее обновление и более живой контакт с собой.",
    ("Оппозиция", "🌙 Луна"): "Перемены во внешней среде качают эмоциональную опору и требуют гибкости.",

    ("Соединение", "🖋 Меркурий"): "Революция мышления, речи, обучения, контактов, документов и способов общения.",
    ("Секстиль", "🖋 Меркурий"): "Новые идеи, обучение и цифровые решения приходят вовремя и с пользой.",
    ("Квадрат", "🖋 Меркурий"): "Информационная перегрузка, смена взглядов, конфликт старой и новой логики.",
    ("Трин", "🖋 Меркурий"): "Быстрое обновление мышления, удачные инсайты, лёгкость в освоении нового.",
    ("Оппозиция", "🖋 Меркурий"): "Окружение и новости заставляют радикально пересмотреть мнение и планы.",

    ("Соединение", "💕 Венера"): "Реформы в любви, ценностях, деньгах, вкусе и формате отношений.",
    ("Секстиль", "💕 Венера"): "Мягкое обновление отношений и финансовых привычек, больше свободы и свежести.",
    ("Квадрат", "💕 Венера"): "Ломка старых сценариев любви и денег, тяга к нестандартным решениям.",
    ("Трин", "💕 Венера"): "Лёгкое обновление личной жизни, вкуса, творчества и финансовых приоритетов.",
    ("Оппозиция", "💕 Венера"): "Партнёры и внешние обстоятельства провоцируют смену ценностей и формата отношений.",

    ("Соединение", "⚔️ Марс"): "Резкий всплеск смелости и действий, склонность действовать быстро и по-новому.",
    ("Секстиль", "⚔️ Марс"): "Энергия обновления помогает запустить новые проекты и выйти из застоя.",
    ("Квадрат", "⚔️ Марс"): "Импульсивность, конфликты, аварийность; нужна осторожность и экологичный выпуск энергии.",
    ("Трин", "⚔️ Марс"): "Смелые решения, лёгкий запуск перемен, хорошее время для прорыва.",
    ("Оппозиция", "⚔️ Марс"): "Внешние люди и обстоятельства подталкивают к борьбе за свободу действий.",

    ("Соединение", "🍀 Юпитер"): "Радикальное расширение горизонтов, веры, обучения и жизненной философии.",
    ("Секстиль", "🍀 Юпитер"): "Новые возможности роста, знаний и движения открываются достаточно легко.",
    ("Квадрат", "🍀 Юпитер"): "Столкновение между привычной верой и новым видением будущего.",
    ("Трин", "🍀 Юпитер"): "Прорыв в развитии, обучении, масштабировании и личной свободе.",
    ("Оппозиция", "🍀 Юпитер"): "Внешние события меняют мировоззрение, цели роста и планы на расширение.",

    ("Соединение", "🕰 Сатурн"): "Слом старых конструкций, правил, обязанностей и форм контроля.",
    ("Секстиль", "🕰 Сатурн"): "Можно мягко обновить систему жизни, работу, дисциплину и опоры.",
    ("Квадрат", "🕰 Сатурн"): "Кризис старого порядка, сопротивление переменам, реформы через напряжение.",
    ("Трин", "🕰 Сатурн"): "Удачная модернизация жизненной структуры и взрослый переход в новое.",
    ("Оппозиция", "🕰 Сатурн"): "Жизнь требует пересобрать рамки, ответственность и отношения с контролем.",

    ("Соединение", "🌪 Уран"): "Ключевой цикл свободы и перезапуска: время радикально менять курс жизни.",
    ("Секстиль", "🌪 Уран"): "Поддержка внутренней потребности в обновлении и нестандартных решениях.",
    ("Квадрат", "🌪 Уран"): "Кризис свободы и старых сценариев, сильное желание вырваться из ограничений.",
    ("Трин", "🌪 Уран"): "Гармоничное раскрытие индивидуальности и реформ в жизни.",
    ("Оппозиция", "🌪 Уран"): "Поворотная точка уранического цикла: внешние перемены требуют нового вектора.",

    ("Соединение", "🌊 Нептун"): "Резкая смена мечты, интуиции и внутреннего ориентирования; старые иллюзии рушатся.",
    ("Секстиль", "🌊 Нептун"): "Обновление вдохновения, интуиции и творческого восприятия мира.",
    ("Квадрат", "🌊 Нептун"): "Нестабильность ориентиров, путаница и необходимость отделить инсайт от иллюзии.",
    ("Трин", "🌊 Нептун"): "Тонкое, но сильное обновление интуиции, творчества и духовного видения.",
    ("Оппозиция", "🌊 Нептун"): "Внешние события расшатывают старую мечту и требуют более живой правды.",

    ("Соединение", "♇ Плутон"): "Глубокая революция власти, контроля, стратегии и личной силы.",
    ("Секстиль", "♇ Плутон"): "Можно экологично провести мощные внутренние реформы и освободиться от лишнего.",
    ("Квадрат", "♇ Плутон"): "Сильный кризис контроля, борьба со старыми силовыми сценариями.",
    ("Трин", "♇ Плутон"): "Глубокое, но естественное обновление стратегии жизни и личной мощи.",
    ("Оппозиция", "♇ Плутон"): "Внешние силы заставляют пересобрать отношения с контролем, властью и зависимостями.",
}


# ---------------------------------------------------
# Вспомогательные функции
# ---------------------------------------------------
def log(message: str, payload: Optional[Dict] = None) -> None:
    if payload is None:
        print(f"[astro-uran] {message}")
    else:
        print(f"[astro-uran] {message}", payload)


def safe_localize(tz, dt: datetime) -> datetime:
    try:
        return tz.localize(dt, is_dst=None)
    except AmbiguousTimeError:
        return tz.localize(dt, is_dst=False)
    except NonExistentTimeError:
        return tz.localize(dt + timedelta(hours=1), is_dst=True)


def normalize_city_name(city_name: str) -> str:
    return city_name.strip()


def get_coordinates(city_name: str) -> Tuple[float, float]:
    geolocator = Nominatim(user_agent="astro_uran_api")
    normalized = normalize_city_name(city_name)

    location = geolocator.geocode(normalized, language="ru")
    if not location:
        location = geolocator.geocode(normalized, language="en")
    if not location:
        raise ValueError(f"Не удалось найти координаты для города: {city_name}")

    lat = float(location.latitude)
    lon = float(location.longitude)

    log("coordinates resolved", {
        "city_name": city_name,
        "normalized": normalized,
        "lat": lat,
        "lon": lon,
    })

    return lat, lon


def get_timezone_name(lat: float, lon: float) -> str:
    tf = TimezoneFinder()
    tz_name = tf.timezone_at(lng=lon, lat=lat)
    if not tz_name:
        raise ValueError("Не удалось определить часовой пояс по координатам")

    log("timezone resolved", {
        "lat": lat,
        "lon": lon,
        "timezone": tz_name,
    })

    return tz_name


def get_jd_utc(
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    lat: float,
    lon: float,
) -> float:
    tz_name = get_timezone_name(lat, lon)
    tz = pytz.timezone(tz_name)

    local_dt = datetime(year, month, day, hour, minute)
    utc_dt = safe_localize(tz, local_dt).astimezone(pytz.utc)

    decimal_hours = utc_dt.hour + utc_dt.minute / 60 + utc_dt.second / 3600

    jd = swe.julday(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        decimal_hours,
        swe.GREG_CAL,
    )

    log("julian day calculated", {
        "local_dt": local_dt.isoformat(),
        "utc_dt": utc_dt.isoformat(),
        "jd": jd,
    })

    return jd


def calc_natal_positions(jd_natal: float) -> Dict[str, float]:
    natal_positions: Dict[str, float] = {}
    for obj, name in OBJECTS.items():
        if name in ALLOWED_NATAL:
            pos, _ = swe.calc_ut(jd_natal, obj)
            natal_positions[name] = pos[0]

    log("natal positions calculated", {
        "count": len(natal_positions),
        "objects": list(natal_positions.keys()),
    })

    return natal_positions


def detect_house_system(lat: float) -> str:
    return "Placidus" if abs(lat) <= HIGH_LATITUDE_LIMIT else "Equal"


def get_house_system_code(lat: float) -> bytes:
    return b"P" if abs(lat) <= HIGH_LATITUDE_LIMIT else b"E"


def get_latitude_warning(lat: float) -> Optional[str]:
    if abs(lat) > HIGH_LATITUDE_LIMIT:
        return (
            f"Широта {lat:.4f} выше {HIGH_LATITUDE_LIMIT}°. "
            "Для расчёта домов автоматически использована система Equal вместо Placidus."
        )
    return None


def calc_houses(jd_natal: float, lat: float, lon: float) -> List[float]:
    preferred_system_code = get_house_system_code(lat)
    preferred_system_name = detect_house_system(lat)

    log("house calculation started", {
        "lat": lat,
        "lon": lon,
        "abs_lat": abs(lat),
        "high_latitude_limit": HIGH_LATITUDE_LIMIT,
        "preferred_house_system": preferred_system_name,
        "preferred_house_system_code": preferred_system_code.decode("ascii"),
    })

    try:
        cusps, _ = swe.houses(jd_natal, lat, lon, preferred_system_code)
        cusps_list = list(cusps)
        if len(cusps_list) >= 12:
            log("house calculation success", {
                "used_house_system": preferred_system_name,
                "cusps_count": len(cusps_list),
            })
            return cusps_list[:12]
    except Exception as e:
        log("house calculation failed", {
            "used_house_system": preferred_system_name,
            "error": str(e),
        })

    if preferred_system_code != b"E":
        try:
            cusps, _ = swe.houses(jd_natal, lat, lon, b"E")
            cusps_list = list(cusps)
            if len(cusps_list) >= 12:
                log("house calculation fallback success", {
                    "used_house_system": "Equal",
                    "cusps_count": len(cusps_list),
                })
                return cusps_list[:12]
        except Exception as e:
            log("house calculation fallback failed", {
                "used_house_system": "Equal",
                "error": str(e),
            })

    raise ValueError(
        f"Не удалось корректно рассчитать дома для широты {lat:.4f} и долготы {lon:.4f}"
    )


def get_house_for_longitude(lon_deg: float, house_cusps: List[float]) -> int:
    if not house_cusps or len(house_cusps) < 12:
        return 12

    cusps = house_cusps[:] + [house_cusps[0] + 360]
    lon_norm = lon_deg

    if lon_norm < cusps[0]:
        lon_norm += 360

    for i in range(12):
        start = cusps[i]
        end = cusps[i + 1]
        if end < start:
            end += 360
        if start <= lon_norm < end:
            return i + 1

    return 12


def collapse_dates_to_periods(
    dates: List[datetime],
    max_gap_days: int = 6,
) -> List[Tuple[datetime, datetime]]:
    if not dates:
        return []

    dates = sorted(dates)
    periods: List[Tuple[datetime, datetime]] = []

    start = dates[0]
    prev = dates[0]

    for current in dates[1:]:
        if (current - prev).days <= max_gap_days:
            prev = current
            continue

        periods.append((start, prev))
        start = current
        prev = current

    periods.append((start, prev))
    return periods


def format_period(start: datetime, end: datetime) -> str:
    if start.date() == end.date():
        return start.strftime("%d.%m.%Y")
    return f"{start.strftime('%d.%m.%Y')} – {end.strftime('%d.%m.%Y')}"


def get_aspect_meaning(aspect_name: str, natal_name: str) -> str:
    return ASPECT_INTERPRETATIONS.get(
        (aspect_name, natal_name),
        "Период обновления, неожиданных разворотов и реформ по темам этой планеты.",
    )


def get_sign_index(longitude: float) -> int:
    return int(longitude // 30)


def validate_birth_input(
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
) -> None:
    datetime(year, month, day, hour, minute)


# ---------------------------------------------------
# Основной расчёт
# ---------------------------------------------------
def build_uranus_gemini_report(
    year: int,
    month: int,
    day: int,
    hour: int,
    minute: int,
    city_name: str,
    orb: float = 1.0,
    step_hours: int = 12,
) -> Dict:
    validate_birth_input(year, month, day, hour, minute)

    lat, lon = get_coordinates(city_name)
    tz_name = get_timezone_name(lat, lon)

    house_system_name = detect_house_system(lat)
    latitude_warning = get_latitude_warning(lat)

    log("report build started", {
        "city": city_name,
        "lat": lat,
        "lon": lon,
        "timezone": tz_name,
        "house_system": house_system_name,
        "latitude_warning": latitude_warning,
        "orb": orb,
        "step_hours": step_hours,
    })

    jd_natal = get_jd_utc(year, month, day, hour, minute, lat, lon)
    natal_positions = calc_natal_positions(jd_natal)
    house_cusps = calc_houses(jd_natal, lat, lon)

    hits: Dict[Tuple[str, str], List[datetime]] = {}
    uranus_house_dates: List[Tuple[datetime, int]] = []

    for win_start, win_end in URANUS_GEMINI_WINDOWS:
        current = win_start

        while current <= win_end:
            jd = swe.julday(
                current.year,
                current.month,
                current.day,
                current.hour + current.minute / 60.0,
                swe.GREG_CAL,
            )

            uranus_pos, _ = swe.calc_ut(jd, swe.URANUS)
            uranus_long = uranus_pos[0]

            # Уран только в Близнецах
            if get_sign_index(uranus_long) == 2:
                current_house = get_house_for_longitude(uranus_long, house_cusps)
                uranus_house_dates.append((current, current_house))

                for natal_name, natal_long in natal_positions.items():
                    angle = (uranus_long - natal_long + 360) % 360

                    for asp_angle, asp_name in ASPECTS.items():
                        diff = ((angle - asp_angle + 180) % 360) - 180
                        if abs(diff) <= orb:
                            hits.setdefault((asp_name, natal_name), []).append(current)

            current += timedelta(hours=step_hours)

    house_counter: Dict[int, int] = {}
    for _, house_num in uranus_house_dates:
        house_counter[house_num] = house_counter.get(house_num, 0) + 1

    main_house: Optional[int] = max(house_counter, key=house_counter.get) if house_counter else None

    aspect_items = []
    for (aspect_name, natal_name), dates in sorted(
        hits.items(),
        key=lambda x: (min(x[1]), x[0][0], x[0][1]),
    ):
        unique_days = sorted({datetime(d.year, d.month, d.day) for d in dates})
        periods = collapse_dates_to_periods(unique_days, max_gap_days=6)
        period_labels = [format_period(start, end) for start, end in periods]

        aspect_items.append(
            {
                "aspect": aspect_name,
                "planet": natal_name,
                "periods": period_labels,
                "hits_count": len(dates),
                "interpretation": get_aspect_meaning(aspect_name, natal_name),
            }
        )

    main_reforms: List[str] = []

    if main_house:
        main_reforms.append(
            f"Главная долгосрочная реформа цикла идёт через {main_house} дом: "
            f"{GENERAL_HOUSE_THEMES.get(main_house, 'перестройка ключевой жизненной сферы')}."
        )

    if any(item["planet"] == "🖋 Меркурий" for item in aspect_items):
        main_reforms.append(
            "Будут особенно заметны реформы мышления, общения, обучения, техники, документов и информационных связей."
        )

    if any(item["planet"] == "💕 Венера" for item in aspect_items):
        main_reforms.append(
            "Изменятся ценности, формат отношений, вкусы и финансовые привычки."
        )

    if any(item["planet"] == "🕰 Сатурн" for item in aspect_items):
        main_reforms.append(
            "Старые правила и конструкции жизни будут пересобираться, особенно там, где человек жил по инерции."
        )

    if any(item["planet"] == "☉ Солнце" for item in aspect_items):
        main_reforms.append(
            "Этот цикл заметно затронет личную идентичность, самопрезентацию и направление жизни."
        )

    if not main_reforms:
        main_reforms.append(
            "Цикл Урана в Близнецах всё равно запускает долгосрочные реформы через мышление, связи, обучение и новые способы жизни."
        )

    result = {
        "title": "Уран в Близнецах — индивидуальный цикл реформ на 7 лет",
        "period": "25.04.2026 – 22.05.2033",
        "city": city_name,
        "coordinates": {
            "lat": lat,
            "lon": lon,
        },
        "timezone": tz_name,
        "birth_data": {
            "year": year,
            "month": month,
            "day": day,
            "hour": hour,
            "minute": minute,
        },
        "settings": {
            "orb": orb,
            "step_hours": step_hours,
            "ephe_path": EPHE_PATH,
            "house_system": house_system_name,
            "high_latitude_limit": HIGH_LATITUDE_LIMIT,
        },
        "latitude_warning": latitude_warning,
        "main_house": main_house,
        "main_house_theme": GENERAL_HOUSE_THEMES.get(main_house) if main_house else None,
        "main_reforms": main_reforms,
        "aspects": aspect_items,
        "summary": f"Найдено аспектов Урана в Близнецах к натальным планетам: {len(aspect_items)}.",
    }

    log("report build finished", {
        "city": city_name,
        "main_house": main_house,
        "aspects_count": len(aspect_items),
        "house_system": house_system_name,
    })

    return result


# ---------------------------------------------------
# API
# ---------------------------------------------------
@app.get("/")
def root():
    return {
        "ok": True,
        "service": "astro-uran",
        "endpoint": "/uranus_gemini_7y",
    }


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "astro-uran",
    }


@app.get("/uranus_gemini_7y")
def uranus_gemini_7y(
    year: int = Query(..., description="Год рождения"),
    month: int = Query(..., description="Месяц рождения"),
    day: int = Query(..., description="День рождения"),
    hour: int = Query(..., description="Час рождения"),
    minute: int = Query(..., description="Минута рождения"),
    city_name: str = Query(..., description="Город рождения"),
    orb: float = Query(1.0, description="Орб аспекта"),
    step_hours: int = Query(12, description="Шаг сканирования в часах"),
):
    try:
        result = build_uranus_gemini_report(
            year=year,
            month=month,
            day=day,
            hour=hour,
            minute=minute,
            city_name=city_name,
            orb=orb,
            step_hours=step_hours,
        )
        return result
    except Exception as e:
        log("fatal error", {"message": str(e)})
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------
# Локальный запуск
# ---------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8015,
        reload=False,
    )