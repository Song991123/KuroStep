package com.kurostep.track.dto;

import java.util.List;

public record YouTubePlaylistImportResponse(
        String playlistId,
        int trackCount,
        List<TrackCreateRequest> tracks
) {
}
