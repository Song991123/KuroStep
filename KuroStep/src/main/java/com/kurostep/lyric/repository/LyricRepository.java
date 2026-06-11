package com.kurostep.lyric.repository;

import com.kurostep.lyric.domain.Lyric;
import com.kurostep.lyric.domain.LyricsProviderType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LyricRepository extends JpaRepository<Lyric, Long> {

    List<Lyric> findByTrackId(Long trackId);

    Optional<Lyric> findByTrackIdAndProvider(Long trackId, LyricsProviderType provider);

    List<Lyric> findByTrackIdAndProviderAndProviderLyricsId(
            Long trackId,
            LyricsProviderType provider,
            String providerLyricsId
    );
}
