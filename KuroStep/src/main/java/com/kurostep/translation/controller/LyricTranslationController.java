package com.kurostep.translation.controller;

import com.kurostep.translation.dto.AutoTranslationRequest;
import com.kurostep.translation.dto.LyricTranslationResponse;
import com.kurostep.translation.dto.LyricTranslationSaveRequest;
import com.kurostep.translation.service.LyricTranslationService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lyric-line-refs")
public class LyricTranslationController {

    private final LyricTranslationService lyricTranslationService;

    public LyricTranslationController(LyricTranslationService lyricTranslationService) {
        this.lyricTranslationService = lyricTranslationService;
    }

    @PostMapping("/{lineRefId}/translations")
    public LyricTranslationResponse saveManual(
            @RequestParam Long userId,
            @PathVariable Long lineRefId,
            @Valid @RequestBody LyricTranslationSaveRequest request
    ) {
        return lyricTranslationService.saveManual(userId, lineRefId, request);
    }

    @PostMapping("/{lineRefId}/translations/auto-draft")
    public LyricTranslationResponse createAutoDraft(
            @RequestParam Long userId,
            @PathVariable Long lineRefId,
            @Valid @RequestBody AutoTranslationRequest request
    ) {
        return lyricTranslationService.createAutoDraft(userId, lineRefId, request);
    }

    @GetMapping("/{lineRefId}/translations")
    public List<LyricTranslationResponse> findByLine(
            @RequestParam Long userId,
            @PathVariable Long lineRefId
    ) {
        return lyricTranslationService.findByLine(userId, lineRefId);
    }
}
