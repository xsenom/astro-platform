# Email / Marketing Supabase setup

Если на дашборде рассылок появляется ошибка вида:
- `column email_campaigns.opened_count does not exist`
- `relation marketing_guide_requests does not exist`

значит в Supabase не применены новые миграции.

## Что нужно сделать

Примените миграции в Supabase (локально или через CI):

```bash
supabase db push
```

или выполните нужные SQL вручную в SQL Editor.

## Критичные миграции

1. Трекинг email-кампаний:
- `supabase/migrations/20260325170000_email_campaign_tracking.sql`

Добавляет в `email_campaigns`:
- `opened_count`
- `clicked_count`
- `unsubscribed_count`

И в `email_campaign_recipients`:
- `opened_at`
- `clicked_at`
- `unsubscribed_at`

2. Логи заявок «Уран в Близнецах»:
- `supabase/migrations/20260330120000_marketing_guide_request_logs.sql`
- `supabase/migrations/20260330133000_marketing_guide_request_consents.sql`

Создаёт таблицу `marketing_guide_requests`:
- статус заявки (`requested/failed/issued`)
- флаг `email_sent`
- текст ошибки `email_error`
- `sent_at`
- явные флаги согласий: `accepted_personal_data`, `accepted_ads`

3. Лиды «Благоприятные дни на месяц»:
- `supabase/migrations/20260330150000_favorable_days_leads.sql`

Создаёт таблицу `favorable_days_requests`:
- данные формы для расчёта,
- статус заявки (`requested/failed/sent`),
- факт отправки в почту (`email_sent`),
- текст ошибки (`email_error`).

## Как проверить после применения

1. Откройте `/admin/dashboard` — ошибок 500 быть не должно.
2. Отправьте тестовую заявку на `/guide/uran-v-bliznetsah`.
3. Проверьте, что в `marketing_guide_requests` появляется запись со статусом:
   - `issued` при успешной выдаче путеводителя,
   - `failed` с причиной, если SMTP/конфиг сломан.
4. Проверьте отписки:
   - в `marketing_contacts` у контактов `source='uranus_guide_pdf'` должен обновляться `marketing_email_opt_in=false`.

## Примечание по совместимости

`/api/admin/mailing-dashboard` уже имеет fallback для старой схемы `email_campaigns` (если нет `opened_count/clicked_count/unsubscribed_count`, данные откроются с нулями), но миграции всё равно нужно применить для корректной статистики.

## Текущий режим выдачи путеводителя

На текущем этапе `POST /api/marketing/guide-request` **не отправляет письмо** пользователю — путеводитель выдаётся сразу по ссылке на странице.  
В таблице `marketing_guide_requests` заявка помечается статусом `issued`, а `email_sent=false`.
