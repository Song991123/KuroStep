package com.kurostep.task.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record CreatorTaskUpdateRequest(
        @NotBlank String title,
        String description,
        @NotNull LocalDate taskDate
) {
}
