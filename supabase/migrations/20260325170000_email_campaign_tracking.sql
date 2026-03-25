alter table public.email_campaigns
    add column if not exists opened_count integer not null default 0,
    add column if not exists clicked_count integer not null default 0,
    add column if not exists unsubscribed_count integer not null default 0;

alter table public.email_campaign_recipients
    add column if not exists opened_at timestamptz,
    add column if not exists clicked_at timestamptz,
    add column if not exists unsubscribed_at timestamptz;

create index if not exists email_campaign_recipients_opened_at_idx on public.email_campaign_recipients(opened_at);
create index if not exists email_campaign_recipients_clicked_at_idx on public.email_campaign_recipients(clicked_at);
create index if not exists email_campaign_recipients_unsubscribed_at_idx on public.email_campaign_recipients(unsubscribed_at);
