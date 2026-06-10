package com.kurostep.lyric.repository;

import com.kurostep.lyric.domain.UserLyricCache;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserLyricCacheRepository extends JpaRepository<UserLyricCache, Long> {

    Optional<UserLyricCache> findByUserIdAndLyricId(Long userId, Long lyricId);
}
