package com.kurostep.lyric.provider;

import com.kurostep.lyric.dto.LyricLineRefCreateRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class LyricLineRefParser {

    private static final Pattern LRC_LINE_PATTERN = Pattern.compile("^\\[(\\d{1,2}):(\\d{2})(?:\\.(\\d{1,3}))?]\\s*(.*)$");

    public List<LyricLineRefCreateRequest> parse(String text) {
        List<LyricLineRefCreateRequest> lines = new ArrayList<>();
        if (text == null || text.isBlank()) {
            return lines;
        }

        String[] rawLines = text.split("\\R");
        for (String rawLine : rawLines) {
            String line = rawLine.strip();
            if (line.isBlank()) {
                continue;
            }

            Matcher matcher = LRC_LINE_PATTERN.matcher(line);
            Integer startTimeMs = null;
            String lyricText = line;
            if (matcher.matches()) {
                startTimeMs = toMilliseconds(matcher);
                lyricText = matcher.group(4).strip();
            }

            if (!lyricText.isBlank()) {
                lines.add(new LyricLineRefCreateRequest(lines.size(), startTimeMs, sha256(lyricText)));
            }
        }

        return lines;
    }

    private Integer toMilliseconds(Matcher matcher) {
        int minutes = Integer.parseInt(matcher.group(1));
        int seconds = Integer.parseInt(matcher.group(2));
        String fraction = matcher.group(3);
        int milliseconds = 0;
        if (fraction != null) {
            milliseconds = Integer.parseInt((fraction + "000").substring(0, 3));
        }

        return (minutes * 60 + seconds) * 1000 + milliseconds;
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashed);
        } catch (Exception e) {
            throw new IllegalStateException("가사 라인 해시 생성에 실패했습니다.", e);
        }
    }
}
