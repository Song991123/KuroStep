package com.kurostep.task.dto;

import com.kurostep.task.domain.CreatorTask;
import com.kurostep.task.domain.TaskStatus;
import java.time.LocalDate;

public record CreatorTaskResponse(
        Long id,
        String title,
        String description,
        TaskStatus status,
        LocalDate taskDate,
        Long playlistId,
        Long currentPlaylistTrackId
) {

    public static CreatorTaskResponse from(CreatorTask task) {
        return new CreatorTaskResponse(
                task.getId(),
                task.getTitle(),
                task.getDescription(),
                task.getStatus(),
                task.getTaskDate(),
                task.getPlaylist() == null ? null : task.getPlaylist().getId(),
                task.getCurrentPlaylistTrack() == null ? null : task.getCurrentPlaylistTrack().getId()
        );
    }
}
