alter table public.profiles
    add column if not exists zodiac_sign text,
    add column if not exists utm_source text,
    add column if not exists utm_medium text,
    add column if not exists utm_campaign text,
    add column if not exists utm_term text,
    add column if not exists utm_content text,
    add column if not exists utm_referrer text,
    add column if not exists marketing_email_opt_in boolean not null default true,
    add column if not exists is_blocked boolean not null default false;

create table if not exists public.user_related_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    full_name text,
    birth_date date,
    birth_time time,
    birth_city text,
    relation_label text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists user_related_profiles_user_id_idx on public.user_related_profiles(user_id);

alter table public.user_related_profiles enable row level security;

drop policy if exists "user_related_profiles_owner_select" on public.user_related_profiles;
create policy "user_related_profiles_owner_select"
on public.user_related_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "user_related_profiles_owner_insert" on public.user_related_profiles;
create policy "user_related_profiles_owner_insert"
on public.user_related_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "user_related_profiles_owner_update" on public.user_related_profiles;
create policy "user_related_profiles_owner_update"
on public.user_related_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_related_profiles_owner_delete" on public.user_related_profiles;
create policy "user_related_profiles_owner_delete"
on public.user_related_profiles
for delete
using (auth.uid() = user_id);

create table if not exists public.email_delivery_events (
    id uuid primary key default gen_random_uuid(),
    recipient_id uuid null references public.email_campaign_recipients(id) on delete cascade,
    campaign_id uuid null references public.email_campaigns(id) on delete cascade,
    profile_id uuid,
    email text,
    event_type text not null,
    event_status text,
    event_payload jsonb,
    created_at timestamptz not null default now()
);

create index if not exists email_delivery_events_campaign_id_idx on public.email_delivery_events(campaign_id);
create index if not exists email_delivery_events_recipient_id_idx on public.email_delivery_events(recipient_id);
