package com.kurostep.lyric.provider;

public record LyricsProviderResult(
        String providerLyricsId,
        String languageCode,
        boolean synced,
        String plainLyrics,
        String syncedLyrics
) {

    public String sourceText() {
        if (syncedLyrics != null && !syncedLyrics.isBlank()) {
            return syncedLyrics;
        }
        return plainLyrics;
    }
}
