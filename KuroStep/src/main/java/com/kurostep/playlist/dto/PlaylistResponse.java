package com.kurostep.playlist.dto;

import com.kurostep.playlist.domain.Playlist;

public record PlaylistResponse(
        Long id,
        String name,
        String description
) {

    public static PlaylistResponse from(Playlist playlist) {
        return new PlaylistResponse(
                playlist.getId(),
                playlist.getName(),
                playlist.getDescription()
        );
    }
}
