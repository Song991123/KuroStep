package com.kurostep.translation.provider;

import com.kurostep.translation.domain.TranslationProviderType;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class DeepLTranslationClient {

    private static final Logger log = LoggerFactory.getLogger(DeepLTranslationClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String apiKey;

    public DeepLTranslationClient(
            @Value("${kurostep.translation.deepl-base-url}") String baseUrl,
            @Value("${kurostep.translation.deepl-api-key:}") String apiKey
    ) {
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    public Optional<TranslationProviderResult> translate(
            String sourceText,
            String sourceLanguageCode,
            String targetLanguageCode
    ) {
        if (apiKey == null || apiKey.isBlank()) {
            return Optional.empty();
        }

        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/v2/translate"))
                    .header("Authorization", "DeepL-Auth-Key " + apiKey.trim())
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(formBody(sourceText, sourceLanguageCode, targetLanguageCode)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("DeepL request failed. status={}", response.statusCode());
                return Optional.empty();
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode translations = root == null ? null : root.get("translations");
            if (translations == null || !translations.isArray() || translations.isEmpty()) {
                return Optional.empty();
            }

            JsonNode text = translations.get(0).get("text");
            if (text == null || text.isNull() || text.asString().isBlank()) {
                return Optional.empty();
            }

            return Optional.of(new TranslationProviderResult(text.asString(), TranslationProviderType.DEEPL));
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("DeepL request failed.", e);
            return Optional.empty();
        }
    }

    private String formBody(String sourceText, String sourceLanguageCode, String targetLanguageCode) {
        StringBuilder body = new StringBuilder("text=").append(encode(sourceText));
        normalizeSource(sourceLanguageCode)
                .ifPresent(source -> body.append("&source_lang=").append(encode(source)));
        body.append("&target_lang=").append(encode(normalizeTarget(targetLanguageCode)));
        return body.toString();
    }

    private Optional<String> normalizeSource(String value) {
        if (value == null || value.isBlank() || "auto".equalsIgnoreCase(value)) {
            return Optional.empty();
        }
        return Optional.of(value.trim().toUpperCase(Locale.ROOT));
    }

    private String normalizeTarget(String value) {
        if (value == null || value.isBlank()) {
            return "KO";
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
