import { Bot, InlineKeyboard, webhookCallback } from "grammy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGES = [
  {
    id: "mini",
    title: "Mini",
    price: "$50",
    details: "30 minutes\n1 location\n10 edited photos\nDelivery in 5 days",
  },
  {
    id: "standard",
    title: "Standard",
    price: "$120",
    details: "1 hour\n2 locations\n30 edited photos\nDelivery in 7 days",
  },
  {
    id: "premium",
    title: "Premium",
    price: "$250",
    details: "3 hours\nMultiple locations\n80 edited photos\nPrints included\nDelivery in 10 days",
  },
] as const;

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

  function menuKeyboard() {
    const keyboard = new InlineKeyboard();
    for (const photoPackage of PACKAGES) {
      keyboard.text(`${photoPackage.title} — ${photoPackage.price}`, `pkg:${photoPackage.id}`).row();
    }
    keyboard.url("💬 Contact the photographer", photographerUrl);
    return keyboard;
  }

  bot.command("start", (ctx) => ctx.reply(MENU_TEXT, { reply_markup: menuKeyboard() }));
  bot.command("packages", (ctx) => ctx.reply(MENU_TEXT, { reply_markup: menuKeyboard() }));

  bot.command("contact", (ctx) =>
    ctx.reply("Tap below to message the photographer directly:", {
      reply_markup: new InlineKeyboard().url("💬 Open chat", photographerUrl),
    }),
  );

  bot.callbackQuery(/^pkg:(.+)$/, async (ctx) => {
    const photoPackage = PACKAGES.find((item) => item.id === ctx.match[1]);
    await ctx.answerCallbackQuery();
    if (!photoPackage) return;

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
    await ctx.editMessageText(MENU_TEXT, { reply_markup: menuKeyboard() });
  });

  bot.on("message:text", (ctx) => ctx.reply(MENU_TEXT, { reply_markup: menuKeyboard() }));

  webhookHandler = webhookCallback(bot, "std/http", { secretToken: webhookSecret });
  return webhookHandler;
}

export async function POST(request: Request) {
  return getWebhookHandler()(request);
}
