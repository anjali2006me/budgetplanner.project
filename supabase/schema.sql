-- BudgetWise · Supabase schema (with authentication)
-- FRESH INSTALL: run this whole file once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ALREADY RAN THE OLD VERSION? Run supabase/auth-migration.sql instead.
--
-- Every row belongs to the logged-in user (user_id = auth.uid()). Row Level Security makes
-- sure a user can only ever read or change their own rows. Sample data is NOT inserted here:
-- the app seeds it for each new user on their first login.

create extension if not exists "pgcrypto";

-- ───────── Tables ─────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  type        text not null check (type in ('income', 'expense')),
  color       text not null default '#64748b',
  created_at  timestamptz not null default now(),
  unique (user_id, name, type)
);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('income', 'expense')),
  amount       numeric(12, 2) not null check (amount > 0),
  category_id  uuid references public.categories (id) on delete set null,
  description  text not null default '',
  date         date not null default current_date,
  created_at   timestamptz not null default now()
);

create table if not exists public.budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid not null unique references public.categories (id) on delete cascade,
  monthly_limit  numeric(12, 2) not null check (monthly_limit > 0),
  created_at     timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_category_idx  on public.transactions (category_id);
create index if not exists categories_user_idx        on public.categories (user_id);
create index if not exists budgets_user_idx           on public.budgets (user_id);

-- ───────── Row Level Security: each user sees only their own rows ─────────
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

drop policy if exists "demo full access" on public.categories;
drop policy if exists "demo full access" on public.transactions;
drop policy if exists "demo full access" on public.budgets;
drop policy if exists "own rows" on public.categories;
drop policy if exists "own rows" on public.transactions;
drop policy if exists "own rows" on public.budgets;

create policy "own rows" on public.categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.transactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
