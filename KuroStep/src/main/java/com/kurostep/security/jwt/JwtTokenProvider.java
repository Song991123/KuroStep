package com.kurostep.security.jwt;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtTokenProvider {

    private static final Pattern SUBJECT_PATTERN = Pattern.compile("\"sub\"\\s*:\\s*\"?(\\d+)\"?");
    private static final Pattern EXPIRATION_PATTERN = Pattern.compile("\"exp\"\\s*:\\s*(\\d+)");

    private final String secret;
    private final long expirationMinutes;

    public JwtTokenProvider(
            @Value("${kurostep.jwt.secret}") String secret,
            @Value("${kurostep.jwt.expiration-minutes}") long expirationMinutes
    ) {
        this.secret = secret;
        this.expirationMinutes = expirationMinutes;
    }

    public String createToken(Long userId) {
        long expiresAt = Instant.now().plusSeconds(expirationMinutes * 60).getEpochSecond();
        String header = base64Url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        String payload = base64Url("{\"sub\":\"" + userId + "\",\"exp\":" + expiresAt + "}");
        String unsignedToken = header + "." + payload;

        return unsignedToken + "." + sign(unsignedToken);
    }

    public Long getUserId(String token) {
        String payload = decodePayload(token);
        Matcher matcher = SUBJECT_PATTERN.matcher(payload);
        if (!matcher.find()) {
            throw new IllegalArgumentException("JWT subject가 없습니다.");
        }

        return Long.valueOf(matcher.group(1));
    }

    public boolean isValid(String token) {
        try {
            String[] parts = split(token);
            String unsignedToken = parts[0] + "." + parts[1];
            String expectedSignature = sign(unsignedToken);
            if (!constantTimeEquals(expectedSignature, parts[2])) {
                return false;
            }

            return !isExpired(decodePayload(token));
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean isExpired(String payload) {
        Matcher matcher = EXPIRATION_PATTERN.matcher(payload);
        if (!matcher.find()) {
            return true;
        }

        long expiresAt = Long.parseLong(matcher.group(1));
        return expiresAt < Instant.now().getEpochSecond();
    }

    private String decodePayload(String token) {
        String[] parts = split(token);
        byte[] decoded = Base64.getUrlDecoder().decode(parts[1]);
        return new String(decoded, StandardCharsets.UTF_8);
    }

    private String[] split(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("JWT 형식이 올바르지 않습니다.");
        }
        return parts;
    }

    private String sign(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(key);
            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("JWT 서명 생성에 실패했습니다.", e);
        }
    }

    private String base64Url(String value) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private boolean constantTimeEquals(String expected, String actual) {
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        byte[] actualBytes = actual.getBytes(StandardCharsets.UTF_8);
        if (expectedBytes.length != actualBytes.length) {
            return false;
        }

        int result = 0;
        for (int i = 0; i < expectedBytes.length; i++) {
            result |= expectedBytes[i] ^ actualBytes[i];
        }
        return result == 0;
    }
}
