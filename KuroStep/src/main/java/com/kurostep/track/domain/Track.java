package com.kurostep.track.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "tracks")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Track extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                    // 곡 ID

    @Column(length = 150, nullable = false)
    private String title;               // 곡 제목

    @Column(length = 150)
    private String artist;              // 아티스트

    @Column(length = 150)
    private String album;               // 앨범명

    @Enumerated(EnumType.STRING)
    @Column(length = 30, nullable = false)
    private TrackSourceType sourceType; // 곡 출처 타입

    @Column(length = 500)
    private String sourceUrl;           // 외부 재생 URL

    @Column(length = 150)
    private String sourceId;            // 외부 플랫폼의 곡/영상 ID

    private Integer durationSeconds;    // 곡 길이, 초 단위

    // ========= Constructor =========
    private Track(String title, String artist, String album, TrackSourceType sourceType, String sourceUrl, String sourceId, Integer durationSeconds) {
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.sourceType = sourceType;
        this.sourceUrl = sourceUrl;
        this.sourceId = sourceId;
        this.durationSeconds = durationSeconds;
    }

    // ========= Method =========
    public static Track create(String title, String artist, String album, TrackSourceType sourceType, String sourceUrl, String sourceId, Integer durationSeconds) {
        return new Track(title, artist, album, sourceType, sourceUrl, sourceId, durationSeconds);
    }
}
