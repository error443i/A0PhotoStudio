import { createHash, timingSafeEqual } from "node:crypto";
import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import { rateLimitRequest } from "@/lib/rate-limit";
import {
  getTelegramPackages,
  cleanPackageDetails,
  type TelegramPackage,
} from "@/lib/telegram-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENU_TEXT =
  "📸 Welcome! Choose a photo shoot package to see what's included.\n\nSelecting a package shares your Telegram username (or account ID) with the photographer.";

let webhookHandler: ((request: Request) => Promise<Response>) | undefined;

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getWebhookHandler(webhookSecret: string) {
  if (webhookHandler) return webhookHandler;

  const botToken = requiredEnvironmentVariable("BOT_TOKEN");
  const photographerUsername = requiredEnvironmentVariable("PHOTOGRAPHER_USERNAME").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(photographerUsername)) {
    throw new Error("PHOTOGRAPHER_USERNAME must be a valid Telegram username without @.");
  }

  const photographerUrl = `https://t.me/${photographerUsername}`;
  const bot = new Bot(botToken);

  bot.catch((err) => {
    console.error("Unhandled error in Telegram bot update:", err);
  });

  function menuKeyboard(packages: TelegramPackage[]) {
    const keyboard = new InlineKeyboard();
    for (const photoPackage of packages) {
      keyboard.text(`${photoPackage.title} — ${photoPackage.price}`, `pkg:${photoPackage.id}`).row();
    }
    keyboard.url("💬 Contact the photographer", photographerUrl);
    return keyboard;
  }

  async function showPackages(ctx: Context) {
    try {
      const packages = await getTelegramPackages();
      await ctx.reply(
        packages.length ? MENU_TEXT : "There are no photo shoot packages available right now.",
        { reply_markup: menuKeyboard(packages) },
      );
    } catch (err) {
      console.error("Failed to load Telegram packages:", err);
      await ctx.reply(
        "Welcome! We're temporarily unable to load packages. Please contact the photographer directly:",
        {
          reply_markup: new InlineKeyboard().url("💬 Contact the photographer", photographerUrl),
        },
      );
    }
  }

  bot.command("start", showPackages);
  bot.command("packages", showPackages);
  bot.command("help", showPackages);

  bot.command("contact", (ctx) =>
    ctx.reply("Tap below to message the photographer directly:", {
      reply_markup: new InlineKeyboard().url("💬 Open chat", photographerUrl),
    }),
  );

  bot.callbackQuery(/^pkg:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const packageId = ctx.match?.[1];
    let packages: TelegramPackage[] = [];
    try {
      packages = await getTelegramPackages();
    } catch (err) {
      console.error("Failed to load packages in callback:", err);
    }

    const photoPackage = packages.find((item) => item.id === packageId);
    if (!photoPackage) {
      try {
        await ctx.editMessageText("This package is no longer available.", {
          reply_markup: new InlineKeyboard().text("⬅️ Back to packages", "back"),
        });
      } catch {
        // Ignore message not modified
      }
      return;
    }

    const cleanDetails = cleanPackageDetails(photoPackage.details);
    const text = cleanDetails
      ? `✨ ${photoPackage.title} package — ${photoPackage.price}\n\n${cleanDetails}`
      : `✨ ${photoPackage.title} package — ${photoPackage.price}`;

    // Telegram media captions are limited to 1024 characters
    const caption = text.length <= 1024 ? text : text.slice(0, 1020) + "…";

    const prefill = encodeURIComponent(`Hi! I'm interested in the ${photoPackage.title} package.`);
    const replyMarkup = new InlineKeyboard()
      .url("💬 Message the photographer", `${photographerUrl}?text=${prefill}`)
      .row()
      .text("⬅️ Back to packages", "back");

    const photos = photoPackage.photos && photoPackage.photos.length > 0
      ? photoPackage.photos
      : photoPackage.image_url
      ? [{ id: "photo-0", image_url: photoPackage.image_url }]
      : [];

    const fullImageUrls: string[] = [];
    for (const p of photos) {
      if (p.image_url.startsWith("http://") || p.image_url.startsWith("https://")) {
        fullImageUrls.push(p.image_url);
      } else if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        fullImageUrls.push(new URL(p.image_url, process.env.NEXT_PUBLIC_SUPABASE_URL).toString());
      }
    }

    try {
      if (fullImageUrls.length > 1) {
        await ctx.deleteMessage().catch(() => {});
        const mediaGroup = fullImageUrls.slice(0, 10).map((url, idx) => ({
          type: "photo" as const,
          media: url,
          caption: idx === 0 ? caption : undefined,
        }));
        await ctx.replyWithMediaGroup(mediaGroup);
        await ctx.reply("💬 Tap below to contact or return to packages:", {
          reply_markup: replyMarkup,
          link_preview_options: { is_disabled: true },
        });
      } else if (fullImageUrls.length === 1) {
        await ctx.deleteMessage().catch(() => {});
        await ctx.replyWithPhoto(fullImageUrls[0], {
          caption,
          reply_markup: replyMarkup,
        });
      } else {
        await ctx.editMessageText(text, {
          reply_markup: replyMarkup,
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (sendError: unknown) {
      console.error("Failed to send package media in callback:", sendError);
      try {
        await ctx.reply(text, {
          reply_markup: replyMarkup,
          link_preview_options: { is_disabled: true },
        });
      } catch (fallbackError) {
        console.error("Failed to send package message in callback:", fallbackError);
      }
    }

    const channelId = process.env.CHANNEL_ID?.trim();
    if (channelId) {
      const user = ctx.from;
      const username = user?.username;
      const who = username && /^[A-Za-z0-9_]{5,32}$/.test(username)
        ? `@${username}`
        : user?.id
        ? `id ${user.id}`
        : "Unknown user";
      try {
        await bot.api.sendMessage(
          channelId,
          `👀 ${who} is interested in the ${photoPackage.title} package`,
        );
      } catch (notificationError) {
        console.error("Unable to send Telegram package-interest notification:", notificationError);
      }
    }
  });

  bot.callbackQuery("back", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    try {
      const packages = await getTelegramPackages();
      await ctx.deleteMessage().catch(() => {});
      await ctx.reply(
        packages.length ? MENU_TEXT : "There are no photo shoot packages available right now.",
        { reply_markup: menuKeyboard(packages) },
      );
    } catch (editError: unknown) {
      console.error("Failed to return to packages menu:", editError);
    }
  });

  bot.on("message", showPackages);

  webhookHandler = webhookCallback(bot, "std/http", { secretToken: webhookSecret });
  return webhookHandler;
}

export async function POST(request: Request) {
  const rateLimitResponse = await rateLimitRequest(request, {
    scope: "telegram-webhook",
    requests: 120,
    window: "1 m",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const webhookSecret = requiredEnvironmentVariable("WEBHOOK_SECRET");
  const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  const expectedDigest = createHash("sha256").update(webhookSecret).digest();
  const suppliedDigest = createHash("sha256").update(suppliedSecret ?? "").digest();

  if (!suppliedSecret || !timingSafeEqual(expectedDigest, suppliedDigest)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return await getWebhookHandler(webhookSecret)(request);
  } catch (error) {
    console.error("Telegram webhook handler error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
