package com.kurostep.track.service;

import com.kurostep.common.exception.NotFoundException;
import com.kurostep.track.domain.Track;
import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.TrackResponse;
import com.kurostep.track.repository.TrackRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TrackService {

    private final TrackRepository trackRepository;

    public TrackService(TrackRepository trackRepository) {
        this.trackRepository = trackRepository;
    }

    @Transactional
    public TrackResponse create(TrackCreateRequest request) {
        if (request.sourceId() != null && !request.sourceId().isBlank()) {
            return trackRepository.findBySourceTypeAndSourceId(request.sourceType(), request.sourceId())
                    .map(track -> {
                        track.updateMetadata(
                                request.title(),
                                request.artist(),
                                request.album(),
                                request.sourceUrl(),
                                request.durationSeconds()
                        );
                        return TrackResponse.from(track);
                    })
                    .orElseGet(() -> saveTrack(request));
        }

        return saveTrack(request);
    }

    public List<TrackResponse> search(String keyword) {
        String searchKeyword = keyword == null ? "" : keyword.trim();

        return trackRepository.findByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(searchKeyword, searchKeyword)
                .stream()
                .map(TrackResponse::from)
                .toList();
    }

    public TrackResponse findOne(Long trackId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));

        return TrackResponse.from(track);
    }

    private TrackResponse saveTrack(TrackCreateRequest request) {
        Track track = Track.create(
                request.title(),
                request.artist(),
                request.album(),
                request.sourceType(),
                request.sourceUrl(),
                request.sourceId(),
                request.durationSeconds()
        );

        return TrackResponse.from(trackRepository.save(track));
    }
}
