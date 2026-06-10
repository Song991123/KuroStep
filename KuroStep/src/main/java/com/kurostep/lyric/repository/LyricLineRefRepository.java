package com.kurostep.lyric.repository;

import com.kurostep.lyric.domain.LyricLineRef;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LyricLineRefRepository extends JpaRepository<LyricLineRef, Long> {

    List<LyricLineRef> findByLyricIdOrderByLineIndexAsc(Long lyricId);
}
