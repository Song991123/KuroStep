package com.kurostep.playlist.controller;

import com.kurostep.playlist.dto.PlaylistCreateRequest;
import com.kurostep.playlist.dto.PlaylistResponse;
import com.kurostep.playlist.dto.PlaylistTrackResponse;
import com.kurostep.playlist.dto.PlaylistUpdateRequest;
import com.kurostep.playlist.service.PlaylistService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/playlists")
public class PlaylistController {

    private final PlaylistService playlistService;

    public PlaylistController(PlaylistService playlistService) {
        this.playlistService = playlistService;
    }

    @PostMapping
    public PlaylistResponse create(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @Valid @RequestBody PlaylistCreateRequest request
    ) {
        return playlistService.create(userId, request);
    }

    @GetMapping
    public List<PlaylistResponse> findAll(
            @RequestParam Long userId // TODO: JWT 적용 후 로그인 사용자 ID로 교체
    ) {
        return playlistService.findAll(userId);
    }

    @GetMapping("/{playlistId}")
    public PlaylistResponse findOne(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId
    ) {
        return playlistService.findOne(userId, playlistId);
    }

    @PatchMapping("/{playlistId}")
    public PlaylistResponse update(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId,
            @Valid @RequestBody PlaylistUpdateRequest request
    ) {
        return playlistService.update(userId, playlistId, request);
    }

    @DeleteMapping("/{playlistId}")
    public void delete(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId
    ) {
        playlistService.delete(userId, playlistId);
    }

    @PostMapping("/{playlistId}/tracks/{trackId}")
    public PlaylistTrackResponse addTrack(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId,
            @PathVariable Long trackId
    ) {
        return playlistService.addTrack(userId, playlistId, trackId);
    }

    @GetMapping("/{playlistId}/tracks")
    public List<PlaylistTrackResponse> findTracks(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId
    ) {
        return playlistService.findTracks(userId, playlistId);
    }

    @DeleteMapping("/{playlistId}/tracks/{trackId}")
    public void removeTrack(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long playlistId,
            @PathVariable Long trackId
    ) {
        playlistService.removeTrack(userId, playlistId, trackId);
    }
}
