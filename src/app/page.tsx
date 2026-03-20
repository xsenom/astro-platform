import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

const mainActions = [
  {
    title: "Личный разбор и консультация",
    text: "Подробный разбор натальной карты, текущего периода и ваших главных вопросов.",
    href: "#services",
  },
  {
    title: "Прогнозы и важные периоды",
    text: "Подсветка сильных дат, точек роста и периодов, где особенно важно действовать осознанно.",
    href: "#services",
  },
  {
    title: "Личный кабинет",
    text: "Войти, посмотреть сохранённые материалы, получить доступ к расчётам и сопровождению.",
    href: "/login",
  },
  {
    title: "Описание сервиса",
    text: "Как проходит работа, что получает клиент и зачем нужен кабинет на платформе.",
    href: "#service-about",
  },
  {
    title: "Связь и запись",
    text: "Оставить запрос, обсудить формат консультации и подобрать подходящий вариант работы.",
    href: "#contacts",
  },
];

const servicePoints = [
  "индивидуальные консультации и разборы по вашей ситуации",
  "астрологические прогнозы на период, месяц и важные жизненные этапы",
  "удобный личный кабинет с материалами и доступом к сервису",
];

export default function Home() {
  return (
    <main className="landingMiniShell">
      <section className="landingMiniBoard ambient">
        <p className="landingMiniTop">Главная страница</p>

        <div className="landingMiniHeader">
          <div>
            <p className="landingMiniBrand">Центр прогнозов Татьяны Ермолиной</p>
            <nav className="landingMiniNav" aria-label="Навигация по лендингу">
              <a href="#services">прогнозы</a>
              <a href="#consulting">консультации</a>
              <Link href="/login">личный кабинет</Link>
              <a href="#service-about">описание сервиса</a>
            </nav>
          </div>
          <div className="landingMiniBadge">
            <Sparkles size={15} />
            астрологическая платформа
          </div>
        </div>

        <div className="landingMiniGrid">
          <div className="landingMiniActions">
            {mainActions.map((item) => {
              const content = (
                <>
                  <h2>{item.title}</h2>
                  <p>{item.text}</p>
                </>
              );

              return item.href.startsWith("/") ? (
                <Link className="landingMiniActionCard" href={item.href} key={item.title}>
                  {content}
                </Link>
              ) : (
                <a className="landingMiniActionCard" href={item.href} key={item.title}>
                  {content}
                </a>
              );
            })}
          </div>

          <aside className="landingMiniInfoCard">
            <div className="landingMiniInfoBlock" id="service-about">
              <p className="landingMiniInfoKicker">о центре расчётов</p>
              <h1>Татьяна Ермолина — астролог, у которого можно получить разбор, прогноз и доступ к материалам в личном кабинете.</h1>
            </div>

            <div className="landingMiniInfoBlock" id="services">
              <p className="landingMiniInfoKicker">описание нашего сервиса</p>
              <ul>
                {servicePoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>

            <div className="landingMiniInfoBlock" id="contacts">
              <p className="landingMiniInfoKicker">связаться с поддержкой</p>
              <div className="landingMiniInfoActions">
                <Link className="btn btnPrimary" href="/login">
                  Войти в кабинет
                  <ArrowRight size={16} />
                </Link>
                <a className="btn" href="mailto:hello@example.com">Написать на email</a>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="landingDetailRow" id="consulting">
        <article className="landingDetailCard">
          <p className="landingMiniInfoKicker">Консультации</p>
          <h2>Лендинг остаётся первым экраном, а вход в личный кабинет вынесен в отдельную заметную кнопку.</h2>
          <p>
            Такой сценарий разделяет презентацию сервиса и авторизацию: сначала человек видит, чем полезен проект, а затем по кнопке переходит в кабинет для входа, регистрации и работы с материалами.
          </p>
        </article>
      </section>
    </main>
  );
}
