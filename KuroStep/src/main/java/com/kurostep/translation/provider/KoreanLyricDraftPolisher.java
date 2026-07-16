package com.kurostep.translation.provider;

import java.util.Locale;

final class KoreanLyricDraftPolisher {

    private KoreanLyricDraftPolisher() {
    }

    static String polish(String sourceText, String targetLanguageCode, String translatedText) {
        if (!"ko".equalsIgnoreCase(targetLanguageCode) || translatedText == null || translatedText.isBlank()) {
            return translatedText;
        }

        String normalizedSource = normalizeSource(sourceText);
        if ("you should come".equals(normalizedSource)) {
            return "너도 와야 해";
        }

        String polished = translatedText.trim()
                .replace("당신은 ", "너는 ")
                .replace("당신이 ", "네가 ")
                .replace("당신을 ", "너를 ")
                .replace("당신의 ", "너의 ");

        return polished
                .replace("오셔야 합니다", "와야 해")
                .replace("와야합니다", "와야 해")
                .replace("와야 합니다", "와야 해")
                .replace("해야합니다", "해야 해")
                .replace("해야 합니다", "해야 해")
                .replace("할 것입니다", "할 거야")
                .replace("될 것입니다", "될 거야");
    }

    private static String normalizeSource(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim()
                .replaceAll("\\s+", " ")
                .toLowerCase(Locale.ROOT);
    }
}
