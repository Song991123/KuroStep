package com.kurostep.translation.provider;

import com.kurostep.translation.domain.TranslationProviderType;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class GoogleTranslationClient {

    private static final Logger log = LoggerFactory.getLogger(GoogleTranslationClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;

    public GoogleTranslationClient(
            @Value("${kurostep.translation.google-base-url}") String baseUrl
    ) {
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
    }

    public Optional<TranslationProviderResult> translate(
            String sourceText,
            String sourceLanguageCode,
            String targetLanguageCode
    ) {
        if (sourceText == null || sourceText.isBlank()) {
            return Optional.empty();
        }

        String source = normalizeSource(sourceLanguageCode);
        String target = normalizeTarget(targetLanguageCode);
        String uri = UriComponentsBuilder.fromUriString(baseUrl + "/translate_a/single")
                .queryParam("client", "gtx")
                .queryParam("sl", source)
                .queryParam("tl", target)
                .queryParam("dt", "t")
                .queryParam("q", sourceText)
                .build()
                .encode()
                .toUriString();

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(uri))
                    .header("User-Agent", "KuroStep/0.1")
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Google translation request failed. status={}", response.statusCode());
                return Optional.empty();
            }

            JsonNode root = objectMapper.readTree(response.body());
            String translatedText = KoreanLyricDraftPolisher.polish(
                    sourceText,
                    target,
                    readTranslatedText(root)
            );
            if (translatedText.isBlank() || translatedText.equalsIgnoreCase(sourceText.trim())) {
                return Optional.empty();
            }
            return Optional.of(new TranslationProviderResult(translatedText, TranslationProviderType.GOOGLE));
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("Google translation request failed.", e);
            return Optional.empty();
        }
    }

    private String readTranslatedText(JsonNode root) {
        JsonNode sentences = root == null ? null : root.get(0);
        if (sentences == null || !sentences.isArray()) {
            return "";
        }

        StringBuilder translated = new StringBuilder();
        for (JsonNode sentence : sentences) {
            JsonNode segment = sentence == null ? null : sentence.get(0);
            if (segment != null && !segment.isNull()) {
                translated.append(segment.asString());
            }
        }
        return translated.toString().trim();
    }

    private String normalizeSource(String value) {
        if (value == null || value.isBlank() || "auto".equalsIgnoreCase(value)) {
            return "auto";
        }
        return value.trim().toLowerCase();
    }

    private String normalizeTarget(String value) {
        if (value == null || value.isBlank()) {
            return "ko";
        }
        return value.trim().toLowerCase();
    }
}
