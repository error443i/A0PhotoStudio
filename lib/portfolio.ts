import { createPublicSupabaseClient } from "./supabase";
import { toProxiedImageUrl } from "./image-url";

export type PortfolioProject = {
  id: string;
  title: string;
  category: string;
  year: string;
  images: string[];
};

export const DEFAULT_HERO_BACKGROUND =
  "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=2400&q=90";

export const DEFAULT_FEATURED_STORIES: PortfolioProject[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    title: "The in-between",
    category: "Weddings",
    year: "2026",
    images: [
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1400&q=90",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    title: "Soft mornings",
    category: "Portraits",
    year: "2026",
    images: [
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1400&q=90",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    title: "A little wild",
    category: "Couples",
    year: "2025",
    images: [
      "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1400&q=90",
    ],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    title: "A slower Sunday",
    category: "Lifestyle",
    year: "2025",
    images: [
      "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=90",
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=90",
    ],
  },
];

let lastSupabaseFailureTime = 0;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

function isSupabaseTemporarilyUnavailable() {
  return Date.now() - lastSupabaseFailureTime < CIRCUIT_BREAKER_COOLDOWN_MS;
}

function markSupabaseUnavailable() {
  lastSupabaseFailureTime = Date.now();
}

function markSupabaseHealthy() {
  lastSupabaseFailureTime = 0;
}

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
  if (isSupabaseTemporarilyUnavailable()) {
    return null;
  }

  try {
    const supabase = createPublicSupabaseClient({ timeoutMs: 2500 });
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "hero_background")
      .maybeSingle();

    if (error) {
      markSupabaseUnavailable();
      if (isMissingSettingsTable(error)) {
        console.warn(
          "The site_settings table is missing. Run supabase/migrations/20261006000000_hero_background.sql to enable homepage background updates.",
        );
      } else {
        console.warn(
          `Unable to load hero background from Supabase (${error.message}). Falling back to default background.`,
        );
      }
      return null;
    }

    markSupabaseHealthy();
    return toProxiedImageUrl(data?.value) || null;
  } catch (err) {
    markSupabaseUnavailable();
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Network error loading hero background (${message}). Falling back to default background.`,
    );
    return null;
  }
}

export async function getFeaturedStories(): Promise<PortfolioProject[]> {
  if (isSupabaseTemporarilyUnavailable()) {
    return DEFAULT_FEATURED_STORIES;
  }

  try {
    const supabase = createPublicSupabaseClient({ timeoutMs: 2500 });
    const { data, error } = await supabase
      .from("featured_stories")
      .select("id, title, category, year, story_photos(image_url)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "story_photos" });

    if (error) {
      markSupabaseUnavailable();
      console.warn(
        `Unable to load featured stories from Supabase (${error.message}). Falling back to default stories.`,
      );
      return DEFAULT_FEATURED_STORIES;
    }

    markSupabaseHealthy();
    const rows = (data ?? []) as StoryRow[];
    if (rows.length === 0) {
      return DEFAULT_FEATURED_STORIES;
    }

    return rows.map((story) => ({
      id: story.id,
      title: story.title,
      category: story.category,
      year: story.year,
      images: (story.story_photos ?? []).map(
        (photo) => toProxiedImageUrl(photo.image_url) ?? photo.image_url,
      ),
    }));
  } catch (err) {
    markSupabaseUnavailable();
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Network error loading featured stories (${message}). Falling back to default stories.`,
    );
    return DEFAULT_FEATURED_STORIES;
  }
}

export const DEFAULT_PORTFOLIO_YEARS = "2025 — 2026";

export async function getPortfolioYears(): Promise<string> {
  if (isSupabaseTemporarilyUnavailable()) {
    return DEFAULT_PORTFOLIO_YEARS;
  }

  try {
    const supabase = createPublicSupabaseClient({ timeoutMs: 2500 });
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "portfolio_years")
      .maybeSingle();

    if (error || !data?.value) {
      return DEFAULT_PORTFOLIO_YEARS;
    }

    markSupabaseHealthy();
    return data.value;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Error loading portfolio years (${message}). Using default.`);
    return DEFAULT_PORTFOLIO_YEARS;
  }
}
