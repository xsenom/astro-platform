create table if not exists public.favorable_days_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    full_name text not null,
    email text not null,
    birth_date text not null,
    birth_time text not null,
    birth_city text not null,
    months integer not null default 1,
    status text not null default 'requested',
    email_sent boolean not null default false,
    email_error text,
    result_text text,
    sent_at timestamptz
);

create index if not exists favorable_days_requests_created_at_idx on public.favorable_days_requests(created_at desc);
create index if not exists favorable_days_requests_status_idx on public.favorable_days_requests(status);
create index if not exists favorable_days_requests_email_idx on public.favorable_days_requests(email);
