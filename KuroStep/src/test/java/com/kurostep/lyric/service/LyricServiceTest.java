package com.kurostep.lyric.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.lyric.dto.LyricCreateRequest;
import com.kurostep.lyric.dto.LyricLineRefCreateRequest;
import com.kurostep.lyric.dto.LyricResponse;
import com.kurostep.lyric.repository.LyricRepository;
import com.kurostep.track.domain.TrackSourceType;
import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.TrackResponse;
import com.kurostep.track.service.TrackService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class LyricServiceTest {

    @Autowired
    private TrackService trackService;

    @Autowired
    private LyricService lyricService;

    @Autowired
    private LyricRepository lyricRepository;

    @Test
    @DisplayName("같은 Provider 가사 ID로 라인 참조를 다시 만들면 기존 가사 묶음을 재사용한다")
    void createLineRefsReusesExistingProviderLyric() {
        TrackResponse track = trackService.create(new TrackCreateRequest(
                "Never Gonna Give You Up",
                "Rick Astley",
                null,
                TrackSourceType.YOUTUBE,
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                "dQw4w9WgXcQ",
                212
        ));

        LyricCreateRequest request = new LyricCreateRequest(
                "lrclib-34996860",
                "en",
                true,
                List.of(new LyricLineRefCreateRequest(0, 19640, "hash-0"))
        );

        LyricResponse first = lyricService.createLineRefs(track.id(), request);
        LyricResponse second = lyricService.createLineRefs(track.id(), request);

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(second.lines()).hasSize(1);
        assertThat(lyricRepository.findByTrackId(track.id())).hasSize(1);
    }
}
