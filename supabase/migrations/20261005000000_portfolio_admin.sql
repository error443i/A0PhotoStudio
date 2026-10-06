create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.featured_stories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  category text not null check (length(trim(category)) > 0),
  year text not null check (length(trim(year)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.story_photos (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.featured_stories(id) on delete cascade,
  image_url text not null,
  storage_path text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to authenticated;

alter table public.admin_users enable row level security;
alter table public.featured_stories enable row level security;
alter table public.story_photos enable row level security;

drop policy if exists "Admins can view their own admin record" on public.admin_users;
create policy "Admins can view their own admin record"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Featured stories are public" on public.featured_stories;
create policy "Featured stories are public"
  on public.featured_stories for select to anon, authenticated
  using (true);

drop policy if exists "Admins can create featured stories" on public.featured_stories;
create policy "Admins can create featured stories"
  on public.featured_stories for insert to authenticated
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can edit featured stories" on public.featured_stories;
create policy "Admins can edit featured stories"
  on public.featured_stories for update to authenticated
  using ((select public.is_portfolio_admin()))
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can delete featured stories" on public.featured_stories;
create policy "Admins can delete featured stories"
  on public.featured_stories for delete to authenticated
  using ((select public.is_portfolio_admin()));

drop policy if exists "Story photos are public" on public.story_photos;
create policy "Story photos are public"
  on public.story_photos for select to anon, authenticated
  using (true);

drop policy if exists "Admins can add story photos" on public.story_photos;
create policy "Admins can add story photos"
  on public.story_photos for insert to authenticated
  with check ((select public.is_portfolio_admin()));

drop policy if exists "Admins can remove story photos" on public.story_photos;
create policy "Admins can remove story photos"
  on public.story_photos for delete to authenticated
  using ((select public.is_portfolio_admin()));

grant select on public.featured_stories, public.story_photos to anon, authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.featured_stories, public.story_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-photos',
  'portfolio-photos',
  true,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Portfolio photos are public" on storage.objects;
create policy "Portfolio photos are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'portfolio-photos');

drop policy if exists "Admins can upload portfolio photos" on storage.objects;
create policy "Admins can upload portfolio photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'portfolio-photos'
    and (select public.is_portfolio_admin())
  );

drop policy if exists "Admins can update portfolio photos" on storage.objects;
create policy "Admins can update portfolio photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'portfolio-photos'
    and (select public.is_portfolio_admin())
  )
  with check (
    bucket_id = 'portfolio-photos'
    and (select public.is_portfolio_admin())
  );

drop policy if exists "Admins can delete portfolio photos" on storage.objects;
create policy "Admins can delete portfolio photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'portfolio-photos'
    and (select public.is_portfolio_admin())
  );

insert into public.featured_stories (id, title, category, year, sort_order)
values
  ('10000000-0000-4000-8000-000000000001', 'The in-between', 'Weddings', '2026', 1),
  ('10000000-0000-4000-8000-000000000002', 'Soft mornings', 'Portraits', '2026', 2),
  ('10000000-0000-4000-8000-000000000003', 'A little wild', 'Couples', '2025', 3),
  ('10000000-0000-4000-8000-000000000004', 'A slower Sunday', 'Lifestyle', '2025', 4)
on conflict (id) do nothing;

insert into public.story_photos (story_id, image_url, sort_order)
select story_id::uuid, image_url, sort_order
from (values
  ('10000000-0000-4000-8000-000000000001', 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=90', 1),
  ('10000000-0000-4000-8000-000000000001', 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=90', 2),
  ('10000000-0000-4000-8000-000000000001', 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1400&q=90', 3),
  ('10000000-0000-4000-8000-000000000001', 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1400&q=90', 4),
  ('10000000-0000-4000-8000-000000000002', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1400&q=90', 1),
  ('10000000-0000-4000-8000-000000000002', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1400&q=90', 2),
  ('10000000-0000-4000-8000-000000000002', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=90', 3),
  ('10000000-0000-4000-8000-000000000002', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1400&q=90', 4),
  ('10000000-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=90', 1),
  ('10000000-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1400&q=90', 2),
  ('10000000-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1400&q=90', 3),
  ('10000000-0000-4000-8000-000000000003', 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1400&q=90', 4),
  ('10000000-0000-4000-8000-000000000004', 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1400&q=90', 1),
  ('10000000-0000-4000-8000-000000000004', 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=90', 2),
  ('10000000-0000-4000-8000-000000000004', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=90', 3),
  ('10000000-0000-4000-8000-000000000004', 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=90', 4)
) as seed(story_id, image_url, sort_order)
where not exists (
  select 1
  from public.story_photos existing
  where existing.story_id = seed.story_id::uuid
    and existing.sort_order = seed.sort_order
);

notify pgrst, 'reload schema';

