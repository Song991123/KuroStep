package com.kurostep.translation.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.translation.domain.TranslationProviderType;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class DeepLTranslationClientTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void translateOmitsSourceLanguageWhenAuto() throws Exception {
        AtomicReference<String> bodyRef = new AtomicReference<>();
        DeepLTranslationClient client = clientWithServer(bodyRef);

        TranslationProviderResult result = client.translate("You should come", "auto", "ko").orElseThrow();

        assertThat(result.provider()).isEqualTo(TranslationProviderType.DEEPL);
        assertThat(result.translatedText()).isEqualTo("너도 와야 해");
        assertThat(bodyRef.get()).contains("text=You+should+come");
        assertThat(bodyRef.get()).contains("target_lang=KO");
        assertThat(bodyRef.get()).doesNotContain("source_lang=");
    }

    @Test
    void translateSendsExplicitSourceLanguage() throws Exception {
        AtomicReference<String> bodyRef = new AtomicReference<>();
        DeepLTranslationClient client = clientWithServer(bodyRef);

        client.translate("Green, green", "en", "ko").orElseThrow();

        assertThat(bodyRef.get()).contains("source_lang=EN");
        assertThat(bodyRef.get()).contains("target_lang=KO");
    }

    private DeepLTranslationClient clientWithServer(AtomicReference<String> bodyRef) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v2/translate", exchange -> {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            bodyRef.set(body);
            byte[] response = """
                    {"translations":[{"text":"너도 와야 해"}]}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();
        return new DeepLTranslationClient("http://127.0.0.1:" + server.getAddress().getPort(), "test-key");
    }
}
