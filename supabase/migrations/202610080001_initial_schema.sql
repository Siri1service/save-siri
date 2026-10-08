create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'การเงินของฉัน',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  color text not null default '#4c8c72',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (household_id, name, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  amount numeric(14, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.validate_transaction_category()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'category must belong to the transaction household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_transaction_category_before_write on public.transactions;
create trigger validate_transaction_category_before_write
before insert or update of category_id, household_id on public.transactions
for each row execute function public.validate_transaction_category();

create index if not exists transactions_household_occurred_idx on public.transactions (household_id, occurred_at desc);
create index if not exists categories_household_type_idx on public.categories (household_id, type);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null,
  invited_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (household_id, email)
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_admin
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

create or replace function public.accept_household_invitation()
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  invite public.invitations%rowtype;
  account_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if account_email = '' then
    return null;
  end if;

  select * into invite
  from public.invitations
  where lower(email) = account_email and accepted_at is null
  order by created_at
  limit 1
  for update;

  if invite.id is null then
    return null;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (invite.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = invite.id;
  return invite.household_id;
end;
$$;

create or replace function public.admin_overview()
returns table (user_count bigint, household_count bigint, transaction_count bigint, income_total numeric, expense_total numeric)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from auth.users),
    (select count(*) from public.households),
    (select count(*) from public.transactions),
    coalesce((select sum(amount) from public.transactions where type = 'income'), 0),
    coalesce((select sum(amount) from public.transactions where type = 'expense'), 0);
end;
$$;

create or replace function public.bootstrap_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  pending_invite public.invitations%rowtype;
  account_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'สมาชิก'
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, account_name)
  on conflict (id) do nothing;

  select * into pending_invite
  from public.invitations
  where lower(email) = lower(new.email) and accepted_at is null
  order by created_at
  limit 1
  for update;

  if pending_invite.id is not null then
    insert into public.household_members (household_id, user_id, role)
    values (pending_invite.household_id, new.id, 'member')
    on conflict (household_id, user_id) do nothing;
    update public.invitations set accepted_at = now() where id = pending_invite.id;
    return new;
  end if;

  insert into public.households (name) values ('การเงินของ ' || account_name)
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_household_id, new.id, 'owner');

  insert into public.categories (household_id, name, type, color, created_by) values
    (new_household_id, 'เงินเดือน', 'income', '#4c8c72', new.id),
    (new_household_id, 'รายได้เสริม', 'income', '#85a878', new.id),
    (new_household_id, 'อาหาร', 'expense', '#dc8665', new.id),
    (new_household_id, 'เดินทาง', 'expense', '#d2a044', new.id),
    (new_household_id, 'ที่พักอาศัย', 'expense', '#7487a0', new.id),
    (new_household_id, 'ช้อปปิ้ง', 'expense', '#ad7890', new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.bootstrap_new_user();

do $$
declare
  existing_user auth.users%rowtype;
  assigned_household_id uuid;
  account_name text;
begin
  for existing_user in select * from auth.users loop
    account_name := coalesce(
      existing_user.raw_user_meta_data ->> 'full_name',
      nullif(split_part(coalesce(existing_user.email, ''), '@', 1), ''),
      'สมาชิก'
    );

    insert into public.profiles (id, display_name)
    values (existing_user.id, account_name)
    on conflict (id) do nothing;

    if not exists (
      select 1 from public.household_members
      where user_id = existing_user.id
    ) then
      select household_id into assigned_household_id
      from public.invitations
      where lower(email) = lower(existing_user.email) and accepted_at is null
      order by created_at
      limit 1;

      if assigned_household_id is not null then
        insert into public.household_members (household_id, user_id, role)
        values (assigned_household_id, existing_user.id, 'member')
        on conflict (household_id, user_id) do nothing;
        update public.invitations
        set accepted_at = now()
        where household_id = assigned_household_id
          and lower(email) = lower(existing_user.email)
          and accepted_at is null;
      else
        insert into public.households (name)
        values ('การเงินของ ' || account_name)
        returning id into assigned_household_id;

        insert into public.household_members (household_id, user_id, role)
        values (assigned_household_id, existing_user.id, 'owner');

        insert into public.categories (household_id, name, type, color, created_by) values
          (assigned_household_id, 'เงินเดือน', 'income', '#4c8c72', existing_user.id),
          (assigned_household_id, 'รายได้เสริม', 'income', '#85a878', existing_user.id),
          (assigned_household_id, 'อาหาร', 'expense', '#dc8665', existing_user.id),
          (assigned_household_id, 'เดินทาง', 'expense', '#d2a044', existing_user.id),
          (assigned_household_id, 'ที่พักอาศัย', 'expense', '#7487a0', existing_user.id),
          (assigned_household_id, 'ช้อปปิ้ง', 'expense', '#ad7890', existing_user.id);
      end if;
    end if;
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.invitations enable row level security;

drop policy if exists "Profiles are visible to their owner and admins" on public.profiles;
drop policy if exists "Households are visible to members and admins" on public.households;
drop policy if exists "Members are visible within their household" on public.household_members;
drop policy if exists "Categories are visible to household members" on public.categories;
drop policy if exists "Household members manage categories" on public.categories;
drop policy if exists "Transactions are visible to household members" on public.transactions;
drop policy if exists "Household members create transactions" on public.transactions;
drop policy if exists "Household members update transactions" on public.transactions;
drop policy if exists "Household members delete transactions" on public.transactions;
drop policy if exists "Household members can view invitations" on public.invitations;

create policy "Profiles are visible to their owner and admins"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Households are visible to members and admins"
on public.households for select to authenticated
using ((select public.is_household_member(id)) or (select public.is_admin()));

create policy "Members are visible within their household"
on public.household_members for select to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()));

create policy "Categories are visible to household members"
on public.categories for select to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()));
create policy "Household members manage categories"
on public.categories for all to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()))
with check ((select public.is_household_member(household_id)) or (select public.is_admin()));

create policy "Transactions are visible to household members"
on public.transactions for select to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()));
create policy "Household members create transactions"
on public.transactions for insert to authenticated
with check ((select public.is_household_member(household_id)) or (select public.is_admin()));
create policy "Household members update transactions"
on public.transactions for update to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()))
with check ((select public.is_household_member(household_id)) or (select public.is_admin()));
create policy "Household members delete transactions"
on public.transactions for delete to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()));

create policy "Household members can view invitations"
on public.invitations for select to authenticated
using ((select public.is_household_member(household_id)) or (select public.is_admin()));

grant usage on schema public to authenticated;
grant select on public.profiles, public.households, public.household_members, public.invitations to authenticated;
grant select, insert, update, delete on public.categories, public.transactions to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.accept_household_invitation() to authenticated;
grant execute on function public.admin_overview() to authenticated;
revoke all on function public.is_admin() from public;
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
revoke all on function public.accept_household_invitation() from public;
revoke all on function public.admin_overview() from public;
revoke all on function public.bootstrap_new_user() from public;
revoke all on function public.validate_transaction_category() from public;