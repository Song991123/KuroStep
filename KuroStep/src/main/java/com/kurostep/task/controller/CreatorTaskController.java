package com.kurostep.task.controller;

import com.kurostep.task.dto.CreatorTaskCreateRequest;
import com.kurostep.task.dto.CreatorTaskResponse;
import com.kurostep.task.dto.CreatorTaskStatusUpdateRequest;
import com.kurostep.task.dto.CreatorTaskUpdateRequest;
import com.kurostep.task.service.CreatorTaskService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
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
@RequestMapping("/api/tasks")
public class CreatorTaskController {

    private final CreatorTaskService creatorTaskService;

    public CreatorTaskController(CreatorTaskService creatorTaskService) {
        this.creatorTaskService = creatorTaskService;
    }

    @PostMapping
    public CreatorTaskResponse create(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @Valid @RequestBody CreatorTaskCreateRequest request
    ) {
        return creatorTaskService.create(userId, request);
    }

    @GetMapping("/today")
    public List<CreatorTaskResponse> findToday(
            @RequestParam Long userId // TODO: JWT 적용 후 로그인 사용자 ID로 교체
    ) {
        return creatorTaskService.findToday(userId);
    }

    @GetMapping
    public List<CreatorTaskResponse> findByDate(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return creatorTaskService.findByDate(userId, date);
    }

    @GetMapping("/{taskId}")
    public CreatorTaskResponse findOne(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId
    ) {
        return creatorTaskService.findOne(userId, taskId);
    }

    @PatchMapping("/{taskId}")
    public CreatorTaskResponse update(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId,
            @Valid @RequestBody CreatorTaskUpdateRequest request
    ) {
        return creatorTaskService.update(userId, taskId, request);
    }

    @PatchMapping("/{taskId}/status")
    public CreatorTaskResponse changeStatus(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId,
            @Valid @RequestBody CreatorTaskStatusUpdateRequest request
    ) {
        return creatorTaskService.changeStatus(userId, taskId, request);
    }

    @DeleteMapping("/{taskId}")
    public void delete(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId
    ) {
        creatorTaskService.delete(userId, taskId);
    }

    @PatchMapping("/{taskId}/playlist/{playlistId}")
    public CreatorTaskResponse connectPlaylist(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId,
            @PathVariable Long playlistId
    ) {
        return creatorTaskService.connectPlaylist(userId, taskId, playlistId);
    }

    @PatchMapping("/{taskId}/current-playlist-track/{playlistTrackId}")
    public CreatorTaskResponse changeCurrentPlaylistTrack(
            @RequestParam Long userId, // TODO: JWT 적용 후 로그인 사용자 ID로 교체
            @PathVariable Long taskId,
            @PathVariable Long playlistTrackId
    ) {
        return creatorTaskService.changeCurrentPlaylistTrack(userId, taskId, playlistTrackId);
    }
}
