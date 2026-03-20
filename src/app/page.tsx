import Link from "next/link";
import { ArrowRight, Sparkles, Star, MoonStar, ShieldCheck } from "lucide-react";

const offerings = [
  {
    title: "Личная консультация",
    text: "Разбор текущего периода, сильных сторон натальной карты, внутренних опор и возможных сценариев развития на ближайшее время.",
  },
  {
    title: "Прогноз на важный период",
    text: "Подготовка к переезду, смене работы, отношениям, запуску проекта или другому значимому жизненному этапу.",
  },
  {
    title: "Совместимость и отношения",
    text: "Мягкий анализ динамики в паре, причин повторяющихся сценариев и точек роста во взаимодействии с близким человеком.",
  },
  {
    title: "Поддержка после разбора",
    text: "Практичные рекомендации, письменные выводы и понятные ориентиры, к которым удобно возвращаться после консультации.",
  },
];

const principles = [
  "бережная подача без давления и категоричных формулировок",
  "объяснение сложных астрологических тем простым человеческим языком",
  "фокус на реальной жизни: отношениях, работе, самоощущении и выборе",
  "пространство для вопросов, уточнений и спокойного диалога",
];

export default function Home() {
  return (
    <main className="landingShell">
      <section className="landingHero ambient">
        <div className="landingBadge">
          <Sparkles size={16} />
          мини-лендинг астролога
        </div>

        <div className="landingGrid">
          <div className="landingIntro">
            <p className="landingEyebrow">Центр прогнозов Татьяны Ермолиной</p>
            <h1 className="landingTitle">Татьяна Ермолина — астролог, который помогает увидеть логику периода и принять решение спокойнее.</h1>
            <p className="landingLead">
              На этой странице собрана презентация астролога Татьяны Ермолиной в формате минилендинга: чем может быть полезна консультация, как проходит работа и что получает клиент после разбора.
            </p>
            <div className="landingActions">
              <Link className="btn btnPrimary" href="/cabinet/profile">
                Перейти в личный кабинет
                <ArrowRight size={16} />
              </Link>
              <a className="btn" href="#about-astrologer">
                Узнать подробнее
              </a>
            </div>
          </div>

          <aside className="landingFeatureCard orbitCard">
            <div className="orbitRing orbitRingOne" />
            <div className="orbitRing orbitRingTwo" />
            <div className="orbitCenter">
              <MoonStar size={28} />
            </div>
            <div className="landingFeatureContent">
              <h2>О чём этот проект</h2>
              <p>
                Платформа объединяет консультации, прогнозы и личный кабинет, где удобно хранить материалы, возвращаться к выводам и оставаться на связи.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="landingSection" id="about-astrologer">
        <div className="sectionHeading">
          <span className="sectionKicker">Об астрологе</span>
          <h2>Как можно представить Татьяну Ермолину на сайте</h2>
        </div>
        <div className="landingTextGrid">
          <article className="landingPanel">
            <p>
              Татьяна Ермолина — астролог, к которому можно прийти не только за прогнозом, но и за структурой. Такой формат особенно важен, когда человеку нужно разобраться в себе, увидеть закономерности событий и снизить тревогу перед выбором.
            </p>
            <p>
              В тексте лендинга акцент сделан на внимательном сопровождении, понятной подаче и прикладной пользе консультации: не просто описание карты, а перевод астрологических символов на язык повседневных решений.
            </p>
          </article>
          <article className="landingPanel softGlow">
            <h3>Подход в работе</h3>
            <ul className="landingList">
              {principles.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="landingSection">
        <div className="sectionHeading">
          <span className="sectionKicker">Услуги</span>
          <h2>Что можно вынести на лендинг отдельными карточками</h2>
        </div>
        <div className="offeringGrid">
          {offerings.map((offering) => (
            <article className="landingPanel offeringCard" key={offering.title}>
              <div className="offeringIcon">
                <Star size={18} />
              </div>
              <h3>{offering.title}</h3>
              <p>{offering.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landingSection">
        <div className="sectionHeading">
          <span className="sectionKicker">Как проходит работа</span>
          <h2>Короткий сценарий взаимодействия с клиентом</h2>
        </div>
        <div className="stepsGrid">
          {[
            "Клиент оставляет запрос и формулирует тему консультации.",
            "Подбирается удобный формат разбора и уточняются исходные данные.",
            "Татьяна Ермолина проводит консультацию и объясняет ключевые акценты периода.",
            "После встречи клиент получает опору: выводы, рекомендации и понятный следующий шаг.",
          ].map((step, index) => (
            <div className="stepCard" key={step}>
              <span className="stepIndex">0{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landingSection">
        <div className="ctaPanel">
          <div>
            <span className="sectionKicker">Доверие и прозрачность</span>
            <h2>В проект уже добавлен общий футтер с политикой конфиденциальности, офертой и блоком для реквизитов ИП.</h2>
          </div>
          <div className="ctaMeta">
            <ShieldCheck size={18} />
            <span>Юридические тексты оформлены как шаблон, реквизиты можно быстро заменить на точные данные.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
