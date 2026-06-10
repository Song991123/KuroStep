package com.kurostep.translation.dto;

import jakarta.validation.constraints.NotBlank;

public record AutoTranslationRequest(
        @NotBlank String sourceText,
        String sourceLanguageCode,
        String targetLanguageCode,
        String memoText
) {
}
