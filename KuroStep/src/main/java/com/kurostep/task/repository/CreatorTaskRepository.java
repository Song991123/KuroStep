package com.kurostep.task.repository;

import com.kurostep.task.domain.CreatorTask;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreatorTaskRepository extends JpaRepository<CreatorTask, Long> {

    List<CreatorTask> findByUserId(Long userId);

    List<CreatorTask> findByUserIdAndTaskDate(Long userId, LocalDate taskDate);

    List<CreatorTask> findByCurrentPlaylistTrackId(Long playlistTrackId);
}
