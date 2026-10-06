# Admin panel setup

The admin panel at `/admin` uses Supabase Auth, Postgres, and Storage. The public portfolio reads its stories from Supabase, so run the setup before deploying the updated site.

## Configure Supabase

1. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local environment and hosting provider. Use the project's public anon/publishable key only; never put a service-role key in a `NEXT_PUBLIC_` variable.
2. In Supabase SQL Editor, run [`supabase/migrations/20261005000000_portfolio_admin.sql`](./supabase/migrations/20261005000000_portfolio_admin.sql). It creates the tables and `portfolio-photos` public image bucket, protects writes with row-level security, seeds the current four stories and their photos, and asks PostgREST to reload its schema cache.
3. In Supabase Authentication, create an admin user with email and password. Disable public sign-ups if they are not needed.
4. Authorize the admin account in SQL Editor. Replace `YOUR_LOGIN_EMAIL` with the exact email used to sign in:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'YOUR_LOGIN_EMAIL'
   on conflict (user_id) do nothing;
   ```

Only UUIDs in `admin_users` may edit stories or upload/delete portfolio photos. An authenticated user who is not on that list cannot write through the application or the Supabase API.

If `/admin` says the account is not authorized, run the query above for the account you intend to use as administrator, then refresh `/admin`. The query does not grant access to any other account.

If `/admin` says it cannot find `public.admin_users` in the schema cache, the migration has not been applied to the Supabase project configured in the site. Run the full SQL file above in that project's SQL Editor, then refresh `/admin`. If the table exists but the same message persists, open Supabase Dashboard → Project Settings → API and use **Reload schema cache**, then refresh the page.

## Use the editor

Visit `/admin`, sign in with the authorized account, and add a story with its title, category, and year. Use **Save details** to edit existing story metadata, **Add photos** to upload one or more JPEG, PNG, WebP, or AVIF images (up to 12 MB each), and **Remove photo** to delete a photo from a collection. Changes are stored in Supabase and appear on the public portfolio.
