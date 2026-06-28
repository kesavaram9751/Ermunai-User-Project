-- Ermunai Organic Farm Foods Supabase schema
-- Run in the Supabase SQL editor before using the migrated app.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_json_table(table_name text)
returns void
language plpgsql
as $$
declare
  trigger_name text := 'set_' || lower(regexp_replace(table_name, '[^a-zA-Z0-9]+', '_', 'g')) || '_updated_at';
begin
  execute format('
    create table if not exists public.%I (
      id text primary key,
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', table_name);

  execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
  execute format('
    create trigger %I
    before update on public.%I
    for each row execute function public.set_updated_at()', trigger_name, table_name);

  execute format('alter table public.%I enable row level security', table_name);
end;
$$;

select public.create_json_table(name)
from (
  values
    ('users'),
    ('products'),
    ('categories'),
    ('orders'),
    ('payments'),
    ('coupons'),
    ('blogs'),
    ('recipes'),
    ('reviews'),
    ('notifications'),
    ('supportTickets'),
    ('settings'),
    ('analytics'),
    ('newsletter'),
    ('refundRequests')
) as tables(name);

create index if not exists idx_products_category on public.products ((data->>'category'));
create index if not exists idx_products_disabled on public.products ((data->>'disabled'));
create index if not exists idx_orders_userid on public.orders ((data->>'userid'));
create index if not exists idx_orders_date_placed on public.orders ((data->>'datePlaced'));
create index if not exists idx_blogs_status on public.blogs ((data->>'status'));
create index if not exists idx_blogs_published_at on public.blogs ((data->>'publishedAt'));
create index if not exists idx_recipes_status on public.recipes ((data->>'status'));
create index if not exists idx_tickets_userid on public."supportTickets" ((data->>'userId'));
create index if not exists idx_tickets_userid_legacy on public."supportTickets" ((data->>'userid'));

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select data->>'role'
  from public.users
  where id = auth.uid()::text
  limit 1
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('Super Admin', 'Admin')
    or public.current_user_email() = 'ermunaiorganicfarm@gmail.com'
$$;

create or replace function public.has_admin_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = any(roles)
    or (
      public.current_user_email() = 'ermunaiorganicfarm@gmail.com'
      and ('Super Admin' = any(roles) or 'Admin' = any(roles))
    )
$$;

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
for select using (coalesce(data->>'disabled', 'false') <> 'true');

drop policy if exists "admin write products" on public.products;
create policy "admin write products" on public.products
for all using (public.has_admin_role(array['Super Admin','Admin','Inventory Manager']))
with check (public.has_admin_role(array['Super Admin','Admin','Inventory Manager']));

drop policy if exists "public read published blogs" on public.blogs;
create policy "public read published blogs" on public.blogs
for select using (coalesce(data->>'status', 'published') = 'published' or public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "admin write blogs" on public.blogs;
create policy "admin write blogs" on public.blogs
for all using (public.has_admin_role(array['Super Admin','Admin','Inventory Manager','Support Staff','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Inventory Manager','Support Staff','Marketing Team']));

drop policy if exists "public read published recipes" on public.recipes;
create policy "public read published recipes" on public.recipes
for select using (coalesce(data->>'status', 'published') = 'published' or public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "admin write recipes" on public.recipes;
create policy "admin write recipes" on public.recipes
for all using (public.has_admin_role(array['Super Admin','Admin','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "public read categories settings coupons" on public.categories;
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories for select using (true);

drop policy if exists "admin write categories" on public.categories;
create policy "admin write categories" on public.categories
for all using (public.has_admin_role(array['Super Admin','Admin','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "public read settings" on public.settings;
create policy "public read settings" on public.settings for select using (true);

drop policy if exists "admin write settings" on public.settings;
create policy "admin write settings" on public.settings
for all using (public.has_admin_role(array['Super Admin','Admin','Inventory Manager','Support Staff','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Inventory Manager','Support Staff','Marketing Team']));

drop policy if exists "public read coupons" on public.coupons;
create policy "public read coupons" on public.coupons
for select using (coalesce(data->>'disabled', 'false') <> 'true');

drop policy if exists "admin manage coupons" on public.coupons;
create policy "admin manage coupons" on public.coupons
for all using (public.has_admin_role(array['Super Admin','Admin','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "users own profile" on public.users;
create policy "users own profile" on public.users
for select using (id = auth.uid()::text or public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "users update own profile" on public.users;
create policy "users update own profile" on public.users
for insert with check (id = auth.uid()::text or public.is_admin());

drop policy if exists "users modify own profile" on public.users;
create policy "users modify own profile" on public.users
for update using (id = auth.uid()::text or public.is_admin())
with check (id = auth.uid()::text or public.is_admin());

drop policy if exists "users read own orders" on public.orders;
create policy "users read own orders" on public.orders
for select using (data->>'userid' = auth.uid()::text or public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "users create own orders" on public.orders;
create policy "users create own orders" on public.orders
for insert with check (data->>'userid' = auth.uid()::text or public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "admin update orders" on public.orders;
create policy "admin update orders" on public.orders
for update using (public.has_admin_role(array['Super Admin','Admin','Support Staff']))
with check (public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "users read own payments" on public.payments;
create policy "users read own payments" on public.payments
for select using (data->>'userid' = auth.uid()::text or public.is_admin());

drop policy if exists "users create own payments" on public.payments;
create policy "users create own payments" on public.payments
for insert with check (data->>'userid' = auth.uid()::text or public.is_admin());

drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews" on public.reviews for select using (true);

drop policy if exists "authenticated create reviews" on public.reviews;
create policy "authenticated create reviews" on public.reviews
for insert to authenticated
with check ((data->>'userId' = auth.uid()::text) or (data->>'userid' = auth.uid()::text));

drop policy if exists "admin manage reviews" on public.reviews;
create policy "admin manage reviews" on public.reviews
for all using (public.has_admin_role(array['Super Admin','Admin','Support Staff','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Support Staff','Marketing Team']));

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
for select using ((data->>'userId' = auth.uid()::text) or (data->>'userid' = auth.uid()::text) or public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "admin manage notifications" on public.notifications;
create policy "admin manage notifications" on public.notifications
for all using (public.has_admin_role(array['Super Admin','Admin','Support Staff']))
with check (public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "admin manage analytics" on public.analytics;
create policy "admin manage analytics" on public.analytics
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public create newsletter" on public.newsletter;
create policy "public create newsletter" on public.newsletter for insert with check (true);

drop policy if exists "admin manage newsletter" on public.newsletter;
create policy "admin manage newsletter" on public.newsletter
for all using (public.has_admin_role(array['Super Admin','Admin','Marketing Team']))
with check (public.has_admin_role(array['Super Admin','Admin','Marketing Team']));

drop policy if exists "users create support tickets" on public."supportTickets";
create policy "users create support tickets" on public."supportTickets"
for insert with check ((data->>'userId' = auth.uid()::text) or (data->>'userid' = auth.uid()::text));

drop policy if exists "users read support tickets" on public."supportTickets";
create policy "users read support tickets" on public."supportTickets"
for select using ((data->>'userId' = auth.uid()::text) or (data->>'userid' = auth.uid()::text) or public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "admin manage support tickets" on public."supportTickets";
create policy "admin manage support tickets" on public."supportTickets"
for all using (public.has_admin_role(array['Super Admin','Admin','Support Staff']))
with check (public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop policy if exists "admin manage payments" on public.payments;
create policy "admin manage payments" on public.payments
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin manage refunds" on public."refundRequests";
create policy "admin manage refunds" on public."refundRequests"
for all using (public.has_admin_role(array['Super Admin','Admin','Support Staff']))
with check (public.has_admin_role(array['Super Admin','Admin','Support Staff']));

drop function if exists public.create_json_table(text);
