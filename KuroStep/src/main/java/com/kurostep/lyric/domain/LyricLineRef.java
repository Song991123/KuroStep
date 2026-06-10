package com.kurostep.lyric.domain;

import com.kurostep.common.domain.BaseTimeEntity;
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
    name = "lyric_line_refs",
    uniqueConstraints = {
        @UniqueConstraint(
                name = "uk_lyric_line_refs_lyric_id_line_index",
                columnNames = {"lyric_id", "line_index"}
        )
    }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class LyricLineRef extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;              // 가사 라인 참조 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lyric_id", nullable = false)
    private Lyric lyric;          // 연결 가사 묶음

    @Column(nullable = false)
    private int lineIndex;        // 라인 순서

    private Integer startTimeMs;  // 시작 시간 ms

    @Column(length = 64)
    private String textHash;      // 로컬 원문 라인 연결용 해시

    // ========= Constructor =========
    private LyricLineRef(Lyric lyric, int lineIndex, Integer startTimeMs, String textHash) {
        this.lyric = lyric;
        this.lineIndex = lineIndex;
        this.startTimeMs = startTimeMs;
        this.textHash = textHash;
    }

    // ========= Method =========
    public static LyricLineRef create(Lyric lyric, int lineIndex, Integer startTimeMs, String textHash) {
        return new LyricLineRef(lyric, lineIndex, startTimeMs, textHash);
    }
}
