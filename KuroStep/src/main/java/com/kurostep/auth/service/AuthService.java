package com.kurostep.auth.service;

import com.kurostep.auth.dto.AuthResponse;
import com.kurostep.auth.dto.LoginRequest;
import com.kurostep.auth.dto.SignupRequest;
import com.kurostep.common.exception.ConflictException;
import com.kurostep.common.exception.NotFoundException;
import com.kurostep.security.jwt.JwtTokenProvider;
import com.kurostep.user.domain.User;
import com.kurostep.user.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JwtTokenProvider jwtTokenProvider
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Transactional
    public AuthResponse signup(SignupRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ConflictException("이미 사용 중인 이메일입니다.");
        }

        User user = User.create(
                request.email(),
                passwordEncoder.encode(request.password()),
                request.nickname()
        );

        User savedUser = userRepository.save(user);
        return AuthResponse.from(savedUser, jwtTokenProvider.createToken(savedUser.getId()));
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        return AuthResponse.from(user, jwtTokenProvider.createToken(user.getId()));
    }

    public AuthResponse findMe(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다."));

        return AuthResponse.from(user);
    }
}
