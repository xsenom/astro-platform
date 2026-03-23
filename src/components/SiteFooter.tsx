"use client";

import Link from "next/link";
import { Mail, Phone, Send, MessageCircle, Sparkles } from "lucide-react";

const aboutLinks = [
    { label: "О проекте", href: "/main#about" },
    { label: "Об астрологе", href: "/main#expert" },
    { label: "Форматы работы", href: "/main#formats" },
    { label: "Как это работает", href: "/main#consulting" },
    { label: "Политика конфиденциальности", href: "/privacy" },
    { label: "Согласие на обработку персональных данных", href: "/personal-data" },
    { label: "Публичная оферта", href: "/offer" },
];

const serviceLinks = [
    { label: "Личный кабинет", href: "/cabinet" },
    { label: "Прогнозы", href: "/main#services" },
    { label: "Консультации", href: "/main#formats" },
    { label: "Материалы клиента", href: "/cabinet" },
];

export default function SiteFooter() {
    return (
        <>
            <footer className="astroFooterV2">
                <div className="astroFooterV2__inner">
                    <div className="astroFooterV2__top">
                        <div className="astroFooterV2__brand">
                            <div className="astroFooterV2__brandHead">
                                <div className="astroFooterV2__mark">
                                    <Sparkles size={18} />
                                </div>

                                <div>
                                    <div className="astroFooterV2__brandName">ТАТЬЯНА ЕРМОЛИНА</div>
                                    <div className="astroFooterV2__brandSub">
                                        Центр прогнозов и консультаций
                                    </div>
                                </div>
                            </div>

                            <p className="astroFooterV2__lead">
                                Пространство для персональных астрологических разборов, прогнозов и
                                сохранённых материалов в удобном личном кабинете.
                            </p>

                            <div className="astroFooterV2__contacts">
                                <a
                                    className="astroFooterV2__contact"
                                    href="mailto:info@ermolina-astro.ru"
                                >
                                    <Mail size={16} />
                                    <span>info@ermolina-astro.ru</span>
                                </a>

                                <a
                                    className="astroFooterV2__contact"
                                    href="tel:+79990000000"
                                >
                                    <Phone size={16} />
                                    <span>+7 (999) 000-00-00</span>
                                </a>
                            </div>

                            <div className="astroFooterV2__socials">
                                <a
                                    className="astroFooterV2__social"
                                    href="https://t.me/ermolina"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Telegram"
                                >
                                    <Send size={18} />
                                </a>

                                <a
                                    className="astroFooterV2__social"
                                    href="https://wa.me/79990000000"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="WhatsApp"
                                >
                                    <MessageCircle size={18} />
                                </a>
                            </div>
                        </div>

                        <nav className="astroFooterV2__col" aria-label="О проекте">
                            <h3 className="astroFooterV2__title">О проекте</h3>
                            <ul className="astroFooterV2__list">
                                {aboutLinks.map((item) => (
                                    <li key={item.label}>
                                        <Link href={item.href}>{item.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <nav className="astroFooterV2__col" aria-label="Сервисы">
                            <h3 className="astroFooterV2__title">Сервисы</h3>
                            <ul className="astroFooterV2__list">
                                {serviceLinks.map((item) => (
                                    <li key={item.label}>
                                        <Link href={item.href}>{item.label}</Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>

                        <div className="astroFooterV2__col">
                            <h3 className="astroFooterV2__title">Реквизиты</h3>

                            <div className="astroFooterV2__meta">
                                <p><strong>ИП:</strong> Татьяна Ермолина</p>
                                <p><strong>ИНН:</strong> 000000000000</p>
                                <p><strong>ОГРНИП:</strong> 000000000000000</p>
                                <p><strong>Email:</strong> info@ermolina-astro.ru</p>
                                <p><strong>Телефон:</strong> +7 (999) 000-00-00</p>
                            </div>
                        </div>
                    </div>

                    <div className="astroFooterV2__bottom">
                        <p>© 2022–2026 Центр прогнозов Татьяны Ермолиной. Все права защищены.</p>

                        <div className="astroFooterV2__bottomLinks">
                            <Link href="/privacy">Политика конфиденциальности</Link>
                            <Link href="/offer">Оферта</Link>
                        </div>
                    </div>
                </div>
            </footer>

            <style jsx global>{`
        .astroFooterV2 {
          position: relative;
          padding: 28px 0 36px;
        }

        .astroFooterV2__inner {
          width: min(1180px, calc(100% - 48px));
          margin: 0 auto;
          border-radius: 30px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background:
            linear-gradient(180deg, rgba(12, 24, 49, 0.88), rgba(7, 15, 31, 0.96)),
            rgba(9, 17, 34, 0.94);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24);
          backdrop-filter: blur(10px);
        }

        .astroFooterV2__top {
          display: grid;
          grid-template-columns: minmax(320px, 1.35fr) 0.85fr 0.85fr 1fr;
          gap: 28px;
          padding: 34px 34px 28px;
        }

        .astroFooterV2__brand {
          max-width: 460px;
        }

        .astroFooterV2__brandHead {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .astroFooterV2__mark {
          width: 44px;
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          color: #f0d48a;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(240, 212, 138, 0.18);
          flex-shrink: 0;
        }

        .astroFooterV2__brandName {
          color: #f5efe6;
          font-size: 1.1rem;
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .astroFooterV2__brandSub {
          margin-top: 4px;
          color: #f0d48a;
          font-size: 0.95rem;
          line-height: 1.4;
          font-weight: 500;
        }

        .astroFooterV2__lead {
          margin: 18px 0 0;
          color: rgba(233, 228, 220, 0.78);
          font-size: 0.98rem;
          line-height: 1.75;
        }

        .astroFooterV2__contacts {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 22px;
        }

        .astroFooterV2__contact {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          color: #f5efe6;
          text-decoration: none;
          font-size: 0.97rem;
          line-height: 1.5;
          transition: color 0.18s ease, transform 0.18s ease;
        }

        .astroFooterV2__contact:hover {
          color: #f0d48a;
          transform: translateX(2px);
        }

        .astroFooterV2__socials {
          display: flex;
          gap: 12px;
          margin-top: 22px;
        }

        .astroFooterV2__social {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          color: #f5efe6;
          text-decoration: none;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: transform 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }

        .astroFooterV2__social:hover {
          transform: translateY(-2px);
          color: #f0d48a;
          border-color: rgba(240, 212, 138, 0.28);
        }

        .astroFooterV2__col {
          min-width: 0;
        }

        .astroFooterV2__title {
          margin: 0 0 14px;
          color: #f0d48a;
          font-size: 0.84rem;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .astroFooterV2__list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 11px;
        }

        .astroFooterV2__list li {
          margin: 0;
          padding: 0;
        }

        .astroFooterV2__list a {
          color: rgba(245, 239, 230, 0.82);
          text-decoration: none;
          font-size: 0.97rem;
          line-height: 1.55;
          transition: color 0.18s ease, transform 0.18s ease;
          display: inline-block;
        }

        .astroFooterV2__list a:hover {
          color: #f0d48a;
          transform: translateX(2px);
        }

        .astroFooterV2__meta {
          display: grid;
          gap: 10px;
        }

        .astroFooterV2__meta p {
          margin: 0;
          color: rgba(233, 228, 220, 0.76);
          font-size: 0.96rem;
          line-height: 1.6;
        }

        .astroFooterV2__meta strong {
          color: #f5efe6;
        }

        .astroFooterV2__bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 34px 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .astroFooterV2__bottom p {
          margin: 0;
          color: rgba(233, 228, 220, 0.66);
          font-size: 0.93rem;
          line-height: 1.5;
        }

        .astroFooterV2__bottomLinks {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 16px;
        }

        .astroFooterV2__bottomLinks a {
          color: rgba(245, 239, 230, 0.78);
          text-decoration: none;
          font-size: 0.93rem;
          line-height: 1.4;
          transition: color 0.18s ease;
        }

        .astroFooterV2__bottomLinks a:hover {
          color: #f0d48a;
        }

        @media (max-width: 1180px) {
          .astroFooterV2__top {
            grid-template-columns: 1.2fr 1fr 1fr;
          }

          .astroFooterV2__brand {
            grid-column: 1 / -1;
            max-width: 100%;
          }
        }

        @media (max-width: 900px) {
          .astroFooterV2__top {
            grid-template-columns: 1fr 1fr;
          }

          .astroFooterV2__bottom {
            flex-direction: column;
            align-items: flex-start;
          }

          .astroFooterV2__bottomLinks {
            justify-content: flex-start;
          }
        }

        @media (max-width: 640px) {
          .astroFooterV2 {
            padding: 18px 0 24px;
          }

          .astroFooterV2__inner {
            width: min(100% - 24px, 1180px);
            border-radius: 22px;
          }

          .astroFooterV2__top {
            grid-template-columns: 1fr;
            gap: 22px;
            padding: 22px;
          }

          .astroFooterV2__bottom {
            padding: 16px 22px 20px;
          }

          .astroFooterV2__brandHead {
            align-items: flex-start;
          }

          .astroFooterV2__brandName {
            font-size: 1rem;
          }

          .astroFooterV2__contact {
            width: 100%;
          }
        }
      `}</style>
        </>
    );
}