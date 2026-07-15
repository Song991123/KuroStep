package com.kurostep.translation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.kurostep.lyric.domain.Lyric;
import com.kurostep.lyric.domain.LyricLineRef;
import com.kurostep.lyric.domain.LyricsProviderType;
import com.kurostep.lyric.repository.LyricLineRefRepository;
import com.kurostep.track.domain.Track;
import com.kurostep.track.domain.TrackSourceType;
import com.kurostep.translation.domain.LyricTranslation;
import com.kurostep.translation.domain.TranslationProviderType;
import com.kurostep.translation.domain.TranslationStatus;
import com.kurostep.translation.dto.AutoTranslationRequest;
import com.kurostep.translation.dto.LyricTranslationResponse;
import com.kurostep.translation.provider.TranslationProviderClient;
import com.kurostep.translation.repository.LyricTranslationRepository;
import com.kurostep.user.domain.User;
import com.kurostep.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class LyricTranslationServiceTest {

    @Mock
    private LyricTranslationRepository lyricTranslationRepository;

    @Mock
    private LyricLineRefRepository lyricLineRefRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TranslationProviderClient translationProviderClient;

    @InjectMocks
    private LyricTranslationService lyricTranslationService;

    @Test
    void createAutoDraftKeepsEditedManualTranslationWithoutCallingProvider() {
        User user = userWithId(10L);
        LyricLineRef lineRef = lineRefWithId(20L);
        LyricTranslation edited = LyricTranslation.createManual(
                lineRef,
                user,
                "ko",
                "사용자가 고친 번역",
                "직접 다듬은 메모"
        );
        ReflectionTestUtils.setField(edited, "id", 30L);

        when(userRepository.findById(10L)).thenReturn(Optional.of(user));
        when(lyricLineRefRepository.findById(20L)).thenReturn(Optional.of(lineRef));
        when(lyricTranslationRepository.findByUserIdAndLyricLineRefIdAndLanguageCode(10L, 20L, "ko"))
                .thenReturn(Optional.of(edited));

        LyricTranslationResponse response = lyricTranslationService.createAutoDraft(
                10L,
                20L,
                new AutoTranslationRequest("Green, green", "en", "ko", "자동 메모")
        );

        assertThat(response.translatedText()).isEqualTo("사용자가 고친 번역");
        assertThat(response.memoText()).isEqualTo("직접 다듬은 메모");
        assertThat(response.provider()).isEqualTo(TranslationProviderType.MANUAL);
        assertThat(response.status()).isEqualTo(TranslationStatus.EDITED);
        verifyNoInteractions(translationProviderClient);
    }

    private User userWithId(Long id) {
        User user = User.create("qa@example.com", "encoded-password", "qa");
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    private LyricLineRef lineRefWithId(Long id) {
        Track track = Track.create(
                "Kuro Step",
                "QA",
                "QA Album",
                TrackSourceType.YOUTUBE,
                "https://youtu.be/qa",
                "qa",
                180
        );
        ReflectionTestUtils.setField(track, "id", 11L);
        Lyric lyric = Lyric.create(track, LyricsProviderType.LRCLIB, "qa-lyrics", "en", true, LocalDateTime.now());
        ReflectionTestUtils.setField(lyric, "id", 12L);
        LyricLineRef lineRef = LyricLineRef.create(lyric, 0, 0, "hash");
        ReflectionTestUtils.setField(lineRef, "id", id);
        return lineRef;
    }
}
