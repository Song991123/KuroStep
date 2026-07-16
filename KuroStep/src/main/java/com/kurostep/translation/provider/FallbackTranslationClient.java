package com.kurostep.translation.provider;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

@Primary
@Component
public class FallbackTranslationClient implements TranslationProviderClient {

    private final DeepLTranslationClient deepLTranslationClient;
    private final GoogleTranslationClient googleTranslationClient;
    private final MyMemoryTranslationClient myMemoryTranslationClient;

    public FallbackTranslationClient(
            DeepLTranslationClient deepLTranslationClient,
            GoogleTranslationClient googleTranslationClient,
            MyMemoryTranslationClient myMemoryTranslationClient
    ) {
        this.deepLTranslationClient = deepLTranslationClient;
        this.googleTranslationClient = googleTranslationClient;
        this.myMemoryTranslationClient = myMemoryTranslationClient;
    }

    @Override
    public TranslationProviderResult translate(String sourceText, String sourceLanguageCode, String targetLanguageCode) {
        return deepLTranslationClient.translate(sourceText, sourceLanguageCode, targetLanguageCode)
                .or(() -> googleTranslationClient.translate(sourceText, sourceLanguageCode, targetLanguageCode))
                .orElseGet(() -> myMemoryTranslationClient.translate(sourceText, sourceLanguageCode, targetLanguageCode));
    }
}
