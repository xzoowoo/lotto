-- Supabase SQL Editor에서 실행하세요.
-- Table: signups (이름, 휴대폰, 이메일)

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2),
  phone text not null,
  email text not null,
  source text not null default 'lotto-draw-popup',
  created_at timestamptz not null default now()
);

create unique index if not exists signups_email_key on public.signups (email);
create index if not exists signups_created_at_idx on public.signups (created_at desc);

alter table public.signups enable row level security;

-- 클라이언트(anon) 직접 접근 차단. Vercel API는 service_role 키로 저장합니다.
