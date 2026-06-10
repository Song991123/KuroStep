package com.kurostep.translation.repository;

import com.kurostep.translation.domain.LyricTranslation;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LyricTranslationRepository extends JpaRepository<LyricTranslation, Long> {

    Optional<LyricTranslation> findByLyricLineRefIdAndUserId(Long lyricLineRefId, Long userId);

    Optional<LyricTranslation> findByUserIdAndLyricLineRefIdAndLanguageCode(Long userId, Long lyricLineRefId, String languageCode);
}
