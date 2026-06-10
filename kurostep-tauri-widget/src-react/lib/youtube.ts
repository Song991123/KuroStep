import type { YoutubePlayer } from "../types";

let youtubeApiPromise: Promise<NonNullable<Window["YT"]>> | null = null;

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

export function youtubeFallbackMetadata(sourceId: string) {
  return {
    title: `YouTube track ${sourceId}`,
    artist: "YouTube",
  };
}

export async function fetchYoutubeMetadata(sourceUrl: string, sourceId: string) {
  const fallback = youtubeFallbackMetadata(sourceId);
  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`,
  ];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3200);
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
      // Tauri/WebView CORS failures fall back to a stable title.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return fallback;
}

export function loadYoutubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube 플레이어 API를 못 불러왔다냥."));
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT) {
        resolve(window.YT);
      }
    };
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

export type { YoutubePlayer };
