package com.kurostep.playlist.dto;

import com.kurostep.playlist.domain.PlaylistTrack;
import com.kurostep.track.domain.TrackSourceType;

public record PlaylistTrackResponse(
        Long playlistTrackId,
        Long trackId,
        String title,
        String artist,
        TrackSourceType sourceType,
        String sourceUrl,
        String sourceId,
        Integer durationSeconds,
        int sortOrder
) {

    public static PlaylistTrackResponse from(PlaylistTrack playlistTrack) {
        return new PlaylistTrackResponse(
                playlistTrack.getId(),
                playlistTrack.getTrack().getId(),
                playlistTrack.getTrack().getTitle(),
                playlistTrack.getTrack().getArtist(),
                playlistTrack.getTrack().getSourceType(),
                playlistTrack.getTrack().getSourceUrl(),
                playlistTrack.getTrack().getSourceId(),
                playlistTrack.getTrack().getDurationSeconds(),
                playlistTrack.getSortOrder()
        );
    }
}
