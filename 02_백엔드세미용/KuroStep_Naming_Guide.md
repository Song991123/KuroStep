# KuroStep Naming Guide

## 문서 목적

이 문서는 KuroStep 구현 중 Java 필드명, DB 컬럼명, 클래스명, API 이름이 서로 헷갈리지 않도록 정리한 네이밍 컨벤션 문서이다.

보통 이런 문서는 **네이밍 컨벤션**, **용어 사전**, **필드 매핑표**, **명명 규칙표**라고 부른다.

## 기본 규칙

| 구분 | 규칙 | 예시 |
|---|---|---|
| Java 클래스 | PascalCase | `CreatorTask`, `PlaylistTrack` |
| Java 필드 | camelCase | `sourceType`, `createdAt` |
| DB 테이블 | snake_case 복수형 | `creator_tasks`, `playlist_tracks` |
| DB 컬럼 | snake_case | `source_type`, `created_at` |
| Enum 클래스 | PascalCase | `TaskStatus`, `TrackSourceType` |
| Enum 값 | UPPER_SNAKE_CASE | `ROLE_USER`, `PENDING_LOCAL_SAVE` |
| Repository | Entity명 + Repository | `UserRepository` |
| Service | 도메인명 + Service | `TrackService` |
| Controller | 도메인명 + Controller | `TrackController` |
| DTO 요청 | 동사/목적 + Request | `TrackCreateRequest` |
| DTO 응답 | 동사/목적 + Response | `TrackResponse` |

## Entity 클래스명

| 테이블 | Entity 클래스 | 설명 |
|---|---|---|
| `users` | `User` | 사용자 |
| `creator_tasks` | `CreatorTask` | 작업 카드 |
| `playlists` | `Playlist` | 작업용 플레이리스트 |
| `playlist_tracks` | `PlaylistTrack` | 플레이리스트 곡 연결 |
| `tracks` | `Track` | 곡 |
| `lyrics` | `Lyric` | 가사 묶음 메타데이터 |
| `user_lyric_caches` | `UserLyricCache` | 사용자별 로컬 가사 캐시 |
| `lyric_line_refs` | `LyricLineRef` | 가사 라인 참조 |
| `lyric_translations` | `LyricTranslation` | 번역/메모 |

## 주요 필드 매핑

### 공통 시간 필드

| Java 필드 | DB 컬럼 | 타입 |
|---|---|---|
| `createdAt` | `created_at` | `LocalDateTime` |
| `updatedAt` | `updated_at` | `LocalDateTime` |

### Track

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `id` | `id` | PK |
| `title` | `title` | 필수 |
| `artist` | `artist` | 선택 |
| `album` | `album` | 선택 |
| `sourceType` | `source_type` | Enum `TrackSourceType` |
| `sourceUrl` | `source_url` | 원본 외부 링크 |
| `sourceId` | `source_id` | YouTube video id 등 |
| `durationSeconds` | `duration_seconds` | 초 단위 |

잘못 쓰기 쉬운 이름:

| 잘못된 이름 | 올바른 이름 |
|---|---|
| `source_type` | `sourceType` |
| `source_url` | `sourceUrl` |
| `external_source_id` | `sourceId` |
| `duration_secondes` | `durationSeconds` |

### CreatorTask

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `user` | `user_id` | `User` 연관관계 |
| `playlist` | `playlist_id` | `Playlist` 연관관계, nullable |
| `currentPlaylistTrack` | `current_playlist_track_id` | `PlaylistTrack` 연관관계, 현재 재생 플레이리스트 항목, nullable |
| `title` | `title` | 필수 |
| `description` | `description` | 선택 |
| `status` | `status` | Enum `TaskStatus` |
| `taskDate` | `task_date` | `LocalDate` |

### Lyric

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `track` | `track_id` | `Track` 연관관계 |
| `provider` | `provider` | Enum `LyricsProviderType` |
| `providerLyricsId` | `provider_lyrics_id` | LRCLIB 내부 ID |
| `languageCode` | `language_code` | 예: `en`, `ja` |
| `synced` | `synced` | 시간값 여부 |
| `fetchedAt` | `fetched_at` | 외부 조회 시각 |

### UserLyricCache

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `user` | `user_id` | 캐시 소유자 |
| `lyric` | `lyric_id` | 연결 가사 묶음 |
| `cacheStorageType` | `cache_storage_type` | Enum `LyricCacheStorageType` |
| `localCacheKey` | `local_cache_key` | Tauri 로컬 파일 키 |
| `cacheStatus` | `cache_status` | Enum `LyricCacheStatus` |
| `savedAt` | `saved_at` | 로컬 저장 완료 시각 |

### LyricLineRef

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `lyric` | `lyric_id` | `Lyric` 연관관계 |
| `lineIndex` | `line_index` | 라인 순서 |
| `startTimeMs` | `start_time_ms` | 싱크 없는 가사는 nullable |
| `textHash` | `text_hash` | 원문 텍스트 저장 아님 |

### LyricTranslation

| Java 필드 | DB 컬럼 | 주의 |
|---|---|---|
| `lyricLineRef` | `lyric_line_ref_id` | `LyricLineRef` 연관관계 |
| `user` | `user_id` | 번역 작성자 |
| `languageCode` | `language_code` | 기본 `ko` |
| `translatedText` | `translated_text` | 번역문 |
| `memoText` | `memo_text` | 개인 메모 |
| `provider` | `provider` | Enum `TranslationProviderType` |
| `status` | `status` | Enum `TranslationStatus` |

## 구현 시 체크리스트

- Entity 클래스에는 `@Entity`를 붙인다.
- Java 필드는 camelCase로 쓴다.
- DB 컬럼명이 Java 필드명과 다르면 `@Column(name = "...")`을 쓴다.
- FK 컬럼은 직접 `Long userId`보다 `User user` 같은 연관관계로 잡는다.
- Enum은 `@Enumerated(EnumType.STRING)`을 붙인다.
- Entity에는 기본 생성자를 `protected`로 둔다.
- 외부에서 필드를 아무렇게나 바꾸지 않도록 `@Setter`는 기본적으로 쓰지 않는다.
- 생성/수정은 정적 팩토리 메서드와 도메인 메서드로 처리한다.
