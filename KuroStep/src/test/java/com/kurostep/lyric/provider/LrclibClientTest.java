package com.kurostep.lyric.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LrclibClientTest {

    @Test
    @DisplayName("LRCLIB 검색 결과에서 plain-only 결과보다 synced 가사 결과를 우선한다")
    void parseBestPrefersSyncedLyrics() throws Exception {
        LrclibClient client = new LrclibClient("https://lrclib.net");
        Method parseBest = LrclibClient.class.getDeclaredMethod("parseBest", String.class, Integer.class);
        parseBest.setAccessible(true);
        String body = """
                [
                  {
                    "id": 1,
                    "trackName": "REDRED",
                    "artistName": "CORTIS",
                    "plainLyrics": "Green, green",
                    "syncedLyrics": null
                  },
                  {
                    "id": 2,
                    "trackName": "REDRED",
                    "artistName": "CORTIS",
                    "plainLyrics": "Green, green",
                    "syncedLyrics": "[00:07.36]Green, green"
                  }
                ]
                """;

        Optional<?> result = (Optional<?>) parseBest.invoke(client, body, null);

        assertThat(result).isPresent();
        Object record = result.orElseThrow();
        Method id = record.getClass().getDeclaredMethod("id");
        Method syncedLyrics = record.getClass().getDeclaredMethod("syncedLyrics");
        assertThat(id.invoke(record)).isEqualTo(2L);
        assertThat(syncedLyrics.invoke(record)).isEqualTo("[00:07.36]Green, green");
    }

    @Test
    @DisplayName("영상 길이를 알면 가장 가까운 duration의 synced 가사를 선택한다")
    void parseBestPrefersClosestSyncedDuration() throws Exception {
        LrclibClient client = new LrclibClient("https://lrclib.net");
        Method parseBest = LrclibClient.class.getDeclaredMethod("parseBest", String.class, Integer.class);
        parseBest.setAccessible(true);
        String body = """
                [
                  {
                    "id": 1,
                    "trackName": "REDRED",
                    "artistName": "CORTIS",
                    "duration": 163,
                    "plainLyrics": "Green, green",
                    "syncedLyrics": "[00:07.36]Green, green"
                  },
                  {
                    "id": 2,
                    "trackName": "REDRED",
                    "artistName": "CORTIS",
                    "duration": 208,
                    "plainLyrics": "Green, green",
                    "syncedLyrics": "[00:27.36]Green, green"
                  },
                  {
                    "id": 3,
                    "trackName": "REDRED",
                    "artistName": "CORTIS",
                    "duration": 245,
                    "plainLyrics": "Green, green",
                    "syncedLyrics": "[00:45.36]Green, green"
                  }
                ]
                """;

        Optional<?> result = (Optional<?>) parseBest.invoke(client, body, 209);

        assertThat(result).isPresent();
        Object record = result.orElseThrow();
        Method id = record.getClass().getDeclaredMethod("id");
        Method duration = record.getClass().getDeclaredMethod("duration");
        assertThat(id.invoke(record)).isEqualTo(2L);
        assertThat(duration.invoke(record)).isEqualTo(208.0);
    }
}
