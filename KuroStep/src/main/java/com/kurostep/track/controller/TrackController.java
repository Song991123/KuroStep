package com.kurostep.track.controller;

import com.kurostep.track.dto.TrackCreateRequest;
import com.kurostep.track.dto.TrackResponse;
import com.kurostep.track.dto.YouTubePlaylistImportRequest;
import com.kurostep.track.dto.YouTubePlaylistImportResponse;
import com.kurostep.track.service.TrackService;
import com.kurostep.track.service.YouTubePlaylistImportService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tracks")
public class TrackController {

    private final TrackService trackService;
    private final YouTubePlaylistImportService youTubePlaylistImportService;

    public TrackController(TrackService trackService, YouTubePlaylistImportService youTubePlaylistImportService) {
        this.trackService = trackService;
        this.youTubePlaylistImportService = youTubePlaylistImportService;
    }

    @PostMapping
    public TrackResponse create(@Valid @RequestBody TrackCreateRequest request) {
        return trackService.create(request);
    }

    @GetMapping("/search")
    public List<TrackResponse> search(@RequestParam String keyword) {
        return trackService.search(keyword);
    }

    @PostMapping("/youtube-playlist/preview")
    public YouTubePlaylistImportResponse previewYouTubePlaylist(@Valid @RequestBody YouTubePlaylistImportRequest request) {
        return youTubePlaylistImportService.preview(request.playlistUrl());
    }

    @GetMapping("/{trackId}")
    public TrackResponse findOne(@PathVariable Long trackId) {
        return trackService.findOne(trackId);
    }
}
