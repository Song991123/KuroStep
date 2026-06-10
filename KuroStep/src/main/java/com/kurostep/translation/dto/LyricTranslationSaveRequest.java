package com.kurostep.translation.dto;

import jakarta.validation.constraints.NotBlank;

public record LyricTranslationSaveRequest(
        String languageCode,
        @NotBlank String translatedText,
        String memoText
) {
}
