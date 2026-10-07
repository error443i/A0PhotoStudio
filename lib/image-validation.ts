export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export type SupportedImageMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/avif"
  | "image/gif"
  | "image/heic"
  | "image/heif"
  | "image/svg+xml"
  | "image/bmp"
  | "image/tiff"
  | "image/x-icon";

/**
 * Robustly detects whether byte buffer (or fallback filename/MIME) represents
 * a supported image format. Supports all standard photo formats:
 * JPEG, PNG, WebP, AVIF, GIF, HEIC/HEIF, BMP, TIFF, SVG, and ICO.
 */
export function detectImageMimeType(
  bytes: Uint8Array,
  fileNameOrMime?: string,
): SupportedImageMime | null {
  // 1. JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // 3. GIF: GIF87a or GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  // 4. WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  // 5. BMP: 'BM'
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }

  // 6. TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return "image/tiff";
  }

  // 7. ICO: 00 00 01 00
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
    return "image/x-icon";
  }

  // 8. ISOBMFF box (AVIF, HEIC, HEIF)
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "image/heic";

    // Scan compatible brands in header box
    const headerBox = String.fromCharCode(
      ...bytes.slice(8, Math.min(bytes.length, 128)),
    ).toLowerCase();
    if (headerBox.includes("avif") || headerBox.includes("avis")) return "image/avif";
    if (headerBox.includes("heic") || headerBox.includes("hevc") || headerBox.includes("mif1")) {
      return "image/heic";
    }
  }

  // 9. SVG (XML or direct <svg tag)
  if (bytes.length >= 4) {
    try {
      const textChunk = new TextDecoder("utf-8", { fatal: false })
        .decode(bytes.slice(0, Math.min(bytes.length, 512)))
        .trim()
        .toLowerCase();
      if (
        textChunk.startsWith("<svg") ||
        (textChunk.startsWith("<?xml") && textChunk.includes("<svg")) ||
        textChunk.includes("<svg")
      ) {
        return "image/svg+xml";
      }
    } catch {
      // Ignore text decode failure
    }
  }

  // 10. Fallback by declared filename or MIME type
  if (fileNameOrMime) {
    const lower = fileNameOrMime.toLowerCase();
    if (lower === "image/jpeg" || lower === "image/jpg") return "image/jpeg";
    if (lower === "image/png") return "image/png";
    if (lower === "image/webp") return "image/webp";
    if (lower === "image/avif") return "image/avif";
    if (lower === "image/gif") return "image/gif";
    if (lower === "image/heic") return "image/heic";
    if (lower === "image/heif") return "image/heif";
    if (lower === "image/svg+xml") return "image/svg+xml";
    if (lower === "image/bmp" || lower === "image/x-ms-bmp") return "image/bmp";
    if (lower === "image/tiff") return "image/tiff";
    if (lower === "image/x-icon" || lower === "image/vnd.microsoft.icon") return "image/x-icon";

    const ext = lower.split(".").pop();
    if (ext === "jpg" || ext === "jpeg" || ext === "jfif" || ext === "pjpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "avif") return "image/avif";
    if (ext === "gif") return "image/gif";
    if (ext === "heic") return "image/heic";
    if (ext === "heif") return "image/heif";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "bmp") return "image/bmp";
    if (ext === "tif" || ext === "tiff") return "image/tiff";
    if (ext === "ico") return "image/x-icon";
  }

  return null;
}

/**
 * Returns the canonical file extension for an image MIME type.
 */
export function getExtensionForMime(mime: string, fileName?: string): string {
  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) {
      if (mime === "image/jpeg" && (ext === "jpg" || ext === "jpeg" || ext === "jfif")) return ext;
      if (mime === "image/heic" && (ext === "heic" || ext === "heif")) return ext;
      if (mime === "image/tiff" && (ext === "tif" || ext === "tiff")) return ext;
    }
  }

  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/svg+xml":
      return "svg";
    case "image/bmp":
      return "bmp";
    case "image/tiff":
      return "tiff";
    case "image/x-icon":
      return "ico";
    default:
      return "jpg";
  }
}
