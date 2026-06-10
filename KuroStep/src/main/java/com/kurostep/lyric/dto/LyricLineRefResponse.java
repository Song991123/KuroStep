package com.kurostep.lyric.dto;

import com.kurostep.lyric.domain.LyricLineRef;

public record LyricLineRefResponse(
        Long id,
        int lineIndex,
        Integer startTimeMs,
        String textHash
) {

    public static LyricLineRefResponse from(LyricLineRef lineRef) {
        return new LyricLineRefResponse(
                lineRef.getId(),
                lineRef.getLineIndex(),
                lineRef.getStartTimeMs(),
                lineRef.getTextHash()
        );
    }
}
