import { createPublicSupabaseClient } from "./supabase";

export type PortfolioProject = {
  id: string;
  title: string;
  category: string;
  year: string;
  images: string[];
};

export const DEFAULT_HERO_BACKGROUND =
  "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=2400&q=90";

function isMissingSettingsTable(error: { code?: string; message: string }) {
  return (
    error.code === "PGRST205" ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table")
  );
}

type StoryRow = {
  id: string;
  title: string;
  category: string;
  year: string;
  story_photos: { image_url: string }[];
};

export async function getHeroBackground(): Promise<string | null> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "hero_background")
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTable(error)) {
      console.warn(
        "The site_settings table is missing. Run supabase/migrations/20261006000000_hero_background.sql to enable homepage background updates.",
      );
      return null;
    }
    throw new Error(`Unable to load hero background: ${error.message}`);
  }

  return data?.value || null;
}

export async function getFeaturedStories(): Promise<PortfolioProject[]> {
  const supabase = createPublicSupabaseClient();
  const { data, error } = await supabase
    .from("featured_stories")
    .select("id, title, category, year, story_photos(image_url)")
    .order("sort_order")
    .order("sort_order", { referencedTable: "story_photos" });

  if (error) {
    throw new Error(`Unable to load featured stories: ${error.message}`);
  }

  return ((data ?? []) as StoryRow[]).map((story) => ({
    id: story.id,
    title: story.title,
    category: story.category,
    year: story.year,
    images: (story.story_photos ?? []).map((photo) => photo.image_url),
  }));
}
