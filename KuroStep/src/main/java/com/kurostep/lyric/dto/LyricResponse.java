package com.kurostep.lyric.dto;

import com.kurostep.lyric.domain.Lyric;
import com.kurostep.lyric.domain.LyricsProviderType;
import java.util.List;

public record LyricResponse(
        Long id,
        Long trackId,
        LyricsProviderType provider,
        String providerLyricsId,
        String languageCode,
        boolean synced,
        List<LyricLineRefResponse> lines
) {

    public static LyricResponse of(Lyric lyric, List<LyricLineRefResponse> lines) {
        return new LyricResponse(
                lyric.getId(),
                lyric.getTrack().getId(),
                lyric.getProvider(),
                lyric.getProviderLyricsId(),
                lyric.getLanguageCode(),
                lyric.isSynced(),
                lines
        );
    }
}
