package com.kurostep.playlist.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.track.domain.Track;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
    name = "playlist_tracks",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_playlist_tracks_playlist_id_track_id",
            columnNames = {"playlist_id", "track_id"}
        )
    }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlaylistTrack extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;            // 플레이리스트 곡 항목 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "playlist_id", nullable = false)
    private Playlist playlist;  // 곡이 담긴 플레이리스트

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "track_id", nullable = false)
    private Track track;        // 플레이리스트에 추가된 곡

    @Column(nullable = false)
    private int sortOrder;      // 플레이리스트 안에서의 표시 순서

    // ========= Constructor =========
    private PlaylistTrack(Playlist playlist, Track track, int sortOrder) {
        this.playlist = playlist;
        this.track = track;
        this.sortOrder = sortOrder;
    }

    // ========= Method =========
    public static PlaylistTrack create(Playlist playlist, Track track, int sortOrder) {
        return new PlaylistTrack(playlist, track, sortOrder);
    }

    public void changeSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
