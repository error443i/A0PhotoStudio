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

The Telegram webhook is handled by `app/api/telegram/route.ts`. Manage the bot's package list, prices, and details from the authorized admin panel.

Set these environment variables locally and in your Vercel project:

```env
BOT_TOKEN=
WEBHOOK_SECRET=
PHOTOGRAPHER_USERNAME=
CHANNEL_ID=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`BOT_TOKEN` and `WEBHOOK_SECRET` are required by the webhook. `PHOTOGRAPHER_USERNAME` is the photographer's public Telegram username without `@`. `CHANNEL_ID` is optional and enables package-interest notifications. `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is the public bot username used by the website's contact links.

`SUPABASE_SERVICE_ROLE_KEY` is required for secure image uploads and must be configured only as a server-side environment variable in Vercel and local development. Never prefix it with `NEXT_PUBLIC_` or expose it to browser code.

The Telegram webhook and admin image upload endpoint are rate limited to 120 and 30 requests per IP per minute. Without Redis, a bounded per-instance limiter is used, which works without extra accounts but is not shared across Vercel instances. For a shared distributed limit, optionally configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` as server-only variables. Vercel Firewall rate-limit rules are another option for platform-level protection.

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
