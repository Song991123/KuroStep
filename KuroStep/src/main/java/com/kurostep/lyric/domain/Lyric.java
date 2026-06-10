package com.kurostep.lyric.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.track.domain.Track;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Getter
@Table(name = "lyrics")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Lyric extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                     // 가사 묶음 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "track_id", nullable = false)
    private Track track;                 // 연결된 곡

    @Enumerated(EnumType.STRING)
    @Column(length = 50, nullable = false)
    private LyricsProviderType provider; // 가사 제공자

    @Column(length = 150)
    private String providerLyricsId;     // Provider 내부 가사 ID

    @Column(length = 10)
    private String languageCode;         // 원문 언어 코드

    @Column(nullable = false)
    private boolean synced;              // 시간값 포함 여부

    private LocalDateTime fetchedAt;     // 외부 Provider 조회 시각

    // ========= Constructor =========
    private Lyric(Track track, LyricsProviderType provider, String providerLyricsId, String languageCode, boolean synced, LocalDateTime fetchedAt) {
        this.track = track;
        this.provider = provider;
        this.providerLyricsId = providerLyricsId;
        this.languageCode = languageCode;
        this.synced = synced;
        this.fetchedAt = fetchedAt;
    }

    // ========= Method =========
    public static Lyric create(Track track, LyricsProviderType provider, String providerLyricsId, String languageCode, boolean synced, LocalDateTime fetchedAt) {
        return new Lyric(track, provider, providerLyricsId, languageCode, synced, fetchedAt);
    }
}
