-- ═══════════════════════════════════════════════════════
--  SUBSCRIPTION SENTINEL – DATABASE SCHEMA
--  Run this entire file in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- ── 1. Enable RLS on auth.users ──────────────────────
-- Note: auth.users is managed by Supabase, RLS is handled internally.
-- alter table auth.users enable row level security;

-- ── 2. Subscriptions table ───────────────────────────
create table if not exists public.subscriptions (
  id               uuid    primary key default gen_random_uuid(),
  user_id          uuid    references auth.users(id) on delete cascade not null,
  name             text    not null,
  amount           decimal(10,2) not null check (amount >= 0),
  billing_cycle    text    not null check (billing_cycle in ('monthly','yearly','weekly','quarterly')),
  next_billing_date date   not null,
  category         text    not null,
  notes            text,
  active           boolean default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ── 3. Enable RLS on subscriptions ───────────────────
alter table public.subscriptions enable row level security;

-- ── 4. RLS Policies for subscriptions ────────────────
-- Drop first so the script is safe to re-run
drop policy if exists "Users can view own subscriptions"    on public.subscriptions;
drop policy if exists "Users can insert own subscriptions"  on public.subscriptions;
drop policy if exists "Users can update own subscriptions"  on public.subscriptions;
drop policy if exists "Users can delete own subscriptions"  on public.subscriptions;

-- Users can SELECT only their own rows
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can INSERT only for themselves
create policy "Users can insert own subscriptions"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

-- Users can UPDATE only their own rows
create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid() = user_id);

-- Users can DELETE only their own rows
create policy "Users can delete own subscriptions"
  on public.subscriptions for delete
  using (auth.uid() = user_id);

-- ── 5. updated_at trigger ────────────────────────────
create extension if not exists moddatetime schema extensions;

drop trigger if exists handle_updated_at on public.subscriptions;
create trigger handle_updated_at
  before update on public.subscriptions
  for each row
  execute procedure moddatetime(updated_at);

-- ── 6. Reminder Logs table ───────────────────────────
create table if not exists public.reminder_logs (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    references auth.users(id) on delete cascade not null,
  subscription_id uuid    references public.subscriptions(id) on delete cascade not null,
  sent_at         timestamptz default now(),
  billing_date    date    not null
);

-- Enable RLS on reminder_logs
alter table public.reminder_logs enable row level security;

-- Drop first so the script is safe to re-run
drop policy if exists "Users can view own reminder logs"      on public.reminder_logs;
drop policy if exists "Service role can insert reminder logs" on public.reminder_logs;

-- Users can view only their own reminder logs
create policy "Users can view own reminder logs"
  on public.reminder_logs for select
  using (auth.uid() = user_id);

-- Service role can insert logs (Edge Function uses service key)
create policy "Service role can insert reminder logs"
  on public.reminder_logs for insert
  with check (true);

-- ── 7. Index for performance ─────────────────────────
create index if not exists idx_subscriptions_user_id
  on public.subscriptions(user_id);

create index if not exists idx_subscriptions_next_billing
  on public.subscriptions(next_billing_date);

create index if not exists idx_subscriptions_active
  on public.subscriptions(active);

create index if not exists idx_reminder_logs_user_date
  on public.reminder_logs(user_id, billing_date);

-- ── 8. Helpful View: subscriptions with monthly cost ─
create or replace view public.subscriptions_with_monthly_cost as
select
  *,
  case billing_cycle
    when 'monthly'   then amount
    when 'yearly'    then amount / 12
    when 'quarterly' then amount / 3
    when 'weekly'    then amount * 52 / 12
    else amount
  end as monthly_cost
from public.subscriptions;
