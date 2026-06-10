package com.kurostep.lyric.controller;

import com.kurostep.lyric.dto.LyricCreateRequest;
import com.kurostep.lyric.dto.LyricFetchResponse;
import com.kurostep.lyric.dto.LyricResponse;
import com.kurostep.lyric.service.LyricService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class LyricController {

    private final LyricService lyricService;

    public LyricController(LyricService lyricService) {
        this.lyricService = lyricService;
    }

    @PostMapping("/tracks/{trackId}/lyrics/line-refs")
    public LyricResponse createLineRefs(
            @PathVariable Long trackId,
            @Valid @RequestBody LyricCreateRequest request
    ) {
        return lyricService.createLineRefs(trackId, request);
    }

    @PostMapping("/tracks/{trackId}/lyrics/fetch")
    public LyricFetchResponse fetchFromProvider(@PathVariable Long trackId) {
        return lyricService.fetchFromProvider(trackId);
    }

    @GetMapping("/tracks/{trackId}/lyrics")
    public List<LyricResponse> findByTrack(@PathVariable Long trackId) {
        return lyricService.findByTrack(trackId);
    }

    @GetMapping("/lyrics/{lyricId}")
    public LyricResponse findOne(@PathVariable Long lyricId) {
        return lyricService.findOne(lyricId);
    }
}
