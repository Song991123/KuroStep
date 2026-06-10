package com.kurostep.playlist.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PlaylistTrackReorderRequest(
        @NotEmpty List<Long> playlistTrackIds
) {
}
