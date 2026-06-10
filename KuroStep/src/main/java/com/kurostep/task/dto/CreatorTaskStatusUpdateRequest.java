package com.kurostep.task.dto;

import com.kurostep.task.domain.TaskStatus;
import jakarta.validation.constraints.NotNull;

public record CreatorTaskStatusUpdateRequest(
        @NotNull TaskStatus status
) {
}
