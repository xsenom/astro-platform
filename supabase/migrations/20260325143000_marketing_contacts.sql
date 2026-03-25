create table if not exists public.marketing_contacts (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    full_name text,
    source text not null default 'manual_import',
    marketing_email_opt_in boolean not null default true,
    created_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists marketing_contacts_created_at_idx on public.marketing_contacts(created_at desc);
create index if not exists marketing_contacts_source_idx on public.marketing_contacts(source);
