package com.kurostep.translation.provider;

import com.kurostep.translation.domain.TranslationProviderType;

public record TranslationProviderResult(
        String translatedText,
        TranslationProviderType provider
) {
}
