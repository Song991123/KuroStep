package com.kurostep.track.dto;

import jakarta.validation.constraints.NotBlank;

public record YouTubePlaylistImportRequest(
        @NotBlank String playlistUrl
) {
}
