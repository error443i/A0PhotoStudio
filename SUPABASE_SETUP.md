# Admin panel setup

The admin panel at `/admin` uses Supabase Auth, Postgres, and Storage. The public portfolio reads its stories from Supabase, so run the setup before deploying the updated site.

## Configure Supabase

1. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local environment and hosting provider. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only environment variable for the admin image upload route. Never put a service-role key in a `NEXT_PUBLIC_` variable or browser code.
2. Create a Redis database (the Upstash free tier is sufficient for low-volume portfolio traffic), then add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-only Vercel environment variables. The app applies distributed per-IP limits to its Telegram webhook and image upload routes, and returns HTTP 503 in production if these settings are missing or unavailable.
3. In Supabase SQL Editor, run [`supabase/migrations/20261005000000_portfolio_admin.sql`](./supabase/migrations/20261005000000_portfolio_admin.sql), [`supabase/migrations/20261006000000_hero_background.sql`](./supabase/migrations/20261006000000_hero_background.sql), [`supabase/migrations/20261007000000_telegram_packages.sql`](./supabase/migrations/20261007000000_telegram_packages.sql), and [`supabase/migrations/20261008000000_harden_portfolio_storage.sql`](./supabase/migrations/20261008000000_harden_portfolio_storage.sql), in that order. The portfolio migration creates the tables and `portfolio-photos` public image bucket, protects writes with row-level security, and seeds the current four stories and their photos. The Telegram packages migration creates the bot package list, protects edits to authorized admins, and seeds the existing three packages. The hardening migration limits new gallery uploads to JPEG, PNG, and WebP files up to 4 MB, disables direct client uploads to the public bucket, and removes unnecessary database write grants. The server upload route verifies the signed-in user and admin record before using the server-only service-role key. Each migration asks PostgREST to reload its schema cache.
4. In Supabase Authentication, create an admin user with email and password. Disable public sign-ups if they are not needed.
5. Authorize the admin account in SQL Editor. Replace `YOUR_LOGIN_EMAIL` with the exact email used to sign in:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'YOUR_LOGIN_EMAIL'
   on conflict (user_id) do nothing;
   ```

Only UUIDs in `admin_users` may edit stories, manage Telegram packages, or upload/delete portfolio photos. An authenticated user who is not on that list cannot write through the application or the Supabase API.

If `/admin` says the account is not authorized, run the query above for the account you intend to use as administrator, then refresh `/admin`. The query does not grant access to any other account.

If `/admin` says it cannot find `public.admin_users` in the schema cache, the migration has not been applied to the Supabase project configured in the site. Run the full SQL file above in that project's SQL Editor, then refresh `/admin`. If the table exists but the same message persists, open Supabase Dashboard → Project Settings → API and use **Reload schema cache**, then refresh the page.

## Use the editor

Visit `/admin` and sign in with the authorized administrator account. The **Photo shoot packages** section lets you add packages, edit their names, prices, and details, or delete packages; the Telegram bot reads the saved list from Supabase. The featured stories section lets you add a story with its title, category, and year. Use **Save details** to edit existing story metadata, **Add photos** to upload one or more JPEG, PNG, or WebP images (up to 4 MB each), and **Remove photo** to delete a photo from a collection. Image uploads are checked by file signature and revalidated in the server route; filenames are generated there. Changes are stored in Supabase and appear on the public portfolio or bot.
