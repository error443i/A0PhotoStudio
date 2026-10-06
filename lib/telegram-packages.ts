import { createPublicSupabaseClient } from "./supabase";

export type TelegramPackage = {
  id: string;
  title: string;
  price: string;
  details: string;
  sort_order: number;
};

export async function getTelegramPackages(): Promise<TelegramPackage[]> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("telegram_packages")
    .select("id, title, price, details, sort_order")
    .order("sort_order")
    .order("created_at");

  if (error) {
    throw new Error(`Unable to load Telegram packages: ${error.message}`);
  }

  return (data ?? []) as TelegramPackage[];
}
