create extension if not exists pgcrypto;

create table if not exists public.email_campaigns (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    sent_at timestamptz null,
    created_by uuid not null,
    segment_key text not null,
    subject text not null,
    html_body text null,
    text_body text null,
    status text not null default 'draft',
    recipients_count integer not null default 0,
    sent_count integer not null default 0,
    failed_count integer not null default 0
);

create table if not exists public.email_campaign_recipients (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
    profile_id uuid null,
    email text not null,
    status text not null,
    error_message text null,
    created_at timestamptz not null default now()
);

create index if not exists email_campaigns_created_at_idx on public.email_campaigns(created_at desc);
create index if not exists email_campaign_recipients_campaign_id_idx on public.email_campaign_recipients(campaign_id);
