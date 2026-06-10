package com.kurostep.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kurostep.auth.dto.AuthResponse;
import com.kurostep.auth.dto.LoginRequest;
import com.kurostep.auth.dto.SignupRequest;
import com.kurostep.common.exception.ConflictException;
import com.kurostep.user.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class AuthServiceTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("회원가입하면 비밀번호는 BCrypt로 암호화되어 저장된다")
    void signup() {
        SignupRequest request = new SignupRequest(
                "test@test.com",
                "1234",
                "maren"
        );

        AuthResponse response = authService.signup(request);

        assertThat(response.userId()).isNotNull();
        assertThat(response.email()).isEqualTo("test@test.com");
        assertThat(response.nickname()).isEqualTo("maren");

        String savedPassword = userRepository.findByEmail("test@test.com")
                .orElseThrow()
                .getPassword();

        assertThat(savedPassword).isNotEqualTo("1234");
    }

    @Test
    @DisplayName("이미 가입된 이메일로 회원가입하면 예외가 발생한다")
    void signupDuplicateEmail() {
        SignupRequest request = new SignupRequest(
                "duplicate@test.com",
                "1234",
                "maren"
        );
        authService.signup(request);

        assertThatThrownBy(() -> authService.signup(request))
                .isInstanceOf(ConflictException.class)
                .hasMessage("이미 사용 중인 이메일입니다.");
    }

    @Test
    @DisplayName("가입한 이메일과 비밀번호로 로그인할 수 있다")
    void login() {
        authService.signup(new SignupRequest(
                "login@test.com",
                "1234",
                "maren"
        ));

        AuthResponse response = authService.login(new LoginRequest(
                "login@test.com",
                "1234"
        ));

        assertThat(response.email()).isEqualTo("login@test.com");
        assertThat(response.nickname()).isEqualTo("maren");
    }
}
