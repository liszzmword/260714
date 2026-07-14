create extension if not exists pgcrypto;

create table if not exists public.lotto_draws (
  id uuid primary key default gen_random_uuid(),
  main_numbers integer[] not null,
  bonus_number integer not null,
  created_at timestamptz not null default now()
);

create index if not exists lotto_draws_created_at_idx
  on public.lotto_draws (created_at desc);
