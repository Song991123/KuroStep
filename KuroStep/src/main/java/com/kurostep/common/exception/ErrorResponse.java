package com.kurostep.common.exception;

public record ErrorResponse(
        String code,
        String message
) {
}
