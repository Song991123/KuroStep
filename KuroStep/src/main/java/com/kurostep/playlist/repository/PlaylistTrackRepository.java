package com.kurostep.playlist.repository;

import com.kurostep.playlist.domain.PlaylistTrack;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PlaylistTrackRepository extends JpaRepository<PlaylistTrack, Long> {

    List<PlaylistTrack> findByPlaylistIdOrderBySortOrderAsc(Long playlistId);

    boolean existsByPlaylistIdAndTrackId(Long playlistId, Long trackId);

    Optional<PlaylistTrack> findByPlaylistIdAndTrackId(Long playlistId, Long trackId);

    Optional<PlaylistTrack> findTopByPlaylistIdOrderBySortOrderDesc(Long playlistId);
}
