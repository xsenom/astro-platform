"use client";

import Link from "next/link";
import {
    ArrowRight,
    CalendarDays,
    MoonStar,
    ShieldCheck,
    Sparkles,
    UserRound,
} from "lucide-react";

const services = [
    {
        icon: <UserRound size={20} />,
        title: "Личные консультации",
        text:
            "Индивидуальный разбор натальной карты, сильных сторон, текущего периода и вашего личного запроса.",
    },
    {
        icon: <CalendarDays size={20} />,
        title: "Прогнозы на важные периоды",
        text:
            "Ключевые даты, транзиты, благоприятные окна для действий и более точное понимание ближайшего периода.",
    },
    {
        icon: <MoonStar size={20} />,
        title: "Персональные материалы",
        text:
            "Доступ к расчётам, интерпретациям и PDF-файлам в личном кабинете без лишнего поиска.",
    },
    {
        icon: <ShieldCheck size={20} />,
        title: "Понятный формат работы",
        text:
            "Спокойная структура взаимодействия: вы понимаете, что получите, в каком формате и как вернуться к материалам позже.",
    },
];

const formats = [
    {
        title: "Натальная карта",
        text:
            "Глубокий разбор личности, сильных качеств, внутренних задач и вашего индивидуального потенциала.",
    },
    {
        title: "Прогноз на период",
        text:
            "Подходит, если важно понять ближайшие тенденции, сильные даты и моменты, где лучше действовать осознанно.",
    },
    {
        title: "Разбор конкретного запроса",
        text:
            "Отношения, работа, перемены, внутренний тупик, запуск нового этапа или другой конкретный жизненный вопрос.",
    },
    {
        title: "Материалы в личном кабинете",
        text:
            "Все результаты, интерпретации и сохранённые документы собраны в одном месте и доступны в удобное время.",
    },
];

const steps = [
    {
        index: "01",
        title: "Вы знакомитесь с сервисом",
        text:
            "На главной странице можно спокойно понять формат работы, направления и выбрать нужный путь.",
    },
    {
        index: "02",
        title: "Выбираете подходящий формат",
        text:
            "Консультация, прогноз, личный разбор или переход в кабинет для доступа к уже сохранённым материалам.",
    },
    {
        index: "03",
        title: "Получаете свои материалы",
        text:
            "В личном кабинете доступны ваши расчёты, интерпретации, PDF-файлы и персональные результаты.",
    },
];

