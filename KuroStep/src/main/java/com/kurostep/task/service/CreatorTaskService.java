package com.kurostep.task.service;

import com.kurostep.common.exception.ForbiddenException;
import com.kurostep.common.exception.NotFoundException;
import com.kurostep.playlist.domain.Playlist;
import com.kurostep.playlist.domain.PlaylistTrack;
import com.kurostep.playlist.repository.PlaylistRepository;
import com.kurostep.playlist.repository.PlaylistTrackRepository;
import com.kurostep.task.domain.CreatorTask;
import com.kurostep.task.dto.CreatorTaskCreateRequest;
import com.kurostep.task.dto.CreatorTaskResponse;
import com.kurostep.task.dto.CreatorTaskStatusUpdateRequest;
import com.kurostep.task.dto.CreatorTaskUpdateRequest;
import com.kurostep.task.repository.CreatorTaskRepository;
import com.kurostep.user.domain.User;
import com.kurostep.user.repository.UserRepository;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CreatorTaskService {

    private final CreatorTaskRepository creatorTaskRepository;
    private final UserRepository userRepository;
    private final PlaylistRepository playlistRepository;
    private final PlaylistTrackRepository playlistTrackRepository;

    public CreatorTaskService(
            CreatorTaskRepository creatorTaskRepository,
            UserRepository userRepository,
            PlaylistRepository playlistRepository,
            PlaylistTrackRepository playlistTrackRepository
    ) {
        this.creatorTaskRepository = creatorTaskRepository;
        this.userRepository = userRepository;
        this.playlistRepository = playlistRepository;
        this.playlistTrackRepository = playlistTrackRepository;
    }

    @Transactional
    public CreatorTaskResponse create(Long userId, CreatorTaskCreateRequest request) {
        User user = getUser(userId);
        CreatorTask task = CreatorTask.create(user, request.title(), request.description(), request.taskDate());

        return CreatorTaskResponse.from(creatorTaskRepository.save(task));
    }

    public List<CreatorTaskResponse> findToday(Long userId) {
        return findByDate(userId, LocalDate.now());
    }

    public List<CreatorTaskResponse> findByDate(Long userId, LocalDate taskDate) {
        return creatorTaskRepository.findByUserIdAndTaskDate(userId, taskDate)
                .stream()
                .map(CreatorTaskResponse::from)
                .toList();
    }

    public CreatorTaskResponse findOne(Long userId, Long taskId) {
        CreatorTask task = getOwnedTask(userId, taskId);

        return CreatorTaskResponse.from(task);
    }

    @Transactional
    public CreatorTaskResponse update(Long userId, Long taskId, CreatorTaskUpdateRequest request) {
        CreatorTask task = getOwnedTask(userId, taskId);
        task.update(request.title(), request.description(), request.taskDate());

        return CreatorTaskResponse.from(task);
    }

    @Transactional
    public CreatorTaskResponse changeStatus(Long userId, Long taskId, CreatorTaskStatusUpdateRequest request) {
        CreatorTask task = getOwnedTask(userId, taskId);
        task.changeStatus(request.status());

        return CreatorTaskResponse.from(task);
    }

    @Transactional
    public void delete(Long userId, Long taskId) {
        CreatorTask task = getOwnedTask(userId, taskId);
        creatorTaskRepository.delete(task);
    }

    @Transactional
    public CreatorTaskResponse connectPlaylist(Long userId, Long taskId, Long playlistId) {
        CreatorTask task = getOwnedTask(userId, taskId);
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new NotFoundException("플레이리스트를 찾을 수 없습니다."));

        if (!playlist.getUser().getId().equals(userId)) {
            throw new ForbiddenException("플레이리스트 접근 권한이 없습니다.");
        }

        task.connectPlaylist(playlist);

        return CreatorTaskResponse.from(task);
    }

    @Transactional
    public CreatorTaskResponse changeCurrentPlaylistTrack(Long userId, Long taskId, Long playlistTrackId) {
        CreatorTask task = getOwnedTask(userId, taskId);
        PlaylistTrack playlistTrack = playlistTrackRepository.findById(playlistTrackId)
                .orElseThrow(() -> new NotFoundException("플레이리스트 곡 항목을 찾을 수 없습니다."));

        if (task.getPlaylist() == null || !playlistTrack.getPlaylist().getId().equals(task.getPlaylist().getId())) {
            throw new IllegalArgumentException("작업에 연결된 플레이리스트의 곡만 현재 곡으로 설정할 수 있습니다.");
        }

        task.changeCurrentPlaylistTrack(playlistTrack);

        return CreatorTaskResponse.from(task);
    }

    private User getUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("사용자를 찾을 수 없습니다."));
    }

    private CreatorTask getOwnedTask(Long userId, Long taskId) {
        CreatorTask task = creatorTaskRepository.findById(taskId)
                .orElseThrow(() -> new NotFoundException("작업 카드를 찾을 수 없습니다."));

        if (!task.getUser().getId().equals(userId)) {
            throw new ForbiddenException("작업 카드 접근 권한이 없습니다.");
        }

        return task;
    }
}
