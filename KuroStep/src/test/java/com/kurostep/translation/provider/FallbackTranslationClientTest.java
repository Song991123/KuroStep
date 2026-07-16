package com.kurostep.translation.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.kurostep.translation.domain.TranslationProviderType;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class FallbackTranslationClientTest {

    @Test
    void translateUsesGoogleBeforeMyMemoryWhenDeepLIsUnavailable() {
        DeepLTranslationClient deepL = mock(DeepLTranslationClient.class);
        GoogleTranslationClient google = mock(GoogleTranslationClient.class);
        MyMemoryTranslationClient myMemory = mock(MyMemoryTranslationClient.class);
        FallbackTranslationClient client = new FallbackTranslationClient(deepL, google, myMemory);

        when(deepL.translate("You should come", "auto", "ko")).thenReturn(Optional.empty());
        when(google.translate("You should come", "auto", "ko"))
                .thenReturn(Optional.of(new TranslationProviderResult("너도 와야 해", TranslationProviderType.GOOGLE)));

        TranslationProviderResult result = client.translate("You should come", "auto", "ko");

        assertThat(result.provider()).isEqualTo(TranslationProviderType.GOOGLE);
        assertThat(result.translatedText()).isEqualTo("너도 와야 해");
        verifyNoInteractions(myMemory);
    }

    @Test
    void translateFallsBackToMyMemoryWhenGoogleIsUnavailable() {
        DeepLTranslationClient deepL = mock(DeepLTranslationClient.class);
        GoogleTranslationClient google = mock(GoogleTranslationClient.class);
        MyMemoryTranslationClient myMemory = mock(MyMemoryTranslationClient.class);
        FallbackTranslationClient client = new FallbackTranslationClient(deepL, google, myMemory);

        when(deepL.translate("Green, green", "en", "ko")).thenReturn(Optional.empty());
        when(google.translate("Green, green", "en", "ko")).thenReturn(Optional.empty());
        when(myMemory.translate("Green, green", "en", "ko"))
                .thenReturn(new TranslationProviderResult("녹색, 녹색", TranslationProviderType.MYMEMORY));

        TranslationProviderResult result = client.translate("Green, green", "en", "ko");

        assertThat(result.provider()).isEqualTo(TranslationProviderType.MYMEMORY);
        assertThat(result.translatedText()).isEqualTo("녹색, 녹색");
    }
}
