package com.kurostep.track.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kurostep.track.domain.TrackSourceType;
import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.YouTubePlaylistImportResponse;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class YouTubePlaylistImportService {

    private static final int MAX_IMPORT_COUNT = 50;
    private static final Pattern VIDEO_ID_PATTERN = Pattern.compile("\\\\\"videoId\\\\\"\\s*:\\s*\\\\\"([A-Za-z0-9_-]{11})\\\\\"");
    private static final Pattern WATCH_URL_PATTERN = Pattern.compile("(?:watch\\?v=|/watch\\?v=)([A-Za-z0-9_-]{11})");

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public YouTubePlaylistImportService() {
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public YouTubePlaylistImportResponse preview(String playlistUrl) {
        String playlistId = extractPlaylistId(playlistUrl);
        String html = fetchText("https://www.youtube.com/playlist?list=" + encode(playlistId) + "&hl=ko");
        List<String> videoIds = extractVideoIds(html);

        if (videoIds.isEmpty()) {
            throw new IllegalArgumentException("YouTube 플레이리스트에서 공개 영상을 찾을 수 없습니다.");
        }

        List<TrackCreateRequest> tracks = videoIds.stream()
                .limit(MAX_IMPORT_COUNT)
                .map(this::toTrackDraft)
                .toList();

        return new YouTubePlaylistImportResponse(playlistId, tracks.size(), tracks);
    }

    private String extractPlaylistId(String playlistUrl) {
        try {
            URI uri = URI.create(playlistUrl);
            String query = uri.getRawQuery();
            if (query == null || query.isBlank()) {
                throw new IllegalArgumentException("YouTube 플레이리스트 링크에는 list 값이 필요합니다.");
            }

            for (String pair : query.split("&")) {
                String[] parts = pair.split("=", 2);
                if (parts.length == 2 && "list".equals(parts[0])) {
                    String playlistId = URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
                    if (!playlistId.isBlank()) {
                        return playlistId;
                    }
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("YouTube 플레이리스트 링크 형식이 올바르지 않습니다.");
        }

        throw new IllegalArgumentException("YouTube 플레이리스트 링크에는 list 값이 필요합니다.");
    }

    private List<String> extractVideoIds(String html) {
        Set<String> ids = new LinkedHashSet<>();
        Matcher matcher = VIDEO_ID_PATTERN.matcher(html);

        while (matcher.find() && ids.size() < MAX_IMPORT_COUNT) {
            ids.add(matcher.group(1));
        }

        Matcher watchMatcher = WATCH_URL_PATTERN.matcher(html);
        while (watchMatcher.find() && ids.size() < MAX_IMPORT_COUNT) {
            ids.add(watchMatcher.group(1));
        }

        return new ArrayList<>(ids);
    }

    private TrackCreateRequest toTrackDraft(String videoId) {
        YouTubeMetadata metadata = fetchMetadata(videoId);
        String sourceUrl = "https://www.youtube.com/watch?v=" + videoId;

        return new TrackCreateRequest(
                metadata.title(),
                metadata.artist(),
                metadata.artist(),
                TrackSourceType.YOUTUBE,
                sourceUrl,
                videoId,
                null
        );
    }

    private YouTubeMetadata fetchMetadata(String videoId) {
        String sourceUrl = "https://www.youtube.com/watch?v=" + videoId;
        String fallbackTitle = "YouTube 작업곡 " + videoId;

        try {
            String body = fetchText("https://noembed.com/embed?url=" + encode(sourceUrl));
            JsonNode root = objectMapper.readTree(body);
            String title = textOrDefault(root, "title", fallbackTitle);
            String artist = textOrDefault(root, "author_name", "YouTube");

            return new YouTubeMetadata(title, artist);
        } catch (Exception e) {
            return new YouTubeMetadata(fallbackTitle, "YouTube");
        }
    }

    private String fetchText(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("User-Agent", "Mozilla/5.0 KuroStep/1.0")
                .GET()
                .build();

        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("YouTube 정보를 불러오지 못했습니다. status=" + response.statusCode());
            }

            return response.body();
        } catch (IOException e) {
            throw new IllegalArgumentException("YouTube 정보를 불러오는 중 네트워크 오류가 발생했습니다.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("YouTube 정보를 불러오는 작업이 중단되었습니다.");
        }
    }

    private String textOrDefault(JsonNode root, String fieldName, String defaultValue) {
        JsonNode value = root.get(fieldName);
        if (value == null || value.asText().isBlank()) {
            return defaultValue;
        }

        return value.asText();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record YouTubeMetadata(String title, String artist) {
    }
}
