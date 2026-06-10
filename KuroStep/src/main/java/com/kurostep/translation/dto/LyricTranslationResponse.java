package com.kurostep.translation.dto;

import com.kurostep.translation.domain.LyricTranslation;
import com.kurostep.translation.domain.TranslationProviderType;
import com.kurostep.translation.domain.TranslationStatus;

public record LyricTranslationResponse(
        Long id,
        Long lyricLineRefId,
        Long userId,
        String languageCode,
        String translatedText,
        String memoText,
        TranslationProviderType provider,
        TranslationStatus status
) {

    public static LyricTranslationResponse from(LyricTranslation translation) {
        return new LyricTranslationResponse(
                translation.getId(),
                translation.getLyricLineRef().getId(),
                translation.getUser().getId(),
                translation.getLanguageCode(),
                translation.getTranslatedText(),
                translation.getMemoText(),
                translation.getProvider(),
                translation.getStatus()
        );
    }
}
