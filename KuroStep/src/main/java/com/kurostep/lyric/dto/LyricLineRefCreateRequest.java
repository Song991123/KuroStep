package com.kurostep.lyric.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record LyricLineRefCreateRequest(
        @Min(0) int lineIndex,
        Integer startTimeMs,
        String textHash
) {
}
