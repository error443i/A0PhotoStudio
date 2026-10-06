create table if not exists public.site_settings (
  key text primary key check (key = 'hero_background'),
  value text not null,
  storage_path text,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "Site settings are public" on public.site_settings;
create policy "Site settings are public"
  on public.site_settings for select to anon, authenticated
  using (true);

drop policy if exists "Admins can create site settings" on public.site_settings;
create policy "Admins can create site settings"
  on public.site_settings for insert to authenticated
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can edit site settings" on public.site_settings;
create policy "Admins can edit site settings"
  on public.site_settings for update to authenticated
  using ((select public.is_portfolio_admin()))
  with check ((select public.is_portfolio_admin()));

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

notify pgrst, 'reload schema';