export default function Home() {
    return (
        <>
            <main className="landingPage">
                <div className="landingNoise" />
                <div className="landingBgGlow landingBgGlow--one" />
                <div className="landingBgGlow landingBgGlow--two" />

                <header className="landingHeader">
                    <div className="landingContainer landingHeader__inner">
                        <Link href="/" className="landingBrand">
                            Центр прогнозов Татьяны Ермолиной
                        </Link>

                        <nav className="landingNav" aria-label="Навигация по странице">
                            <a href="#services" className="landingNav__link">
                                Услуги
                            </a>
                            <a href="#formats" className="landingNav__link">
                                Форматы
                            </a>
                            <a href="#about" className="landingNav__link">
                                О сервисе
                            </a>
                            <a href="#contacts" className="landingNav__link">
                                Контакты
                            </a>
                        </nav>

                        <div className="landingHeader__action">
                            <Link href="/cabinet" className="landingCabinetBtn">
                                Личный кабинет
                                <ArrowRight size={16} />
                            </Link>
                        </div>
                    </div>
                </header>

                <section className="heroSection">
                    <div className="landingContainer">
                        <div className="heroShell">
                            <div className="heroBadge">
                                <Sparkles size={14} />
                                <span>Персональные прогнозы и консультации</span>
                            </div>

                            <div className="heroGrid">
                                <div className="heroMainCard">
                                    <p className="heroEyebrow">Татьяна Ермолина</p>

                                    <h1 className="heroTitle">
                                        Астрология как инструмент понимания себя, времени и важных
                                        решений
                                    </h1>

                                    <p className="heroText">
                                        Пространство, где можно получить личный разбор, прогноз на
                                        значимый период, ответы по текущему запросу и доступ к своим
                                        материалам в удобном личном кабинете.
                                    </p>

                                    <div className="heroActions">
                                        <Link href="/cabinet" className="landingBtn landingBtn--primary">
                                            Перейти в личный кабинет
                                            <ArrowRight size={16} />
                                        </Link>

                                        <a href="#about" className="landingBtn landingBtn--secondary">
                                            Узнать подробнее
                                        </a>
                                    </div>
                                </div>

                                <aside className="heroSideCard">
                                    <p className="heroSideCard__eyebrow">Для клиентов сервиса</p>

                                    <h2 className="heroSideCard__title">
                                        Все персональные материалы собраны в одном месте
                                    </h2>

                                    <p className="heroSideCard__text">
                                        После консультаций и расчётов вы можете возвращаться к своим
                                        интерпретациям, PDF-файлам и сохранённым результатам в личном
                                        кабинете.
                                    </p>

                                    <div className="heroSideCard__tags">
                                        <span>Расчёты</span>
                                        <span>Интерпретации</span>
                                        <span>PDF-материалы</span>
                                    </div>
                                </aside>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="landingSection" id="services">
                    <div className="landingContainer">
                        <div className="sectionHead">
                            <span className="sectionKicker">Услуги</span>
                            <h2>Основные направления работы</h2>
                            <p>
                                Сервис объединяет персональные консультации, прогнозы и доступ к
                                вашим материалам в одном аккуратном пространстве.
                            </p>
                        </div>

                        <div className="cardsGrid cardsGrid--4">
                            {services.map((item) => (
                                <article key={item.title} className="infoCard">
                                    <div className="infoCard__icon">{item.icon}</div>
                                    <h3>{item.title}</h3>
                                    <p>{item.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landingSection" id="formats">
                    <div className="landingContainer">
                        <div className="sectionHead">
                            <span className="sectionKicker">Форматы</span>
                            <h2>С каким запросом можно обратиться</h2>
                            <p>
                                Выберите сценарий, который ближе к вашей текущей ситуации и
                                задаче.
                            </p>
                        </div>

                        <div className="cardsGrid cardsGrid--2">
                            {formats.map((item) => (
                                <article key={item.title} className="infoCard infoCard--soft">
                                    <h3>{item.title}</h3>
                                    <p>{item.text}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landingSection" id="about">
                    <div className="landingContainer">
                        <div className="aboutGrid">
                            <article className="aboutCard aboutCard--large">
                                <span className="sectionKicker">О сервисе</span>
                                <h2>Понятная структура без лишней перегруженности</h2>
                                <p>
                                    На этой странице можно познакомиться с форматом работы, понять,
                                    какие есть направления, и перейти к своим персональным
                                    материалам тогда, когда это действительно нужно.
                                </p>
                                <p>
                                    Вся структура построена так, чтобы человеку было легко понять,
                                    куда нажать: посмотреть услуги, изучить форматы или сразу
                                    открыть кабинет.
                                </p>
                            </article>

                            <article className="aboutCard">
                                <span className="sectionKicker">Как это работает</span>

                                <div className="stepsList">
                                    {steps.map((step) => (
                                        <div key={step.index} className="stepRow">
                                            <div className="stepRow__index">{step.index}</div>
                                            <div className="stepRow__content">
                                                <h3>{step.title}</h3>
                                                <p>{step.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="landingSection" id="contacts">
                    <div className="landingContainer">
                        <div className="ctaBox">
                            <div className="ctaBox__content">
                                <span className="sectionKicker">Следующий шаг</span>
                                <h2>Откройте личный кабинет, чтобы перейти к своим материалам</h2>
                                <p>
                                    Если у вас уже есть доступ, в кабинете вы увидите персональные
                                    расчёты, интерпретации и сохранённые документы.
                                </p>
                            </div>

                            <div className="ctaBox__actions">
                                <Link href="/cabinet" className="landingBtn landingBtn--primary">
                                    Открыть личный кабинет
                                    <ArrowRight size={16} />
                                </Link>

                                <a href="#services" className="landingBtn landingBtn--secondary">
                                    Посмотреть услуги
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <style jsx global>{`
                html {
                    scroll-behavior: smooth;
                }

                body {
                    margin: 0;
                    background: #071121;
                    color: #f4efe7;
                    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
                    "Segoe UI", sans-serif;
                }

                * {
                    box-sizing: border-box;
                }

                a {
                    text-decoration: none;
                }

                .landingPage {
                    position: relative;
                    overflow: hidden;
                    min-height: 100vh;
                    background:
                            radial-gradient(circle at top center, rgba(63, 89, 190, 0.22), transparent 28%),
                            radial-gradient(circle at 16% 18%, rgba(116, 146, 255, 0.1), transparent 22%),
                            linear-gradient(180deg, #091326 0%, #09152b 38%, #07111f 100%);
                    color: rgba(245, 242, 235, 0.96);
                }

                .landingNoise {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    opacity: 0.2;
                    background-image:
                            radial-gradient(rgba(255, 255, 255, 0.7) 0.8px, transparent 0.8px),
                            radial-gradient(rgba(255, 255, 255, 0.35) 0.7px, transparent 0.7px);
                    background-position: 0 0, 25px 30px;
                    background-size: 120px 120px, 180px 180px;
                }

                .landingBgGlow {
                    position: absolute;
                    border-radius: 999px;
                    filter: blur(90px);
                    pointer-events: none;
                    opacity: 0.45;
                }

                .landingBgGlow--one {
                    top: 60px;
                    left: -80px;
                    width: 260px;
                    height: 260px;
                    background: rgba(78, 116, 255, 0.18);
                }

                .landingBgGlow--two {
                    top: 80px;
                    right: -110px;
                    width: 340px;
                    height: 340px;
                    background: rgba(114, 93, 255, 0.16);
                }

                .landingContainer {
                    width: min(1180px, calc(100% - 48px));
                    margin: 0 auto;
                    position: relative;
                    z-index: 1;
                }

                .landingHeader {
                    position: sticky;
                    top: 0;
                    z-index: 50;
                    backdrop-filter: blur(14px);
                    background: rgba(7, 14, 30, 0.58);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                }

                .landingHeader__inner {
                    display: grid;
                    grid-template-columns: minmax(220px, 1fr) auto auto;
                    align-items: center;
                    gap: 28px;
                    min-height: 88px;
                }

                .landingBrand {
                    color: #f6f0e8;
                    font-size: 1.18rem;
                    font-weight: 700;
                    line-height: 1.2;
                    letter-spacing: -0.01em;
                    display: inline-flex;
                    align-items: center;
                }

                .landingNav {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 26px;
                }

                .landingNav__link {
                    color: rgba(241, 236, 228, 0.82);
                    font-size: 0.98rem;
                    font-weight: 500;
                    transition: color 0.18s ease, opacity 0.18s ease;
                }

                .landingNav__link:hover {
                    color: #ffffff;
                }

                .landingHeader__action {
                    display: flex;
                    justify-content: flex-end;
                }

                .landingCabinetBtn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    min-height: 48px;
                    padding: 0 18px;
                    border-radius: 999px;
                    background: linear-gradient(
                            180deg,
                            rgba(255, 255, 255, 0.12),
                            rgba(255, 255, 255, 0.05)
                    );
                    border: 1px solid rgba(233, 194, 117, 0.35);
                    color: #fff4dd;
                    font-weight: 700;
                    white-space: nowrap;
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
                    transition: transform 0.18s ease, border-color 0.18s ease;
                }

                .landingCabinetBtn:hover {
                    transform: translateY(-1px);
                    border-color: rgba(233, 194, 117, 0.6);
                }

                .heroSection {
                    padding: 34px 0 30px;
                }

                .heroShell {
                    border-radius: 34px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    background:
                            linear-gradient(180deg, rgba(17, 30, 65, 0.82), rgba(9, 18, 37, 0.92)),
                            rgba(11, 20, 40, 0.92);
                    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
                    padding: 32px;
                }

                .heroBadge {
                    width: fit-content;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    min-height: 42px;
                    padding: 0 16px;
                    margin-bottom: 24px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(233, 194, 117, 0.18);
                    color: #f0d48b;
                    font-size: 0.88rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                .heroGrid {
                    display: grid;
                    grid-template-columns: minmax(0, 1.45fr) minmax(330px, 0.82fr);
                    gap: 22px;
                    align-items: stretch;
                }

                .heroMainCard,
                .heroSideCard {
                    border-radius: 28px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    background:
                            linear-gradient(180deg, rgba(7, 18, 47, 0.78), rgba(7, 18, 38, 0.92)),
                            rgba(8, 18, 40, 0.9);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
                }

                .heroMainCard {
                    padding: 34px;
                }

                .heroSideCard {
                    padding: 30px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .heroEyebrow,
                .heroSideCard__eyebrow,
                .sectionKicker {
                    display: inline-block;
                    margin-bottom: 14px;
                    color: #f0d48a;
                    font-size: 0.84rem;
                    line-height: 1.2;
                    font-weight: 700;
                    letter-spacing: 0.16em;
                    text-transform: uppercase;
                }

                .heroTitle {
                    margin: 0;
                    max-width: 760px;
                    font-size: clamp(3rem, 6vw, 5.45rem);
                    line-height: 0.95;
                    letter-spacing: -0.05em;
                    font-weight: 800;
                    color: #f6f0e7;
                    text-wrap: balance;
                }

                .heroText {
                    margin: 22px 0 0;
                    max-width: 700px;
                    font-size: 1.06rem;
                    line-height: 1.75;
                    color: rgba(232, 228, 220, 0.8);
                }

                .heroActions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 14px;
                    margin-top: 30px;
                }

                .landingBtn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    min-height: 50px;
                    padding: 0 20px;
                    border-radius: 16px;
                    font-weight: 700;
                    transition: transform 0.18s ease, border-color 0.18s ease;
                }

                .landingBtn:hover {
                    transform: translateY(-1px);
                }

                .landingBtn--primary {
                    background: linear-gradient(180deg, #f1dba1 0%, #d9b26a 100%);
                    color: #111a2e;
                    border: 1px solid rgba(255, 255, 255, 0.18);
                }

                .landingBtn--secondary {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(245, 241, 233, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .heroSideCard__title {
                    margin: 0;
                    font-size: clamp(2rem, 3vw, 3.25rem);
                    line-height: 1.05;
                    letter-spacing: -0.04em;
                    font-weight: 700;
                    color: #f6f0e7;
                    text-wrap: balance;
                }

                .heroSideCard__text {
                    margin: 18px 0 0;
                    font-size: 1rem;
                    line-height: 1.75;
                    color: rgba(232, 228, 220, 0.78);
                }

                .heroSideCard__tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-top: 22px;
                }

                .heroSideCard__tags span {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 34px;
                    padding: 0 12px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    color: rgba(246, 240, 231, 0.92);
                    font-size: 0.92rem;
                    white-space: nowrap;
                }

                .landingSection {
                    padding: 44px 0;
                }

                .sectionHead {
                    max-width: 760px;
                    margin-bottom: 24px;
                }

                .sectionHead h2 {
                    margin: 0;
                    font-size: clamp(2rem, 4vw, 3.4rem);
                    line-height: 1.03;
                    letter-spacing: -0.04em;
                    color: #f6f0e7;
                    text-wrap: balance;
                }

                .sectionHead p {
                    margin: 16px 0 0;
                    font-size: 1.02rem;
                    line-height: 1.75;
                    color: rgba(232, 228, 220, 0.78);
                }

                .cardsGrid {
                    display: grid;
                    gap: 18px;
                }

                .cardsGrid--4 {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }

                .cardsGrid--2 {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .infoCard {
                    padding: 24px;
                    border-radius: 24px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    background:
                            linear-gradient(180deg, rgba(13, 25, 52, 0.84), rgba(8, 17, 36, 0.95)),
                            rgba(9, 18, 37, 0.92);
                    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
                }

                .infoCard--soft {
                    min-height: 210px;
                }

                .infoCard__icon {
                    width: 44px;
                    height: 44px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                    margin-bottom: 16px;
                    background: rgba(255, 255, 255, 0.06);
                    color: #f0d48a;
                }

                .infoCard h3 {
                    margin: 0;
                    font-size: 1.16rem;
                    line-height: 1.32;
                    color: #f6f0e7;
                }

                .infoCard p {
                    margin: 12px 0 0;
                    font-size: 0.99rem;
                    line-height: 1.72;
                    color: rgba(232, 228, 220, 0.78);
                }

                .aboutGrid {
                    display: grid;
                    grid-template-columns: 1.06fr 0.94fr;
                    gap: 18px;
                }

                .aboutCard {
                    padding: 28px;
                    border-radius: 28px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    background:
                            linear-gradient(180deg, rgba(13, 25, 50, 0.84), rgba(8, 17, 35, 0.95)),
                            rgba(8, 17, 35, 0.92);
                }

                .aboutCard h2 {
                    margin: 0;
                    font-size: clamp(2rem, 3.3vw, 3rem);
                    line-height: 1.05;
                    letter-spacing: -0.04em;
                    color: #f6f0e7;
                    text-wrap: balance;
                }

                .aboutCard p {
                    margin: 16px 0 0;
                    font-size: 1rem;
                    line-height: 1.76;
                    color: rgba(232, 228, 220, 0.78);
                }

                .stepsList {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin-top: 4px;
                }

                .stepRow {
                    display: grid;
                    grid-template-columns: 60px 1fr;
                    gap: 14px;
                    align-items: start;
                }

                .stepRow__index {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 52px;
                    border-radius: 16px;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    color: #f0d48a;
                    font-weight: 800;
                }

                .stepRow__content h3 {
                    margin: 0;
                    color: #f6f0e7;
                    font-size: 1.08rem;
                    line-height: 1.3;
                }

                .stepRow__content p {
                    margin: 8px 0 0;
                    color: rgba(232, 228, 220, 0.78);
                    line-height: 1.7;
                }

                .ctaBox {
                    padding: 30px;
                    border-radius: 30px;
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 24px;
                    align-items: center;
                    border: 1px solid rgba(233, 194, 117, 0.2);
                    background:
                            linear-gradient(135deg, rgba(19, 32, 66, 0.96), rgba(8, 17, 34, 0.98)),
                            rgba(8, 17, 34, 0.96);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
                }

                .ctaBox__content h2 {
                    margin: 0;
                    font-size: clamp(2rem, 3.8vw, 3.15rem);
                    line-height: 1.04;
                    letter-spacing: -0.04em;
                    color: #f6f0e7;
                    text-wrap: balance;
                }

                .ctaBox__content p {
                    margin: 14px 0 0;
                    max-width: 760px;
                    line-height: 1.74;
                    color: rgba(232, 228, 220, 0.78);
                }

                .ctaBox__actions {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    justify-content: flex-end;
                }

                @media (max-width: 1180px) {
                    .landingHeader__inner {
                        grid-template-columns: 1fr;
                        justify-items: start;
                        gap: 14px;
                        padding: 16px 0;
                    }

                    .landingNav {
                        flex-wrap: wrap;
                        justify-content: flex-start;
                        gap: 14px 18px;
                    }

                    .landingHeader__action {
                        width: 100%;
                        justify-content: flex-start;
                    }

                    .heroGrid,
                    .cardsGrid--4,
                    .cardsGrid--2,
                    .aboutGrid,
                    .ctaBox {
                        grid-template-columns: 1fr;
                    }

                    .ctaBox__actions {
                        justify-content: flex-start;
                    }
                }

                @media (max-width: 760px) {
                    .landingContainer {
                        width: min(100% - 24px, 1180px);
                    }

                    .heroShell,
                    .heroMainCard,
                    .heroSideCard,
                    .infoCard,
                    .aboutCard,
                    .ctaBox {
                        padding: 22px;
                        border-radius: 22px;
                    }

                    .heroSection {
                        padding-top: 22px;
                    }

                    .heroTitle {
                        font-size: clamp(2.4rem, 13vw, 4rem);
                        line-height: 0.98;
                    }

                    .heroSideCard__title,
                    .sectionHead h2,
                    .aboutCard h2,
                    .ctaBox__content h2 {
                        line-height: 1.08;
                    }

                    .stepRow {
                        grid-template-columns: 50px 1fr;
                    }

                    .landingBtn,
                    .landingCabinetBtn {
                        width: 100%;
                    }

                    .heroActions,
                    .ctaBox__actions {
                        flex-direction: column;
                    }
                }
            `}</style>
        </>
    );
}