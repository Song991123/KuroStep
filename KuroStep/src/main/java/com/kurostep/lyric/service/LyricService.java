package com.kurostep.lyric.service;

import com.kurostep.common.exception.NotFoundException;
import com.kurostep.lyric.domain.Lyric;
import com.kurostep.lyric.domain.LyricLineRef;
import com.kurostep.lyric.domain.LyricsProviderType;
import com.kurostep.lyric.dto.LyricCreateRequest;
import com.kurostep.lyric.dto.LyricFetchResponse;
import com.kurostep.lyric.dto.LyricLineRefCreateRequest;
import com.kurostep.lyric.dto.LyricLineRefResponse;
import com.kurostep.lyric.dto.LyricResponse;
import com.kurostep.lyric.provider.LyricLineRefParser;
import com.kurostep.lyric.provider.LyricsProviderClient;
import com.kurostep.lyric.provider.LyricsProviderResult;
import com.kurostep.lyric.repository.LyricLineRefRepository;
import com.kurostep.lyric.repository.LyricRepository;
import com.kurostep.track.domain.Track;
import com.kurostep.track.repository.TrackRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class LyricService {

    private final TrackRepository trackRepository;
    private final LyricRepository lyricRepository;
    private final LyricLineRefRepository lyricLineRefRepository;
    private final LyricsProviderClient lyricsProviderClient;
    private final LyricLineRefParser lyricLineRefParser;

    public LyricService(
            TrackRepository trackRepository,
            LyricRepository lyricRepository,
            LyricLineRefRepository lyricLineRefRepository,
            LyricsProviderClient lyricsProviderClient,
            LyricLineRefParser lyricLineRefParser
    ) {
        this.trackRepository = trackRepository;
        this.lyricRepository = lyricRepository;
        this.lyricLineRefRepository = lyricLineRefRepository;
        this.lyricsProviderClient = lyricsProviderClient;
        this.lyricLineRefParser = lyricLineRefParser;
    }

    @Transactional
    public LyricResponse createLineRefs(Long trackId, LyricCreateRequest request) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));

        Lyric existingLyric = findExistingLyric(trackId, LyricsProviderType.LRCLIB, request.providerLyricsId());
        if (existingLyric != null) {
            return toResponse(existingLyric);
        }

        Lyric lyric = Lyric.create(
                track,
                LyricsProviderType.LRCLIB,
                request.providerLyricsId(),
                request.languageCode(),
                request.synced(),
                LocalDateTime.now()
        );
        Lyric savedLyric = lyricRepository.save(lyric);

        List<LyricLineRefResponse> lines = request.lines().stream()
                .map(line -> LyricLineRef.create(savedLyric, line.lineIndex(), line.startTimeMs(), line.textHash()))
                .map(lyricLineRefRepository::save)
                .map(LyricLineRefResponse::from)
                .toList();

        return LyricResponse.of(savedLyric, lines);
    }

    @Transactional
    public LyricFetchResponse fetchFromProvider(Long trackId) {
        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));

        LyricsProviderResult result = lyricsProviderClient.fetch(track);
        Lyric existingLyric = findExistingLyric(trackId, LyricsProviderType.LRCLIB, result.providerLyricsId());
        if (existingLyric != null) {
            return new LyricFetchResponse(
                    toResponse(existingLyric),
                    "lrclib-" + trackId + "-" + result.providerLyricsId(),
                    result.plainLyrics(),
                    result.syncedLyrics()
            );
        }

        List<LyricLineRefCreateRequest> lineRefs = lyricLineRefParser.parse(result.sourceText());
        if (lineRefs.isEmpty()) {
            throw new NotFoundException("저장할 수 있는 가사 라인을 찾을 수 없습니다.");
        }

        LyricResponse lyric = createLineRefs(trackId, new LyricCreateRequest(
                result.providerLyricsId(),
                result.languageCode(),
                result.synced(),
                lineRefs
        ));

        return new LyricFetchResponse(
                lyric,
                "lrclib-" + trackId + "-" + result.providerLyricsId(),
                result.plainLyrics(),
                result.syncedLyrics()
        );
    }

    public List<LyricResponse> findByTrack(Long trackId) {
        return lyricRepository.findByTrackId(trackId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public LyricResponse findOne(Long lyricId) {
        Lyric lyric = lyricRepository.findById(lyricId)
                .orElseThrow(() -> new NotFoundException("가사 묶음을 찾을 수 없습니다."));

        return toResponse(lyric);
    }

    private LyricResponse toResponse(Lyric lyric) {
        List<LyricLineRefResponse> lines = lyricLineRefRepository.findByLyricIdOrderByLineIndexAsc(lyric.getId())
                .stream()
                .map(LyricLineRefResponse::from)
                .toList();

        return LyricResponse.of(lyric, lines);
    }

    private Lyric findExistingLyric(Long trackId, LyricsProviderType provider, String providerLyricsId) {
        if (providerLyricsId != null && !providerLyricsId.isBlank()) {
            return lyricRepository
                    .findByTrackIdAndProviderAndProviderLyricsId(trackId, provider, providerLyricsId)
                    .stream()
                    .findFirst()
                    .orElse(null);
        }

        return lyricRepository.findByTrackIdAndProvider(trackId, provider).orElse(null);
    }
}
