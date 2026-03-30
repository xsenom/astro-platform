alter table public.marketing_guide_requests
    add column if not exists accepted_personal_data boolean not null default false,
    add column if not exists accepted_ads boolean not null default false;

create index if not exists marketing_guide_requests_accepted_personal_data_idx
    on public.marketing_guide_requests(accepted_personal_data);

create index if not exists marketing_guide_requests_accepted_ads_idx
    on public.marketing_guide_requests(accepted_ads);
