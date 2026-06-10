package com.kurostep.task.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.playlist.domain.Playlist;
import com.kurostep.playlist.domain.PlaylistTrack;
import com.kurostep.user.domain.User;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Entity
@Table(name = "creator_tasks")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreatorTask extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                            // 작업 카드 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;                          // 작업 소유자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id")
    private Playlist playlist;                  // 작업에 연결된 플레이리스트

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_playlist_track_id")
    private PlaylistTrack currentPlaylistTrack; // 현재 재생/오버레이 표시 곡 항목

    @Column(length = 100, nullable = false)
    private String title;                       // 작업 제목

    /*
    * H2도 사용하므로, MySQL과 H2 둘 다 적용시키기 위해
    * @Column(columnDefinition = "TEXT")가 아닌 Lob 사용
    * */
    @Lob
    private String description;                 // 작업 설명

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false)
    private TaskStatus status;                  // 작업 상태

    @Column(nullable = false)
    private LocalDate taskDate;                 // 작업 날짜

    // ========= Constructor =========
    private CreatorTask(User user, String title, String description, LocalDate taskDate) {
        this.user = user;
        this.title = title;
        this.description = description;
        this.status = TaskStatus.TODO;
        this.taskDate = taskDate;
    }

    // ========= Method =========
    public static CreatorTask create(User user, String title, String description, LocalDate taskDate) {
        return new CreatorTask(user, title, description, taskDate);
    }

    public void update(String title, String description, LocalDate taskDate){
        this.title = title;
        this.description = description;
        this.taskDate = taskDate;
    }

    public void changeStatus(TaskStatus status){
        this.status = status;
    }

    public void connectPlaylist(Playlist playlist){
        this.playlist = playlist;
    }

    public void changeCurrentPlaylistTrack(PlaylistTrack playlistTrack){
        this.currentPlaylistTrack = playlistTrack;
    }


}
