package com.kurostep.track.repository;

import com.kurostep.track.domain.Track;
import com.kurostep.track.domain.TrackSourceType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackRepository extends JpaRepository<Track, Long> {

    List<Track> findByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(String title, String artist);

    Optional<Track> findBySourceTypeAndSourceId(TrackSourceType sourceType, String sourceId);
}
