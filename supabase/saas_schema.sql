-- ═══════════════════════════════════════════════════════
--  SAAS UPGRADE: USER PROFILES & TIERS
-- ═══════════════════════════════════════════════════════

-- ── 1. Profiles Table ────────────────────────────────
-- Stores whether a user is Pro and their Stripe info
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  is_pro            boolean default false,
  stripe_customer_id text,
  updated_at        timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- ── 2. RLS Policies for Profiles ─────────────────────
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Service role (Edge Functions) can update anything
drop policy if exists "Service role can manage all profiles" on public.profiles;
create policy "Service role can manage all profiles"
  on public.profiles for all
  using (true)
  with check (true);

-- ── 3. Automation: Create Profile on Signup ──────────
-- Function that gets triggered on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, is_pro)
  values (new.id, false);
  return new;
end;
$$;

-- The trigger itself
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 4. Retroactive fix ───────────────────────────────
-- If there are existing users, create profiles for them now
insert into public.profiles (id, is_pro)
select id, false from auth.users
on conflict (id) do nothing;

-- ── 5. Add Profile Check to Subscriptions (Optional) ──
-- We'll handle the subscription limit in the App logic (JS)
-- but having this data ready is essential for SaaS.
