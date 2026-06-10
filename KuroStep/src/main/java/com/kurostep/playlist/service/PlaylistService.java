package com.kurostep.playlist.service;

import com.kurostep.common.exception.ConflictException;
import com.kurostep.common.exception.ForbiddenException;
import com.kurostep.common.exception.NotFoundException;
import com.kurostep.playlist.domain.Playlist;
import com.kurostep.playlist.domain.PlaylistTrack;
import com.kurostep.playlist.dto.PlaylistCreateRequest;
import com.kurostep.playlist.dto.PlaylistResponse;
import com.kurostep.playlist.dto.PlaylistTrackResponse;
import com.kurostep.playlist.dto.PlaylistUpdateRequest;
import com.kurostep.playlist.repository.PlaylistRepository;
import com.kurostep.playlist.repository.PlaylistTrackRepository;
import com.kurostep.track.domain.Track;
import com.kurostep.track.repository.TrackRepository;
import com.kurostep.user.domain.User;
import com.kurostep.user.repository.UserRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PlaylistService {

    private final PlaylistRepository playlistRepository;
    private final PlaylistTrackRepository playlistTrackRepository;
    private final TrackRepository trackRepository;
    private final UserRepository userRepository;

    public PlaylistService(
            PlaylistRepository playlistRepository,
            PlaylistTrackRepository playlistTrackRepository,
            TrackRepository trackRepository,
            UserRepository userRepository
    ) {
        this.playlistRepository = playlistRepository;
        this.playlistTrackRepository = playlistTrackRepository;
        this.trackRepository = trackRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public PlaylistResponse create(Long userId, PlaylistCreateRequest request) {
        User user = getUser(userId);
        Playlist playlist = Playlist.create(user, request.name(), request.description());

        return PlaylistResponse.from(playlistRepository.save(playlist));
    }

    public List<PlaylistResponse> findAll(Long userId) {
        return playlistRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(PlaylistResponse::from)
                .toList();
    }

    public PlaylistResponse findOne(Long userId, Long playlistId) {
        Playlist playlist = getOwnedPlaylist(userId, playlistId);

        return PlaylistResponse.from(playlist);
    }

    @Transactional
    public PlaylistResponse update(Long userId, Long playlistId, PlaylistUpdateRequest request) {
        Playlist playlist = getOwnedPlaylist(userId, playlistId);
        playlist.update(request.name(), request.description());

        return PlaylistResponse.from(playlist);
    }

    @Transactional
    public void delete(Long userId, Long playlistId) {
        Playlist playlist = getOwnedPlaylist(userId, playlistId);
        playlistRepository.delete(playlist);
    }

    @Transactional
    public PlaylistTrackResponse addTrack(Long userId, Long playlistId, Long trackId) {
        Playlist playlist = getOwnedPlaylist(userId, playlistId);
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));

        if (playlistTrackRepository.existsByPlaylistIdAndTrackId(playlistId, trackId)) {
            throw new ConflictException("이미 플레이리스트에 추가된 곡입니다.");
        }

        int sortOrder = playlistTrackRepository.findTopByPlaylistIdOrderBySortOrderDesc(playlistId)
                .map(playlistTrack -> playlistTrack.getSortOrder() + 1)
                .orElse(0);

        PlaylistTrack playlistTrack = PlaylistTrack.create(playlist, track, sortOrder);

        return PlaylistTrackResponse.from(playlistTrackRepository.save(playlistTrack));
    }

    public List<PlaylistTrackResponse> findTracks(Long userId, Long playlistId) {
        getOwnedPlaylist(userId, playlistId);

        return playlistTrackRepository.findByPlaylistIdOrderBySortOrderAsc(playlistId)
                .stream()
                .map(PlaylistTrackResponse::from)
                .toList();
    }

    @Transactional
    public void removeTrack(Long userId, Long playlistId, Long trackId) {
        getOwnedPlaylist(userId, playlistId);

        PlaylistTrack playlistTrack = playlistTrackRepository.findByPlaylistIdAndTrackId(playlistId, trackId)
                .orElseThrow(() -> new NotFoundException("플레이리스트에 해당 곡이 없습니다."));

        playlistTrackRepository.delete(playlistTrack);
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다."));
    }

    private Playlist getOwnedPlaylist(Long userId, Long playlistId) {
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new NotFoundException("플레이리스트를 찾을 수 없습니다."));

        if (!playlist.getUser().getId().equals(userId)) {
            throw new ForbiddenException("플레이리스트 접근 권한이 없습니다.");
        }

        return playlist;
    }
}
