# KuroStep Class Diagram

## 문서 목적

이 문서는 KuroStep의 주요 JPA Entity, Enum, Repository 관계를 구현 전에 확인하기 위한 클래스 다이어그램 문서이다.

실제 구현 시 상세 컬럼 제약은 `KuroStep_Data_Dictionary.md`, 변수명은 `KuroStep_Naming_Guide.md`를 기준으로 한다.

## Entity Class Diagram

```mermaid
classDiagram
    class BaseTimeEntity {
        <<abstract>>
        -LocalDateTime createdAt
        -LocalDateTime updatedAt
    }

    class User {
        -Long id
        -String email
        -String password
        -String nickname
        -UserRole role
        +create(email, encodedPassword, nickname) User
    }

    class CreatorTask {
        -Long id
        -User user
        -Playlist playlist
        -PlaylistTrack currentPlaylistTrack
        -String title
        -String description
        -TaskStatus status
        -LocalDate taskDate
        +create(user, title, description, taskDate) CreatorTask
        +update(title, description, taskDate) void
        +changeStatus(status) void
        +connectPlaylist(playlist) void
        +changeCurrentPlaylistTrack(playlistTrack) void
    }

    class Playlist {
        -Long id
        -User user
        -String name
        -String description
        +create(user, name, description) Playlist
        +update(name, description) void
    }

    class PlaylistTrack {
        -Long id
        -Playlist playlist
        -Track track
        -Integer sortOrder
        +create(playlist, track, sortOrder) PlaylistTrack
        +changeSortOrder(sortOrder) void
    }

    class Track {
        -Long id
        -String title
        -String artist
        -String album
        -TrackSourceType sourceType
        -String sourceUrl
        -String sourceId
        -Integer durationSeconds
        +create(title, artist, album, sourceType, sourceUrl, sourceId, durationSeconds) Track
    }

    class Lyric {
        -Long id
        -Track track
        -LyricsProviderType provider
        -String providerLyricsId
        -String languageCode
        -Boolean synced
        -LocalDateTime fetchedAt
        +create(track, provider, providerLyricsId, languageCode, synced, fetchedAt) Lyric
    }

    class UserLyricCache {
        -Long id
        -User user
        -Lyric lyric
        -LyricCacheStorageType cacheStorageType
        -String localCacheKey
        -LyricCacheStatus cacheStatus
        -LocalDateTime savedAt
        +create(user, lyric, localCacheKey) UserLyricCache
        +markSaved(savedAt) void
        +markMissing() void
        +markFailed() void
    }

    class LyricLineRef {
        -Long id
        -Lyric lyric
        -Integer lineIndex
        -Integer startTimeMs
        -String textHash
        +create(lyric, lineIndex, startTimeMs, textHash) LyricLineRef
    }

    class LyricTranslation {
        -Long id
        -LyricLineRef lyricLineRef
        -User user
        -String languageCode
        -String translatedText
        -String memoText
        -TranslationProviderType provider
        -TranslationStatus status
        +createDraft(lyricLineRef, user, languageCode, translatedText, provider) LyricTranslation
        +edit(translatedText, memoText) void
    }

    class UserRole {
        <<enumeration>>
        ROLE_USER
    }

    class TaskStatus {
        <<enumeration>>
        TODO
        DOING
        DONE
    }

    class TrackSourceType {
        <<enumeration>>
        YOUTUBE
        SPOTIFY
        SOUNDCLOUD
        EXTERNAL_URL
        LOCAL_FILE
    }

    class LyricsProviderType {
        <<enumeration>>
        LRCLIB
    }

    class LyricCacheStorageType {
        <<enumeration>>
        LOCAL_FILE
    }

    class LyricCacheStatus {
        <<enumeration>>
        PENDING_LOCAL_SAVE
        SAVED
        MISSING
        FAILED_LOCAL_SAVE
    }

    class TranslationProviderType {
        <<enumeration>>
        GEMINI
        PAPAGO
        MANUAL
    }

    class TranslationStatus {
        <<enumeration>>
        AUTO_DRAFT
        EDITED
    }

    BaseTimeEntity <|-- User
    BaseTimeEntity <|-- CreatorTask
    BaseTimeEntity <|-- Playlist
    BaseTimeEntity <|-- PlaylistTrack
    BaseTimeEntity <|-- Track
    BaseTimeEntity <|-- Lyric
    BaseTimeEntity <|-- UserLyricCache
    BaseTimeEntity <|-- LyricLineRef
    BaseTimeEntity <|-- LyricTranslation

    User --> UserRole
    CreatorTask --> TaskStatus
    Track --> TrackSourceType
    Lyric --> LyricsProviderType
    UserLyricCache --> LyricCacheStorageType
    UserLyricCache --> LyricCacheStatus
    LyricTranslation --> TranslationProviderType
    LyricTranslation --> TranslationStatus

    User "1" --> "0..*" CreatorTask
    User "1" --> "0..*" Playlist
    User "1" --> "0..*" UserLyricCache
    User "1" --> "0..*" LyricTranslation

    Playlist "1" --> "0..*" PlaylistTrack
    Playlist "1" --> "0..*" CreatorTask
    PlaylistTrack "0..*" --> "1" Track
    Track "1" --> "0..*" Lyric
    PlaylistTrack "1" --> "0..*" CreatorTask : currentPlaylistTrack

    Lyric "1" --> "0..*" LyricLineRef
    Lyric "1" --> "0..*" UserLyricCache
    LyricLineRef "1" --> "0..*" LyricTranslation
```

