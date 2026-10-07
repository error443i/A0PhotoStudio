import { createPublicSupabaseClient } from "./supabase";

export type TelegramPackage = {
  id: string;
  title: string;
  price: string;
  details: string;
  sort_order: number;
};

export const DEFAULT_TELEGRAM_PACKAGES: TelegramPackage[] = [
  {
    id: "mini",
    title: "Mini",
    price: "$50",
    details: "30 minutes\n1 location\n10 edited photos\nDelivery in 5 days",
    sort_order: 1,
  },
  {
    id: "standard",
    title: "Standard",
    price: "$120",
    details: "1 hour\n2 locations\n30 edited photos\nDelivery in 7 days",
    sort_order: 2,
  },
  {
    id: "premium",
    title: "Premium",
    price: "$250",
    details: "3 hours\nMultiple locations\n80 edited photos\nPrints included\nDelivery in 10 days",
    sort_order: 3,
  },
];

export async function getTelegramPackages(): Promise<TelegramPackage[]> {
  try {
    const supabase = createPublicSupabaseClient();
    const { data, error } = await supabase
      .from("telegram_packages")
      .select("id, title, price, details, sort_order")
      .order("sort_order")
      .order("created_at");

    if (error) {
      console.warn(
        `Unable to load Telegram packages from Supabase (${error.message}). Falling back to default packages.`,
      );
      return DEFAULT_TELEGRAM_PACKAGES;
    }

    const rows = (data ?? []) as TelegramPackage[];
    return rows.length > 0 ? rows : DEFAULT_TELEGRAM_PACKAGES;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Network error loading Telegram packages (${message}). Falling back to default packages.`,
    );
    return DEFAULT_TELEGRAM_PACKAGES;
  }
}
