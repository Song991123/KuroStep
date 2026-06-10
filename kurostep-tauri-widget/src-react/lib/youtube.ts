import { METADATA_TIMEOUT_MS } from "./api";

export function extractYoutubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }
    return parsed.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

export function extractYoutubePlaylistId(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("list") || "";
  } catch {
    return "";
  }
}

export async function fetchYoutubeMetadata(sourceUrl: string, sourceId: string) {
  const fallback = {
    title: `YouTube track ${sourceId}`,
    artist: "YouTube",
  };

  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`,
  ];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        continue;
      }
      const data = await response.json();
      return {
        title: data.title || fallback.title,
        artist: data.author_name || fallback.artist,
      };
    } catch {
      // Browser/Tauri CORS or network failures fall through to fallback.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return fallback;
}
