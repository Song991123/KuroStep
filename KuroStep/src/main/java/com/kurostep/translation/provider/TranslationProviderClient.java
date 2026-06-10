package com.kurostep.translation.provider;

public interface TranslationProviderClient {

    TranslationProviderResult translate(String sourceText, String sourceLanguageCode, String targetLanguageCode);
}
