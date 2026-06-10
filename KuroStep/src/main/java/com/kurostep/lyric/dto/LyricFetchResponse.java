package com.kurostep.lyric.dto;

public record LyricFetchResponse(
        LyricResponse lyric,
        String localCacheKey,
        String plainLyrics,
        String syncedLyrics
) {
}
