package com.kurostep.lyric.provider;

import com.kurostep.common.exception.NotFoundException;
import com.kurostep.track.domain.Track;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class LrclibClient implements LyricsProviderClient {

    private static final Logger log = LoggerFactory.getLogger(LrclibClient.class);

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;

    public LrclibClient(
            @Value("${kurostep.lyrics.lrclib-base-url}") String baseUrl
    ) {
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
        this.baseUrl = baseUrl;
    }

    @Override
    public LyricsProviderResult fetch(Track track) {
        LrclibRecord record = findBySearchCandidates(track)
                .orElseThrow(() -> new NotFoundException("LRCLIB에서 가사를 찾을 수 없습니다."));

        return new LyricsProviderResult(
                String.valueOf(record.id()),
                "unknown",
                hasLyrics(record.syncedLyrics()),
                record.plainLyrics(),
                record.syncedLyrics()
        );
    }

    private Optional<LrclibRecord> findBySearchCandidates(Track track) {
        for (SearchCandidate candidate : buildSearchCandidates(track)) {
            Optional<LrclibRecord> record = findByTrackFields(candidate.trackName(), candidate.artistName());
            if (record.isPresent()) {
                return record;
            }

            record = findByKeyword(candidate.trackName(), candidate.artistName());
            if (record.isPresent()) {
                return record;
            }
        }

        return Optional.empty();
    }

    private List<SearchCandidate> buildSearchCandidates(Track track) {
        Set<SearchCandidate> candidates = new LinkedHashSet<>();
        String title = normalizeTitle(track.getTitle());
        String artist = normalizeArtist(track.getArtist());

        candidates.add(new SearchCandidate(title, artist));
        candidates.add(new SearchCandidate(track.getTitle(), artist));
        candidates.add(new SearchCandidate(title, null));

        return candidates.stream()
                .filter(candidate -> hasText(candidate.trackName()))
                .toList();
    }

    private Optional<LrclibRecord> findByTrackFields(String trackName, String artistName) {
        String uri = UriComponentsBuilder.fromUriString(baseUrl + "/api/search")
                .queryParam("track_name", trackName)
                .queryParamIfPresent("artist_name", java.util.Optional.ofNullable(artistName).filter(this::hasText))
                .build()
                .encode()
                .toUriString();

        return fetchFirst(uri);
    }

    private Optional<LrclibRecord> findByKeyword(String trackName, String artistName) {
        String keyword = hasText(artistName)
                ? trackName + " " + artistName
                : trackName;
        String uri = UriComponentsBuilder.fromUriString(baseUrl + "/api/search")
                .queryParam("q", keyword)
                .build()
                .encode()
                .toUriString();

        return fetchFirst(uri);
    }

    private String normalizeTitle(String value) {
        if (value == null) {
            return null;
        }
        return value
                .replaceAll("\\s*\\[[^]]*]\\s*", " ")
                .replaceAll("\\s*\\([^)]*(official|audio|video|mv|lyrics|lyric|live)[^)]*\\)\\s*", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String normalizeArtist(String value) {
        if (value == null) {
            return null;
        }
        return value
                .replaceAll("(?i)\\s*-\\s*topic\\s*$", "")
                .replaceAll("(?i)\\s*official\\s*$", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private Optional<LrclibRecord> fetchFirst(String uri) {
        log.info("LRCLIB request uri={}", uri);
        String body;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(uri))
                    .header("User-Agent", "KuroStep/0.0.1")
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("LRCLIB request failed. status={}, uri={}", response.statusCode(), uri);
                return Optional.empty();
            }
            body = response.body();
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("LRCLIB request failed. uri={}", uri, e);
            return Optional.empty();
        }

        return parseFirst(body);
    }

    private Optional<LrclibRecord> parseFirst(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (root == null || !root.isArray()) {
                return Optional.empty();
            }

            int count = 0;
            for (JsonNode item : root) {
                count++;
                String plainLyrics = textOrNull(item, "plainLyrics");
                String syncedLyrics = textOrNull(item, "syncedLyrics");
                if (count == 1) {
                    log.info(
                            "LRCLIB first result. trackName={}, plainLen={}, syncedLen={}",
                            textOrNull(item, "trackName"),
                            plainLyrics == null ? null : plainLyrics.length(),
                            syncedLyrics == null ? null : syncedLyrics.length()
                    );
                }
                if (hasLyrics(plainLyrics) || hasLyrics(syncedLyrics)) {
                    return Optional.of(new LrclibRecord(
                            longOrNull(item, "id"),
                            textOrNull(item, "trackName"),
                            textOrNull(item, "artistName"),
                            textOrNull(item, "albumName"),
                            doubleOrNull(item, "duration"),
                            booleanOrNull(item, "instrumental"),
                            plainLyrics,
                            syncedLyrics
                    ));
                }
            }

            log.info("LRCLIB returned {} records but no lyrics text was detected.", count);
            return Optional.empty();
        } catch (Exception e) {
            log.warn("LRCLIB response parse failed. body={}", body, e);
            return Optional.empty();
        }
    }

    private String textOrNull(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        return field == null || field.isNull() ? null : field.asString();
    }

    private Long longOrNull(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        return field == null || field.isNull() ? null : field.asLong();
    }

    private Double doubleOrNull(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        return field == null || field.isNull() ? null : field.asDouble();
    }

    private Boolean booleanOrNull(JsonNode node, String fieldName) {
        JsonNode field = node.get(fieldName);
        return field == null || field.isNull() ? null : field.asBoolean();
    }

    private boolean hasLyrics(String value) {
        return value != null && !value.isBlank();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record SearchCandidate(
            String trackName,
            String artistName
    ) {
    }

    private record LrclibRecord(
            Long id,
            String trackName,
            String artistName,
            String albumName,
            Double duration,
            Boolean instrumental,
            String plainLyrics,
            String syncedLyrics
    ) {
    }
}
