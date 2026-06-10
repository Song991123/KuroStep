package com.kurostep.lyric.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(
    name = "user_lyric_caches",
    uniqueConstraints = {
        @UniqueConstraint(
            name = "uk_user_lyric_caches_user_id_lyric_id",
            columnNames = {"user_id", "lyric_id"}
        )
    }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserLyricCache extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;                                      // 사용자 가사 캐시 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;                                    // 캐시 소유자

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lyric_id", nullable = false)
    private Lyric lyric;                                  // 연결 가사 묶음

    @Enumerated(EnumType.STRING)
    @Column(length = 30, nullable = false)
    private LyricCacheStorageType cacheStorageType;       // 원문 가사 저장 위치

    @Column(nullable = false, length = 255)
    private String localCacheKey;                         // Tauri 로컬 가사 파일 키

    @Enumerated(EnumType.STRING)
    @Column(length = 30, nullable = false)
    private LyricCacheStatus cacheStatus;                 // 로컬 파일 저장 상태

    private LocalDateTime savedAt;                        // Tauri 로컬 파일 저장 완료 시각

    // ========= Constructor =========
    private UserLyricCache(User user, Lyric lyric, String localCacheKey) {
        this.user = user;
        this.lyric = lyric;
        this.cacheStorageType = LyricCacheStorageType.LOCAL_FILE;
        this.localCacheKey = localCacheKey;
        this.cacheStatus = LyricCacheStatus.PENDING_LOCAL_SAVE;
    }

    // ========= Method =========
    public static UserLyricCache create(User user, Lyric lyric, String localCacheKey) {
        return new UserLyricCache(user, lyric, localCacheKey);
    }

    public void markSaved(LocalDateTime savedAt) {
        this.cacheStatus = LyricCacheStatus.SAVED;
        this.savedAt = savedAt;
    }

    public void markMissing() {
        this.cacheStatus = LyricCacheStatus.MISSING;
    }

    public void markFailed() {
        this.cacheStatus = LyricCacheStatus.FAILED_LOCAL_SAVE;
    }
}
