package com.kurostep.track.dto;

import com.kurostep.track.domain.Track;
import com.kurostep.track.domain.TrackSourceType;

public record TrackResponse(
        Long id,
        String title,
        String artist,
        String album,
        TrackSourceType sourceType,
        String sourceUrl,
        String sourceId,
        Integer durationSeconds
) {

    public static TrackResponse from(Track track) {
        return new TrackResponse(
                track.getId(),
                track.getTitle(),
                track.getArtist(),
                track.getAlbum(),
                track.getSourceType(),
                track.getSourceUrl(),
                track.getSourceId(),
                track.getDurationSeconds()
        );
    }
}
