package com.kurostep.translation.service;

import com.kurostep.common.exception.NotFoundException;
import com.kurostep.lyric.domain.LyricLineRef;
import com.kurostep.lyric.repository.LyricLineRefRepository;
import com.kurostep.translation.domain.LyricTranslation;
import com.kurostep.translation.dto.LyricTranslationResponse;
import com.kurostep.translation.dto.LyricTranslationSaveRequest;
import com.kurostep.translation.dto.AutoTranslationRequest;
import com.kurostep.translation.provider.TranslationProviderClient;
import com.kurostep.translation.provider.TranslationProviderResult;
import com.kurostep.translation.repository.LyricTranslationRepository;
import com.kurostep.user.domain.User;
import com.kurostep.user.repository.UserRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class LyricTranslationService {

    private final LyricTranslationRepository lyricTranslationRepository;
    private final LyricLineRefRepository lyricLineRefRepository;
    private final UserRepository userRepository;
    private final TranslationProviderClient translationProviderClient;

    public LyricTranslationService(
            LyricTranslationRepository lyricTranslationRepository,
            LyricLineRefRepository lyricLineRefRepository,
            UserRepository userRepository,
            TranslationProviderClient translationProviderClient
    ) {
        this.lyricTranslationRepository = lyricTranslationRepository;
        this.lyricLineRefRepository = lyricLineRefRepository;
        this.userRepository = userRepository;
        this.translationProviderClient = translationProviderClient;
    }

    @Transactional
    public LyricTranslationResponse saveManual(Long userId, Long lyricLineRefId, LyricTranslationSaveRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다."));
        LyricLineRef lineRef = lyricLineRefRepository.findById(lyricLineRefId)
                .orElseThrow(() -> new NotFoundException("가사 라인 참조를 찾을 수 없습니다."));
        String languageCode = normalizeLanguageCode(request.languageCode());

        LyricTranslation translation = lyricTranslationRepository
                .findByUserIdAndLyricLineRefIdAndLanguageCode(userId, lyricLineRefId, languageCode)
                .map(existing -> {
                    existing.edit(request.translatedText(), request.memoText());
                    return existing;
                })
                .orElseGet(() -> lyricTranslationRepository.save(
                        LyricTranslation.createManual(lineRef, user, languageCode, request.translatedText(), request.memoText())
                ));

        return LyricTranslationResponse.from(translation);
    }

    @Transactional
    public LyricTranslationResponse createAutoDraft(Long userId, Long lyricLineRefId, AutoTranslationRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다."));
        LyricLineRef lineRef = lyricLineRefRepository.findById(lyricLineRefId)
                .orElseThrow(() -> new NotFoundException("가사 라인 참조를 찾을 수 없습니다."));
        String languageCode = normalizeLanguageCode(request.targetLanguageCode());

        TranslationProviderResult result = translationProviderClient.translate(
                request.sourceText(),
                request.sourceLanguageCode(),
                languageCode
        );

        LyricTranslation translation = lyricTranslationRepository
                .findByUserIdAndLyricLineRefIdAndLanguageCode(userId, lyricLineRefId, languageCode)
                .map(existing -> {
                    existing.replaceDraft(result.translatedText(), request.memoText(), result.provider());
                    return existing;
                })
                .orElseGet(() -> lyricTranslationRepository.save(
                        LyricTranslation.createDraft(lineRef, user, languageCode, result.translatedText(), request.memoText(), result.provider())
                ));

        return LyricTranslationResponse.from(translation);
    }

    public List<LyricTranslationResponse> findByLine(Long userId, Long lyricLineRefId) {
        return lyricTranslationRepository.findByLyricLineRefIdAndUserId(lyricLineRefId, userId)
                .stream()
                .map(LyricTranslationResponse::from)
                .toList();
    }

    private String normalizeLanguageCode(String languageCode) {
        if (languageCode == null || languageCode.isBlank()) {
            return "ko";
        }
        return languageCode.trim().toLowerCase();
    }
}
