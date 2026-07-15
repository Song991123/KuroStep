package com.kurostep.translation.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.translation.domain.TranslationProviderType;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class MyMemoryTranslationClientTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void translatePrefersHangulMatchWhenTopResultIsRomanizedNoise() throws Exception {
        MyMemoryTranslationClient client = clientWithResponse("""
                {
                  "responseData": {"translatedText": "saranghae unjaena youngwonhei"},
                  "matches": [
                    {"translation": "saranghae unjaena youngwonhei"},
                    {"translation": "나는 절대 포기하지 않는다."}
                  ]
                }
                """);

        TranslationProviderResult result = client.translate("I will never give up", "en", "ko");

        assertThat(result.provider()).isEqualTo(TranslationProviderType.MYMEMORY);
        assertThat(result.translatedText()).isEqualTo("나는 절대 포기하지 않는다.");
    }

    @Test
    void translateKeepsUsefulTopResult() throws Exception {
        MyMemoryTranslationClient client = clientWithResponse("""
                {
                  "responseData": {"translatedText": "녹색, 녹색"},
                  "matches": [
                    {"translation": "그린"}
                  ]
                }
                """);

        TranslationProviderResult result = client.translate("Green, green", "en", "ko");

        assertThat(result.translatedText()).isEqualTo("녹색, 녹색");
    }

    private MyMemoryTranslationClient clientWithResponse(String responseBody) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/get", exchange -> {
            byte[] response = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        return new MyMemoryTranslationClient("http://127.0.0.1:" + server.getAddress().getPort());
    }
}
