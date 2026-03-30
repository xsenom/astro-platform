create table if not exists public.marketing_guide_requests (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    source text not null default 'uranus_guide_pdf',
    email text not null,
    full_name text,
    status text not null default 'requested',
    email_sent boolean not null default false,
    email_error text,
    sent_at timestamptz,
    request_payload jsonb not null default '{}'::jsonb
);

create index if not exists marketing_guide_requests_created_at_idx on public.marketing_guide_requests(created_at desc);
create index if not exists marketing_guide_requests_source_idx on public.marketing_guide_requests(source);
create index if not exists marketing_guide_requests_status_idx on public.marketing_guide_requests(status);
create index if not exists marketing_guide_requests_email_idx on public.marketing_guide_requests(email);
