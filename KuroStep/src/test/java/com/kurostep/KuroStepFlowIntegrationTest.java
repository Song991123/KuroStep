package com.kurostep;

import static org.assertj.core.api.Assertions.assertThat;

import com.kurostep.auth.dto.AuthResponse;
import com.kurostep.auth.dto.SignupRequest;
import com.kurostep.auth.service.AuthService;
import com.kurostep.playlist.dto.PlaylistCreateRequest;
import com.kurostep.playlist.dto.PlaylistResponse;
import com.kurostep.playlist.dto.PlaylistTrackResponse;
import com.kurostep.playlist.service.PlaylistService;
import com.kurostep.task.domain.TaskStatus;
import com.kurostep.task.dto.CreatorTaskCreateRequest;
import com.kurostep.task.dto.CreatorTaskResponse;
import com.kurostep.task.dto.CreatorTaskStatusUpdateRequest;
import com.kurostep.task.service.CreatorTaskService;
import com.kurostep.track.domain.TrackSourceType;
import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.TrackResponse;
import com.kurostep.track.service.TrackService;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class KuroStepFlowIntegrationTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private TrackService trackService;

    @Autowired
    private PlaylistService playlistService;

    @Autowired
    private CreatorTaskService creatorTaskService;

    @Test
    @DisplayName("회원가입부터 작업 카드에 플레이리스트와 현재 곡을 연결하는 MVP 흐름")
    void mvpFlow() {
        AuthResponse user = authService.signup(new SignupRequest(
                "flow@test.com",
                "1234",
                "maren"
        ));

        TrackResponse track = trackService.create(new TrackCreateRequest(
                "Kuro Step",
                "Test Artist",
                "Demo Album",
                TrackSourceType.YOUTUBE,
                "https://www.youtube.com/watch?v=abc123",
                "abc123",
                180
        ));

        PlaylistResponse playlist = playlistService.create(
                user.userId(),
                new PlaylistCreateRequest("작업용 BGM", "오늘 작업할 때 들을 곡")
        );

        PlaylistTrackResponse playlistTrack = playlistService.addTrack(
                user.userId(),
                playlist.id(),
                track.id()
        );

        CreatorTaskResponse task = creatorTaskService.create(
                user.userId(),
                new CreatorTaskCreateRequest(
                        "콘티 3페이지",
                        "1화 초반부 콘티 정리",
                        LocalDate.of(2026, 6, 8)
                )
        );

        CreatorTaskResponse connectedTask = creatorTaskService.connectPlaylist(
                user.userId(),
                task.id(),
                playlist.id()
        );

        CreatorTaskResponse currentTrackTask = creatorTaskService.changeCurrentPlaylistTrack(
                user.userId(),
                task.id(),
                playlistTrack.playlistTrackId()
        );

        CreatorTaskResponse doingTask = creatorTaskService.changeStatus(
                user.userId(),
                task.id(),
                new CreatorTaskStatusUpdateRequest(TaskStatus.DOING)
        );

        assertThat(connectedTask.playlistId()).isEqualTo(playlist.id());
        assertThat(currentTrackTask.currentPlaylistTrackId()).isEqualTo(playlistTrack.playlistTrackId());
        assertThat(doingTask.status()).isEqualTo(TaskStatus.DOING);
    }
}
