const COMPANY_NAME = "Проект «Личностно-ориентированная Астрология Ермолиной Татьяны»";
const COMPANY_INFO = "ОГРНИП 310618111700022 ИНН 300401721008, ИП Ермолина Т.Н.";
const MAILING_REASON =
    "Вы получили это письмо на электронный адрес {email}, так как подписались на рассылки от Школы Астрологии Ермолиной Татьяны.";

const PRIVACY_URL = "https://ermolina.pro/politika-konfidentsialnosti";
const USER_AGREEMENT_URL = "https://ermolina.pro/soglashenie";
const PERSONAL_DATA_URL = "https://ermolina.pro/soglasie_personaliti";
const ADS_CONSENT_URL = "https://ermolina.pro/soglasie";
const UNSUBSCRIBE_URL =
    "http://service.astrofuture.site/unsubscriptions/c521bdb43cc5598f8e7eef9069c3547dda6b45c3d33b95f4a24f8329f93977f6";

export function buildCommonEmailFooterText(email: string) {
    return [
        "",
        "—",
        COMPANY_NAME,
        COMPANY_INFO,
        "",
        MAILING_REASON.replace("{email}", email),
        "",
        `Политика конфиденциальности: ${PRIVACY_URL}`,
        `Пользовательское соглашение: ${USER_AGREEMENT_URL}`,
        `Согласие на обработку персональных данных: ${PERSONAL_DATA_URL}`,
        `Согласие на получение рекламно-информационных сообщений: ${ADS_CONSENT_URL}`,
        "",
        `Отказаться от рассылки: ${UNSUBSCRIBE_URL}`,
    ].join("\n");
}

export function buildCommonEmailFooterHtml(email: string) {
    return `
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb" />
      <div style="font-size:12px;color:#6b7280;line-height:1.5">
        <p style="margin:0 0 8px"><strong>${COMPANY_NAME}</strong></p>
        <p style="margin:0 0 8px">${COMPANY_INFO}</p>
        <p style="margin:0 0 8px">${MAILING_REASON.replace("{email}", email)}</p>
        <p style="margin:0 0 8px">
          <a href="${PRIVACY_URL}">Политика конфиденциальности</a> ·
          <a href="${USER_AGREEMENT_URL}">Пользовательское соглашение</a> ·
          <a href="${PERSONAL_DATA_URL}">Согласие на обработку персональных данных</a> ·
          <a href="${ADS_CONSENT_URL}">Согласие на рекламно-информационные сообщения</a>
        </p>
        <p style="margin:0"><a href="${UNSUBSCRIBE_URL}">Отказаться от рассылки</a></p>
      </div>
    `;
}

export const legalLinks = {
    privacy: PRIVACY_URL,
    agreement: USER_AGREEMENT_URL,
    personalData: PERSONAL_DATA_URL,
    ads: ADS_CONSENT_URL,
};
