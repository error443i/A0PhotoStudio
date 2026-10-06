import { Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import { getTelegramPackages, type TelegramPackage } from "@/lib/telegram-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENU_TEXT = "📸 Welcome! Choose a photo shoot package to see what's included:";

let webhookHandler: ((request: Request) => Promise<Response>) | undefined;

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getWebhookHandler() {
  if (webhookHandler) return webhookHandler;

  const botToken = requiredEnvironmentVariable("BOT_TOKEN");
  const webhookSecret = requiredEnvironmentVariable("WEBHOOK_SECRET");
  const photographerUsername = requiredEnvironmentVariable("PHOTOGRAPHER_USERNAME").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(photographerUsername)) {
    throw new Error("PHOTOGRAPHER_USERNAME must be a valid Telegram username without @.");
  }

  const photographerUrl = `https://t.me/${photographerUsername}`;
  const bot = new Bot(botToken);

  function menuKeyboard(packages: TelegramPackage[]) {
    const keyboard = new InlineKeyboard();
    for (const photoPackage of packages) {
      keyboard.text(`${photoPackage.title} — ${photoPackage.price}`, `pkg:${photoPackage.id}`).row();
    }
    keyboard.url("💬 Contact the photographer", photographerUrl);
    return keyboard;
  }

  async function showPackages(ctx: Context) {
    const packages = await getTelegramPackages();
    await ctx.reply(
      packages.length ? MENU_TEXT : "There are no photo shoot packages available right now.",
      { reply_markup: menuKeyboard(packages) },
    );
  }

  bot.command("start", showPackages);
  bot.command("packages", showPackages);

  bot.command("contact", (ctx) =>
    ctx.reply("Tap below to message the photographer directly:", {
      reply_markup: new InlineKeyboard().url("💬 Open chat", photographerUrl),
    }),
  );

  bot.callbackQuery(/^pkg:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const packages = await getTelegramPackages();
    const photoPackage = packages.find((item) => item.id === ctx.match[1]);
    if (!photoPackage) {
      await ctx.editMessageText("This package is no longer available.", {
        reply_markup: new InlineKeyboard().text("⬅️ Back to packages", "back"),
      });
      return;
    }

    const text = `✨ ${photoPackage.title} package — ${photoPackage.price}\n\n${photoPackage.details}`;
    const prefill = encodeURIComponent(`Hi! I'm interested in the ${photoPackage.title} package.`);
    await ctx.editMessageText(text, {
      reply_markup: new InlineKeyboard()
        .url("💬 Message the photographer", `${photographerUrl}?text=${prefill}`)
        .row()
        .text("⬅️ Back to packages", "back"),
    });

    const channelId = process.env.CHANNEL_ID?.trim();
    if (channelId) {
      const who = ctx.from.username ? `@${ctx.from.username}` : `id ${ctx.from.id}`;
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
    await ctx.answerCallbackQuery();
    const packages = await getTelegramPackages();
    await ctx.editMessageText(
      packages.length ? MENU_TEXT : "There are no photo shoot packages available right now.",
      { reply_markup: menuKeyboard(packages) },
    );
  });

  bot.on("message:text", showPackages);

  webhookHandler = webhookCallback(bot, "std/http", { secretToken: webhookSecret });
  return webhookHandler;
}

export async function POST(request: Request) {
  return getWebhookHandler()(request);
}
