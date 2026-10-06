This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Telegram package bot

The Telegram webhook is handled by `app/api/telegram/route.ts`. Manage the bot's package list, prices, and details from the authorized admin panel at `/admin`.

Set these environment variables locally and in your Vercel project:

```env
BOT_TOKEN=
WEBHOOK_SECRET=
PHOTOGRAPHER_USERNAME=
CHANNEL_ID=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
```

`BOT_TOKEN` and `WEBHOOK_SECRET` are required by the webhook. `PHOTOGRAPHER_USERNAME` is the photographer's public Telegram username without `@`. `CHANNEL_ID` is optional and enables package-interest notifications. `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is the public bot username used by the website's contact links.

To enable package editing and load the bot's package list from Supabase, first apply the portfolio admin migration and then run [`supabase/migrations/20261007000000_telegram_packages.sql`](./supabase/migrations/20261007000000_telegram_packages.sql) in the same Supabase project's SQL Editor. Sign in at `/admin` with an authorized admin account to add, edit, or delete packages.

After deploying, register the webhook once with Telegram, substituting the actual values:

```text
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram&secret_token=<WEBHOOK_SECRET>
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
