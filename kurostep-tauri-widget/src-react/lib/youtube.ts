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

function cleanYoutubeTitlePart(value: string) {
  return String(value || "")
    .replace(/\[[^\]]*(official|mv|m\/v|music video|lyrics?|가사|4k|hd)[^\]]*\]/gi, "")
    .replace(/\([^)]*(official|mv|m\/v|music video|lyrics?|가사|4k|hd)[^)]*\)/gi, "")
    .replace(/\b(official\s*)?(music\s*)?(video|mv|m\/v)\b/gi, "")
    .replace(/\b(lyrics?|audio|4k|hd)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[-–—|:]\s*$/g, "")
    .trim();
}

function normalizeYoutubeMetadata(metadata: { title: string; artist: string }, sourceId: string) {
  const fallback = {
    title: `YouTube track ${sourceId}`,
    artist: "YouTube",
  };
  let title = cleanYoutubeTitlePart(metadata.title) || fallback.title;
  let artist = String(metadata.artist || fallback.artist).replace(/\s*-\s*Topic$/i, "").trim() || fallback.artist;

  const dashMatch = title.match(/^(.+?)\s[-–—]\s(.+)$/);
  const channelLooksLikeDistributor = /records?|music|entertainment|official|vevo|youtube|topic/i.test(artist);
  if (dashMatch) {
    const parsedArtist = cleanYoutubeTitlePart(dashMatch[1]);
    const parsedTitle = cleanYoutubeTitlePart(dashMatch[2]);
    if (parsedArtist && parsedTitle) {
      title = parsedTitle;
      if (channelLooksLikeDistributor || artist === fallback.artist) {
        artist = parsedArtist;
      }
    }
  }

  return { title, artist };
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
      return normalizeYoutubeMetadata({
        title: data.title || fallback.title,
        artist: data.author_name || fallback.artist,
      }, sourceId);
    } catch {
      // Browser/Tauri CORS or network failures fall through to fallback.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return normalizeYoutubeMetadata(fallback, sourceId);
}
