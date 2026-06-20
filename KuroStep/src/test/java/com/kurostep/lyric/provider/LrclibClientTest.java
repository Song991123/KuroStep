package com.kurostep.lyric.provider;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LrclibClientTest {

    @Test
    @DisplayName("LRCLIB 검색 결과에서 plain-only 결과보다 synced 가사 결과를 우선한다")
    void parseFirstPrefersSyncedLyrics() throws Exception {
        LrclibClient client = new LrclibClient("https://lrclib.net");
        Method parseFirst = LrclibClient.class.getDeclaredMethod("parseFirst", String.class);
        parseFirst.setAccessible(true);
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

        Optional<?> result = (Optional<?>) parseFirst.invoke(client, body);

        assertThat(result).isPresent();
        Object record = result.orElseThrow();
        Method id = record.getClass().getDeclaredMethod("id");
        Method syncedLyrics = record.getClass().getDeclaredMethod("syncedLyrics");
        assertThat(id.invoke(record)).isEqualTo(2L);
        assertThat(syncedLyrics.invoke(record)).isEqualTo("[00:07.36]Green, green");
    }
}
