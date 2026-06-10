package com.kurostep.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @Email @NotBlank String email,
        @NotBlank @Size(min = 4, max = 50) String password,
        @NotBlank @Size(max = 50) String nickname
) {
}