## Repository 목록

| Entity | Repository | 주요 메서드 |
|---|---|---|
| `User` | `UserRepository` | `findByEmail`, `existsByEmail` |
| `CreatorTask` | `CreatorTaskRepository` | `findByUserId`, `findByUserIdAndTaskDate` |
| `Playlist` | `PlaylistRepository` | `findByUserIdOrderByCreatedAtDesc` |
| `PlaylistTrack` | `PlaylistTrackRepository` | `findByPlaylistIdOrderBySortOrderAsc`, `existsByPlaylistIdAndTrackId` |
| `Track` | `TrackRepository` | `findByTitleContainingOrArtistContaining`, `findBySourceTypeAndSourceId` |
| `Lyric` | `LyricRepository` | `findByTrackId`, `findByTrackIdAndProvider` |
| `UserLyricCache` | `UserLyricCacheRepository` | `findByUserIdAndLyricId` |
| `LyricLineRef` | `LyricLineRefRepository` | `findByLyricIdOrderByLineIndexAsc` |
| `LyricTranslation` | `LyricTranslationRepository` | `findByLyricLineRefIdAndUserId`, `findByUserIdAndLyricLineRefIdAndLanguageCode` |

## 구현 순서

1. `BaseTimeEntity`
2. `User`, `UserRole`, `UserRepository`
3. `Track`, `TrackSourceType`, `TrackRepository`
4. `Playlist`, `PlaylistTrack`, Repository 2개
5. `CreatorTask`, `TaskStatus`, `CreatorTaskRepository`
6. `Lyric`, `LyricLineRef`, `UserLyricCache`, 관련 Enum과 Repository
7. `LyricTranslation`, 번역 관련 Enum과 Repository

## 구현 주의사항

- Entity 필드명은 Java camelCase로 작성한다.
- DB 컬럼명은 snake_case로 매핑한다.
- 양방향 연관관계는 초반에는 만들지 않는다. 단방향 ManyToOne 중심으로 시작한다.
- `@Setter`는 기본적으로 사용하지 않는다.
- 값 변경은 `update`, `changeStatus`, `connectPlaylist` 같은 도메인 메서드로 처리한다.
- 같은 사용자/라인/언어의 번역은 중복 생성하지 않고 수정 또는 upsert 방식으로 처리한다.
