export type TaskStatus = "TODO" | "DOING" | "DONE";

export type AuthUser = {
  userId: number;
  email: string;
  nickname?: string;
  accessToken: string;
};

export type CreatorTask = {
  id: number;
  title: string;
  description?: string;
  taskDate?: string;
  status: TaskStatus;
  playlistId?: number | null;
  currentPlaylistTrackId?: number | null;
};

export type Playlist = {
  id: number;
  name: string;
  description?: string;
};

export type PlaylistTrack = {
  playlistTrackId: number;
  trackId: number;
  title: string;
  artist?: string;
  durationSeconds?: number | null;
  sortOrder?: number;
};

export type Track = {
  id: number;
  playlistTrackId?: number;
  title: string;
  artist?: string;
  album?: string;
  sourceType: "YOUTUBE" | "SPOTIFY" | "SOUNDCLOUD" | "LOCAL_FILE" | "EXTERNAL_URL";
  sourceUrl?: string;
  sourceId?: string;
  durationSeconds?: number | null;
};

export type LyricLine = {
  id: string | number;
  lineIndex: number;
  startTimeMs?: number;
  text: string;
};

export type Translation = {
  id?: number;
  translatedText?: string;
  memoText?: string;
  status?: string;
};

export type SavedLyricPiece = {
  id: string;
  lineRefId?: string | number | null;
  trackId?: number | null;
  trackTitle: string;
  lineText: string;
  translatedText?: string;
  memoText?: string;
  savedAt: string;
};

export type StatusCounts = Record<TaskStatus, number>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
      };
      window?: {
        getCurrentWindow?: () => {
          minimize?: () => Promise<void>;
          startDragging?: () => Promise<void>;
          close?: () => Promise<void>;
        };
      };
    };
    KUROSTEP_WINDOW?: string;
    YT?: {
      Player: new (elementId: string, options: Record<string, unknown>) => YoutubePlayer;
      PlayerState: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YoutubePlayer = {
  playVideo?: () => void;
  pauseVideo?: () => void;
  cueVideoById?: (options: { videoId: string; startSeconds?: number }) => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  setVolume?: (volume: number) => void;
};
