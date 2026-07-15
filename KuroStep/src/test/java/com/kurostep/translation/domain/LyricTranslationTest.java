package com.kurostep.translation.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LyricTranslationTest {

    @Test
    void replaceDraftDoesNotOverwriteEditedManualTranslation() {
        LyricTranslation translation = LyricTranslation.createManual(
                null,
                null,
                "ko",
                "사용자가 고친 번역",
                "직접 다듬은 메모"
        );

        translation.replaceDraft("자동 번역 초안", "자동 메모", TranslationProviderType.MYMEMORY);

        assertThat(translation.getTranslatedText()).isEqualTo("사용자가 고친 번역");
        assertThat(translation.getMemoText()).isEqualTo("직접 다듬은 메모");
        assertThat(translation.getProvider()).isEqualTo(TranslationProviderType.MANUAL);
        assertThat(translation.getStatus()).isEqualTo(TranslationStatus.EDITED);
    }
}
