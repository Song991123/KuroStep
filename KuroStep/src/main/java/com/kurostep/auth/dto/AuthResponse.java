package com.kurostep.auth.dto;

import com.kurostep.user.domain.User;

public record AuthResponse(
        Long userId,
        String email,
        String nickname,
        String accessToken
) {

    public static AuthResponse from(User user) {
        return from(user, null);
    }

    public static AuthResponse from(User user, String accessToken) {
        return new AuthResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                accessToken
        );
    }
}
