-- BudgetWise · migration to add authentication
-- Run this ONLY if you already ran the OLD schema.sql (the one without logins).
-- WARNING: it deletes the existing shared sample rows in categories, transactions and budgets,
-- because they don't belong to any user. Each user gets fresh sample data on first login.

-- 1. remove old shared demo data and the open-to-everyone policies
drop policy if exists "demo full access" on public.categories;
drop policy if exists "demo full access" on public.transactions;
drop policy if exists "demo full access" on public.budgets;

delete from public.transactions;
delete from public.budgets;
delete from public.categories;

-- 2. add an owner column to every table
alter table public.categories   add column if not exists user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.transactions add column if not exists user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;
alter table public.budgets      add column if not exists user_id uuid not null default auth.uid() references auth.users (id) on delete cascade;

-- 3. category names must be unique per user, not globally
alter table public.categories drop constraint if exists categories_name_type_key;
alter table public.categories drop constraint if exists categories_user_id_name_type_key;
alter table public.categories add constraint categories_user_id_name_type_key unique (user_id, name, type);

-- 4. indexes
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists categories_user_idx        on public.categories (user_id);
create index if not exists budgets_user_idx           on public.budgets (user_id);

-- 5. Row Level Security: each logged-in user sees only their own rows
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets      enable row level security;

drop policy if exists "own rows" on public.categories;
drop policy if exists "own rows" on public.transactions;
drop policy if exists "own rows" on public.budgets;

create policy "own rows" on public.categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.transactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.budgets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
