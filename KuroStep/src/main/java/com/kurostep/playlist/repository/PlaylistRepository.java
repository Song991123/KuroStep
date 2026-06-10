package com.kurostep.playlist.repository;

import com.kurostep.playlist.domain.Playlist;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaylistRepository extends JpaRepository<Playlist, Long> {

    List<Playlist> findByUserIdOrderByCreatedAtDesc(Long userId);
}
