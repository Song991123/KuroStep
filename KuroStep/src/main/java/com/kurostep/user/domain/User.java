package com.kurostep.user.domain;

import com.kurostep.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseTimeEntity {

    // ========= Field =========
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;            // 사용자 ID

    @Column(nullable = false, unique = true, length = 100)
    private String email;       // 로그인 이메일

    @Column(nullable = false)
    private String password;    // BCrypt 암호화 비밀번호

    @Column(nullable = false, length = 50)
    private String nickname;    // 사용자 닉네임

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private UserRole role;      // 사용자 권한

    // ========= Constructor =========

    private User(String email, String password, String nickname, UserRole role) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.role = role;
    }

    public static User create(String email, String encodedPassword, String nickname) {
        return new User(email, encodedPassword, nickname, UserRole.ROLE_USER);
    }


}
