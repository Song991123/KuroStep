package com.kurostep.track.dto;

import com.kurostep.track.domain.TrackSourceType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record TrackCreateRequest(
        @NotBlank String title,
        String artist,
        String album,
        @NotNull TrackSourceType sourceType,
        String sourceUrl,
        String sourceId,
        Integer durationSeconds
) {
}
