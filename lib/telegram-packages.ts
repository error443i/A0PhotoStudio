import { createPublicSupabaseClient } from "./supabase";
import { toProxiedImageUrl } from "./image-url";

export type PackagePhoto = {
  id: string;
  image_url: string;
  storage_path?: string | null;
};

export type TelegramPackage = {
  id: string;
  title: string;
  price: string;
  details: string;
  sort_order: number;
  image_url?: string | null;
  storage_path?: string | null;
  photos?: PackagePhoto[];
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

export function cleanPackageDetails(details: string): string {
  if (!details) return "";
  return details.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function extractPackagePhotos(
  details: string,
  singleImageUrl?: string | null,
  singleStoragePath?: string | null,
): {
  cleanDetails: string;
  photos: PackagePhoto[];
} {
  const cleanDetails = cleanPackageDetails(details);
  const photos: PackagePhoto[] = [];

  // 1. Check for multiple photos tag: <!-- photos:[{...}] -->
  const multiMatch = details.match(/<!--\s*photos:([\s\S]*?)-->/);
  if (multiMatch) {
    try {
      const parsed = JSON.parse(multiMatch[1]);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < parsed.length; i++) {
          const item = parsed[i];
          if (item && typeof item.url === "string") {
            photos.push({
              id: item.id || `photo-${i}`,
              image_url: item.url,
              storage_path: item.path || null,
            });
          }
        }
      }
    } catch {
      // Ignore parse error
    }
  }

  // 2. Check for single photo tag: <!-- photo:{...} -->
  if (photos.length === 0) {
    const singleMatch = details.match(/<!--\s*photo:([\s\S]*?)-->/);
    if (singleMatch) {
      try {
        const parsed = JSON.parse(singleMatch[1]);
        if (parsed && typeof parsed.url === "string") {
          photos.push({
            id: parsed.id || "photo-0",
            image_url: parsed.url,
            storage_path: parsed.path || null,
          });
        }
      } catch {
        // Ignore parse error
      }
    }
  }

  // 3. Fallback to columns if no tag photos found
  if (photos.length === 0 && singleImageUrl) {
    photos.push({
      id: "photo-0",
      image_url: singleImageUrl,
      storage_path: singleStoragePath || null,
    });
  }

  return { cleanDetails, photos };
}

export function extractPackagePhoto(details: string): {
  cleanDetails: string;
  image_url: string | null;
  storage_path: string | null;
} {
  const { cleanDetails, photos } = extractPackagePhotos(details);
  return {
    cleanDetails,
    image_url: photos[0]?.image_url ?? null,
    storage_path: photos[0]?.storage_path ?? null,
  };
}

function toAbsoluteStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

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
    if (rows.length === 0) return DEFAULT_TELEGRAM_PACKAGES;

    return rows.map((pkg) => {
      const extracted = extractPackagePhotos(pkg.details);
      const firstPhoto = extracted.photos[0];
      const absoluteFirstUrl = toAbsoluteStorageUrl(firstPhoto?.image_url);
      return {
        ...pkg,
        details: extracted.cleanDetails,
        image_url: absoluteFirstUrl,
        storage_path: firstPhoto?.storage_path ?? null,
        photos: extracted.photos.map((p) => ({
          ...p,
          image_url: toAbsoluteStorageUrl(p.image_url) ?? p.image_url,
        })),
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Network error loading Telegram packages (${message}). Falling back to default packages.`,
    );
    return DEFAULT_TELEGRAM_PACKAGES;
  }
}
