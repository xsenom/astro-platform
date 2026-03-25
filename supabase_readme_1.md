# Изменения Supabase (этап 1)

## Что добавлено

### 1) Расширение `profiles`
Добавлены поля:
- `zodiac_sign text` — знак зодиака для аналитики и сегментов.
- `utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_referrer` — UTM/источник пользователя.
- `marketing_email_opt_in boolean default true` — можно ли отправлять email-рассылки.
- `is_blocked boolean default false` — блокировка пользователя админом.

### 2) Таблица доп. анкет `user_related_profiles`
Таблица для хранения «дополнительных людей» пользователя:
- владелец (`user_id`),
- ФИО, дата/время/город рождения,
- тип связи (`relation_label`),
- заметки (`notes`).

Важно: эти анкеты предназначены для админской информации и не должны использоваться в расчетах.

### 3) RLS для `user_related_profiles`
Включен RLS и созданы политики:
- `select/insert/update/delete` только для владельца записи (`auth.uid() = user_id`).

### 4) События доставки писем
Добавлена таблица `email_delivery_events` для хранения статусов (дошло/не дошло/открыто и т.д.) по рассылкам.

## API-изменения

### `/api/admin/users`
- `GET`: теперь возвращает UTM, `zodiac_sign`, `marketing_email_opt_in`, `is_blocked`.
- `PATCH`: сохраняет новые поля + вычисляет знак зодиака по `birth_date`.
- `POST`:
  - `set_blocked` / `set_unblocked` — блокировка/разблокировка.
  - `merge_by_email` — объединение карточек по email (покупки/расчеты/поддержка/анкеты переводятся на основную карточку).

### `/api/admin/email-campaigns`
- Новые сегменты по знакам зодиака.
- Сегмент `manual_list` для рассылки на конкретный список email.
- Исключение из массовых рассылок пользователей с `is_blocked=true` или `marketing_email_opt_in=false`.

### `/api/admin/summary`
- Возвращает сегменты по зодиаку.
- Возвращает `email_delivery_stats` на основе `email_delivery_events`.

## Файлы миграций
- `supabase/migrations/20260325110000_profile_questionnaire_and_admin_extensions.sql`
- `supabase/migrations/20260325143000_marketing_contacts.sql`

## Дополнительно для ручных рассылок
- Добавлена таблица `marketing_contacts` для адресов, которых может не быть среди зарегистрированных пользователей.
- При отправке сегмента `manual_list` новые email автоматически записываются в `marketing_contacts`.
