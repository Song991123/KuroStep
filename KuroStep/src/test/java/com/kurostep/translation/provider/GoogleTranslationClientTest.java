package com.kurostep.translation.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.translation.domain.TranslationProviderType;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class GoogleTranslationClientTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void translateReadsGoogleFreeEndpointSegments() throws Exception {
        AtomicReference<String> queryRef = new AtomicReference<>();
        GoogleTranslationClient client = clientWithResponse(queryRef, """
                [[["당신은 와야합니다","You should come",null,null,10]],null,"en"]
                """, 200);

        TranslationProviderResult result = client.translate("You should come", "auto", "ko").orElseThrow();

        assertThat(result.provider()).isEqualTo(TranslationProviderType.GOOGLE);
        assertThat(result.translatedText()).isEqualTo("너도 와야 해");
        assertThat(queryRef.get()).contains("client=gtx");
        assertThat(queryRef.get()).contains("sl=auto");
        assertThat(queryRef.get()).contains("tl=ko");
    }

    @Test
    void translateReturnsEmptyWhenEndpointFails() throws Exception {
        GoogleTranslationClient client = clientWithResponse(new AtomicReference<>(), "{}", 429);

        Optional<TranslationProviderResult> result = client.translate("You should come", "en", "ko");

        assertThat(result).isEmpty();
    }

    private GoogleTranslationClient clientWithResponse(
            AtomicReference<String> queryRef,
            String responseBody,
            int statusCode
    ) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/translate_a/single", exchange -> {
            queryRef.set(exchange.getRequestURI().getQuery());
            byte[] response = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(statusCode, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        return new GoogleTranslationClient("http://127.0.0.1:" + server.getAddress().getPort());
    }
}
