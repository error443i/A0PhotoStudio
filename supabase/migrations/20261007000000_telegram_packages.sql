create table if not exists public.telegram_packages (
  id text primary key default gen_random_uuid()::text,
  title text not null check (length(trim(title)) between 1 and 40),
  price text not null check (length(trim(price)) between 1 and 20),
  details text not null check (length(trim(details)) between 1 and 3500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.telegram_packages enable row level security;

drop policy if exists "Telegram packages are public" on public.telegram_packages;
create policy "Telegram packages are public"
  on public.telegram_packages for select to anon, authenticated
  using (true);

drop policy if exists "Admins can create Telegram packages" on public.telegram_packages;
create policy "Admins can create Telegram packages"
  on public.telegram_packages for insert to authenticated
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can edit Telegram packages" on public.telegram_packages;
create policy "Admins can edit Telegram packages"
  on public.telegram_packages for update to authenticated
  using ((select public.is_portfolio_admin()))
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can delete Telegram packages" on public.telegram_packages;
create policy "Admins can delete Telegram packages"
  on public.telegram_packages for delete to authenticated
  using ((select public.is_portfolio_admin()));

grant select on public.telegram_packages to anon, authenticated;
grant insert, update, delete on public.telegram_packages to authenticated;

insert into public.telegram_packages (id, title, price, details, sort_order)
values
  ('mini', 'Mini', '$50', E'30 minutes\n1 location\n10 edited photos\nDelivery in 5 days', 1),
  ('standard', 'Standard', '$120', E'1 hour\n2 locations\n30 edited photos\nDelivery in 7 days', 2),
  ('premium', 'Premium', '$250', E'3 hours\nMultiple locations\n80 edited photos\nPrints included\nDelivery in 10 days', 3)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
