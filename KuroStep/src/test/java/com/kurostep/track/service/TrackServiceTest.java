package com.kurostep.track.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.track.domain.TrackSourceType;
import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.TrackResponse;
import com.kurostep.track.repository.TrackRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class TrackServiceTest {

    @Autowired
    private TrackService trackService;

    @Autowired
    private TrackRepository trackRepository;

    @Test
    @DisplayName("곡을 등록하면 tracks 테이블에 저장된다")
    void create() {
        TrackCreateRequest request = new TrackCreateRequest(
                "Kuro Step",
                "Test Artist",
                "Demo Album",
                TrackSourceType.YOUTUBE,
                "https://www.youtube.com/watch?v=abc123",
                "abc123",
                180
        );

        TrackResponse response = trackService.create(request);

        assertThat(response.id()).isNotNull();
        assertThat(response.title()).isEqualTo("Kuro Step");
        assertThat(response.sourceType()).isEqualTo(TrackSourceType.YOUTUBE);
        assertThat(trackRepository.findById(response.id())).isPresent();
    }

    @Test
    @DisplayName("같은 sourceType, sourceId로 곡을 등록하면 기존 곡을 반환한다")
    void createDuplicateSource() {
        TrackCreateRequest request = new TrackCreateRequest(
                "Kuro Step",
                "Test Artist",
                "Demo Album",
                TrackSourceType.YOUTUBE,
                "https://www.youtube.com/watch?v=abc123",
                "abc123",
                180
        );

        TrackResponse first = trackService.create(request);
        TrackResponse second = trackService.create(request);

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(trackRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("곡 제목 또는 아티스트명으로 검색할 수 있다")
    void search() {
        trackService.create(new TrackCreateRequest(
                "Kuro Step",
                "Black Cat",
                null,
                TrackSourceType.YOUTUBE,
                null,
                "kuro-step",
                null
        ));

        List<TrackResponse> responses = trackService.search("cat");

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).artist()).isEqualTo("Black Cat");
    }
}
