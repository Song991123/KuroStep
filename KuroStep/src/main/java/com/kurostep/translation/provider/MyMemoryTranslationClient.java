package com.kurostep.translation.provider;

import com.kurostep.translation.domain.TranslationProviderType;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
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

        String translatedText = fetchTranslatedText(uri, sourceText, target)
                .orElseThrow(() -> new IllegalArgumentException("쓸 만한 자동 번역 후보를 찾지 못했습니다."));

        return new TranslationProviderResult(translatedText, TranslationProviderType.MYMEMORY);
    }

    private Optional<String> fetchTranslatedText(String uri, String sourceText, String targetLanguageCode) {
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
            return translationCandidates(root, sourceText).stream()
                    .filter(candidate -> isUsefulTranslation(candidate.text(), sourceText, targetLanguageCode))
                    .max(Comparator.comparingDouble(candidate -> scoreCandidate(candidate, sourceText)))
                    .map(candidate -> candidate.text().trim());
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("MyMemory request failed. uri={}", uri, e);
            return Optional.empty();
        }
    }

    private List<TranslationCandidate> translationCandidates(JsonNode root, String sourceText) {
        List<TranslationCandidate> candidates = new ArrayList<>();
        JsonNode responseData = root == null ? null : root.get("responseData");
        JsonNode translatedText = responseData == null ? null : responseData.get("translatedText");
        if (translatedText != null && !translatedText.isNull()) {
            candidates.add(new TranslationCandidate(translatedText.asString(), sourceText, numberValue(responseData.get("match"), 0.0), 0.0, false));
        }

        JsonNode matches = root == null ? null : root.get("matches");
        if (matches != null && matches.isArray()) {
            for (JsonNode match : matches) {
                JsonNode translation = match.get("translation");
                if (translation != null && !translation.isNull()) {
                    candidates.add(new TranslationCandidate(
                            translation.asString(),
                            stringValue(match.get("segment")),
                            numberValue(match.get("match"), 0.0),
                            numberValue(match.get("quality"), 0.0),
                            "neural".equalsIgnoreCase(stringValue(match.get("model")))
                    ));
                }
            }
        }
        return candidates;
    }

    private double scoreCandidate(TranslationCandidate candidate, String sourceText) {
        String source = normalizeComparable(sourceText);
        String segment = normalizeComparable(candidate.segment());
        double score = candidate.match() * 100.0 + Math.min(candidate.quality(), 100.0) * 0.25;
        if (!segment.isBlank()) {
            if (segment.equals(source)) {
                score += 80.0;
            } else if (source.contains(segment) || segment.contains(source)) {
                score += 10.0;
            } else {
                score -= 15.0;
            }
        }
        if (candidate.machineTranslated()) {
            score += 20.0;
        }
        return score;
    }

    private String normalizeComparable(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replaceAll("[^\\p{L}\\p{N}]+", " ")
                .trim()
                .replaceAll("\\s+", " ")
                .toLowerCase();
    }

    private String stringValue(JsonNode node) {
        return node == null || node.isNull() ? "" : node.asString();
    }

    private double numberValue(JsonNode node, double defaultValue) {
        if (node == null || node.isNull()) {
            return defaultValue;
        }
        try {
            return Double.parseDouble(node.asString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private boolean isUsefulTranslation(String value, String sourceText, String targetLanguageCode) {
        if (value == null || value.isBlank() || value.startsWith("INVALID LANGUAGE PAIR")) {
            return false;
        }
        if (value.trim().equalsIgnoreCase(sourceText == null ? "" : sourceText.trim())) {
            return false;
        }
        if ("ko".equalsIgnoreCase(targetLanguageCode) && !containsHangul(value)) {
            return false;
        }
        return true;
    }

    private boolean containsHangul(String value) {
        return value != null && value.codePoints().anyMatch(codePoint -> codePoint >= 0xAC00 && codePoint <= 0xD7A3);
    }

    private String normalize(String value, String defaultValue) {
        if (value == null || value.isBlank() || "auto".equalsIgnoreCase(value)) {
            return defaultValue;
        }
        return value.trim().toLowerCase();
    }

    private record TranslationCandidate(
            String text,
            String segment,
            double match,
            double quality,
            boolean machineTranslated
    ) {
    }
}
