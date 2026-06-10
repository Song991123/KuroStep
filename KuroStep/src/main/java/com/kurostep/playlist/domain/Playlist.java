package com.kurostep.playlist.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import com.kurostep.user.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@Table(name = "playlists")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Playlist extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;            // 플레이리스트 ID

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;          // 플레이리스트 소유자

    @Column(nullable = false, length = 100)
    private String name;        // 플레이리스트 이름

    @Column(length = 500)
    private String description; // 플레이리스트 설명

    // ========= Constructor =========
    private Playlist(User user, String name, String description) {
        this.user = user;
        this.name = name;
        this.description = description;
    }

    // ========= Method =========
    public static Playlist create(User user, String name, String description) {
        return new Playlist(user, name, description);
    }

    public void update(String name, String description) {
        this.name = name;
        this.description = description;
    }
}
