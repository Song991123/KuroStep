package com.kurostep.lyric.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record LyricCreateRequest(
        String providerLyricsId,
        String languageCode,
        boolean synced,
        @NotEmpty List<@Valid LyricLineRefCreateRequest> lines
) {
}
