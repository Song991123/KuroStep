package com.kurostep.playlist.dto;

import jakarta.validation.constraints.NotBlank;

public record PlaylistUpdateRequest(
        @NotBlank String name,
        String description
) {
}
