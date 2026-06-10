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
public class MyMemoryTranslationClient implements TranslationProviderClient {

    private static final Logger log = LoggerFactory.getLogger(MyMemoryTranslationClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;

    public MyMemoryTranslationClient(
            @Value("${kurostep.translation.mymemory-base-url}") String baseUrl
    ) {
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
    }

    @Override
    public TranslationProviderResult translate(String sourceText, String sourceLanguageCode, String targetLanguageCode) {
        String source = normalize(sourceLanguageCode, "en");
        String target = normalize(targetLanguageCode, "ko");

        String uri = UriComponentsBuilder.fromUriString(baseUrl + "/get")
                .queryParam("q", sourceText)
                .queryParam("langpair", source + "|" + target)
                .build()
                .encode()
                .toUriString();

        String translatedText = fetchTranslatedText(uri).orElse(sourceText);

        return new TranslationProviderResult(translatedText, TranslationProviderType.MYMEMORY);
    }

    private Optional<String> fetchTranslatedText(String uri) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(uri))
                    .header("User-Agent", "KuroStep/0.0.1")
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("MyMemory request failed. status={}, uri={}", response.statusCode(), uri);
                return Optional.empty();
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode responseData = root == null ? null : root.get("responseData");
            JsonNode translatedText = responseData == null ? null : responseData.get("translatedText");
            if (translatedText == null || translatedText.isNull()) {
                return Optional.empty();
            }

            String value = translatedText.asString();
            if (value == null || value.isBlank() || value.startsWith("INVALID LANGUAGE PAIR")) {
                return Optional.empty();
            }
            return Optional.of(value);
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("MyMemory request failed. uri={}", uri, e);
            return Optional.empty();
        }
    }

    private String normalize(String value, String defaultValue) {
        if (value == null || value.isBlank() || "auto".equalsIgnoreCase(value)) {
            return defaultValue;
        }
        return value.trim().toLowerCase();
    }
}
