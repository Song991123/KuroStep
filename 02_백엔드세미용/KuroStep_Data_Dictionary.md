# KuroStep Data Dictionary

## 문서 목적

이 문서는 KuroStep 데이터베이스 구현을 위한 상세 테이블 명세서이다.

보고서의 ERD는 테이블 관계를 설명하기 위한 요약이고, 실제 Entity와 DB 컬럼을 만들 때는 이 데이터 딕셔너리를 기준으로 한다.

## 공통 규칙

- PK는 `BIGINT` Auto Increment를 사용한다.
- 시간 컬럼은 `created_at`, `updated_at`을 공통으로 사용한다.
- Entity에서는 `createdAt`, `updatedAt` camelCase 필드로 작성하고, DB 컬럼명은 snake_case로 매핑한다.
- 연관관계는 기본적으로 `LAZY` 로딩을 사용한다.
- Enum은 DB에 문자열(`EnumType.STRING`)로 저장한다.
- 사용자의 소유권 검증은 `user_id` 기준으로 Service 계층에서 처리한다.

## 1. users

서비스 사용자 계정 정보.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 사용자 ID |
| email | email | VARCHAR(100) | NO | UNIQUE | 로그인 이메일 |
| password | password | VARCHAR(255) | NO |  | BCrypt 암호화 비밀번호 |
| nickname | nickname | VARCHAR(50) | NO |  | 사용자 닉네임 |
| role | role | VARCHAR(30) | NO | 기본 `ROLE_USER` | 사용자 권한 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`UserRole`

| 값 | 설명 |
|---|---|
| ROLE_USER | 일반 사용자 |

## 2. creator_tasks

사용자의 창작 작업 카드.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 작업 카드 ID |
| user_id | user | BIGINT | NO | FK users.id | 작업 소유자 |
| playlist_id | playlist | BIGINT | YES | FK playlists.id | 작업에 연결된 플레이리스트 |
| current_playlist_track_id | currentPlaylistTrack | BIGINT | YES | FK playlist_tracks.id | 현재 재생/오버레이 표시 중인 플레이리스트 곡 항목 |
| title | title | VARCHAR(100) | NO |  | 작업 제목 |
| description | description | TEXT | YES |  | 작업 설명 |
| status | status | VARCHAR(20) | NO | 기본 `TODO` | 작업 상태 |
| task_date | taskDate | DATE | NO |  | 작업 날짜 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`TaskStatus`

| 값 | 설명 |
|---|---|
| TODO | 시작 전 |
| DOING | 진행 중 |
| DONE | 완료 |

## 3. playlists

사용자가 관리하는 작업용 플레이리스트.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 플레이리스트 ID |
| user_id | user | BIGINT | NO | FK users.id | 플레이리스트 소유자 |
| name | name | VARCHAR(100) | NO |  | 플레이리스트 이름 |
| description | description | TEXT | YES |  | 플레이리스트 설명 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

## 4. playlist_tracks

플레이리스트에 담긴 곡과 표시 순서.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 플레이리스트 곡 ID |
| playlist_id | playlist | BIGINT | NO | FK playlists.id | 연결 플레이리스트 |
| track_id | track | BIGINT | NO | FK tracks.id | 연결 곡 |
| sort_order | sortOrder | INT | NO | 기본 0 | 플레이리스트 내 표시 순서 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각. 곡 추가 시각으로도 사용 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### 추천 제약

| 제약 | 설명 |
|---|---|
| UNIQUE (`playlist_id`, `track_id`) | 같은 플레이리스트에 같은 곡 중복 추가 방지 |

## 5. tracks

작업용 곡 정보와 외부 재생 소스 정보.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 곡 ID |
| title | title | VARCHAR(150) | NO |  | 곡 제목 |
| artist | artist | VARCHAR(150) | YES |  | 아티스트명 |
| album | album | VARCHAR(150) | YES |  | 앨범명 |
| source_type | sourceType | VARCHAR(30) | NO |  | 외부 소스 타입 |
| source_url | sourceUrl | VARCHAR(500) | YES |  | 원본 외부 링크 |
| source_id | sourceId | VARCHAR(150) | YES |  | 플랫폼 내부 ID. 예: YouTube video id, Spotify track id |
| duration_seconds | durationSeconds | INT | YES |  | 곡 길이. 모르면 null |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`TrackSourceType`

| 값 | 설명 |
|---|---|
| YOUTUBE | YouTube URL 또는 영상 ID 기반 재생 |
| SPOTIFY | Spotify 트랙 링크 확장 가능 |
| SOUNDCLOUD | SoundCloud 트랙 링크 확장 가능 |
| EXTERNAL_URL | 일반 외부 음악 링크 |
| LOCAL_FILE | 추후 로컬 파일 경로 확장 가능 |

### source_id 예시

| source_type | source_url | source_id |
|---|---|---|
| YOUTUBE | `https://www.youtube.com/watch?v=abc123` | `abc123` |
| SPOTIFY | `https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp` | `3n3Ppam7vgaVa1iaRUc9Lp` |

### 추천 제약

| 제약 | 설명 |
|---|---|
| UNIQUE (`source_type`, `source_id`) | 같은 외부 소스 곡 중복 등록 방지. `source_id`가 있는 경우에 적용 |

## 6. lyrics

LRCLIB Provider에서 조회한 가사 묶음의 메타데이터.

가사 원문 파일은 서버 DB에 저장하지 않고 Tauri 앱의 사용자 로컬 데이터 폴더에 JSON 파일로 저장한다. `lyrics`는 Provider 출처와 가사 묶음 자체의 메타데이터만 저장하고, 사용자별 로컬 파일 상태는 `user_lyric_caches`에서 관리한다.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 가사 묶음 ID |
| track_id | track | BIGINT | NO | FK tracks.id | 연결 곡 |
| provider | provider | VARCHAR(50) | NO |  | 가사 제공자 |
| provider_lyrics_id | providerLyricsId | VARCHAR(150) | YES |  | Provider 내부 가사 ID |
| language_code | languageCode | VARCHAR(10) | YES |  | 원문 언어 코드. 예: `en`, `ja` |
| synced | synced | BOOLEAN | NO | 기본 false | 시간값 포함 여부 |
| fetched_at | fetchedAt | DATETIME | YES |  | 외부 Provider 조회 시각 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`LyricsProviderType`

| 값 | 설명 |
|---|---|
| LRCLIB | LRCLIB 기반 가사 조회 |

## 7. user_lyric_caches

사용자별 Tauri 로컬 가사 파일 캐시 상태.

같은 `Lyric`이라도 사용자 PC마다 로컬 파일 위치와 저장 상태가 다르므로 별도 테이블로 관리한다.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 사용자 가사 캐시 ID |
| user_id | user | BIGINT | NO | FK users.id | 캐시 소유자 |
| lyric_id | lyric | BIGINT | NO | FK lyrics.id | 연결 가사 묶음 |
| cache_storage_type | cacheStorageType | VARCHAR(30) | NO | 기본 `LOCAL_FILE` | 원문 가사 저장 위치 |
| local_cache_key | localCacheKey | VARCHAR(255) | NO |  | Tauri 로컬 가사 파일 키 |
| cache_status | cacheStatus | VARCHAR(30) | NO | 기본 `PENDING_LOCAL_SAVE` | 로컬 파일 저장 상태 |
| saved_at | savedAt | DATETIME | YES |  | Tauri 로컬 파일 저장 완료 시각 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`LyricCacheStorageType`

| 값 | 설명 |
|---|---|
| LOCAL_FILE | Tauri 사용자 로컬 데이터 폴더에 원문 가사 JSON 저장 |

`LyricCacheStatus`

| 값 | 설명 |
|---|---|
| PENDING_LOCAL_SAVE | 서버 메타데이터는 생성됐지만 Tauri 로컬 파일 저장 확인 전 |
| SAVED | Tauri 로컬 파일 저장 완료 |
| MISSING | 로컬 파일이 삭제되었거나 찾을 수 없음 |
| FAILED_LOCAL_SAVE | Tauri 로컬 파일 저장 실패 |

### 추천 제약

| 제약 | 설명 |
|---|---|
| UNIQUE (`user_id`, `lyric_id`) | 사용자별 같은 가사 묶음의 로컬 캐시 중복 방지 |

## 8. lyric_line_refs

서버 DB에 저장하는 라인 단위 참조 메타데이터.

원문 가사 텍스트는 이 테이블에 저장하지 않는다. 원문은 Tauri 로컬 JSON 파일에 저장하고, 서버는 라인 순서, 시작 시간, 해시값만 저장해 번역 메모와 연결한다.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 가사 라인 참조 ID |
| lyric_id | lyric | BIGINT | NO | FK lyrics.id | 연결 가사 묶음 |
| line_index | lineIndex | INT | NO |  | 라인 순서 |
| start_time_ms | startTimeMs | INT | YES |  | 시작 시간 ms. 싱크 없는 가사는 null |
| text_hash | textHash | VARCHAR(64) | YES |  | 로컬 파일 원문 라인과 연결하기 위한 해시 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### 추천 제약

| 제약 | 설명 |
|---|---|
| UNIQUE (`lyric_id`, `line_index`) | 같은 가사 묶음 안에서 라인 순서 중복 방지 |

## 9. lyric_translations

사용자별 한국어 번역 초안과 수정 메모.

| 컬럼명 | Java 필드명 | 타입 | NULL | 제약/기본값 | 설명 |
|---|---|---|---|---|---|
| id | id | BIGINT | NO | PK, Auto Increment | 번역 메모 ID |
| lyric_line_ref_id | lyricLineRef | BIGINT | NO | FK lyric_line_refs.id | 연결 가사 라인 참조 |
| user_id | user | BIGINT | NO | FK users.id | 번역 작성자 |
| language_code | languageCode | VARCHAR(10) | NO | 기본 `ko` | 번역 언어 코드 |
| translated_text | translatedText | TEXT | NO |  | 한국어 번역문 |
| memo_text | memoText | TEXT | YES |  | 사용자가 남기는 개인 해석/작업 메모 |
| provider | provider | VARCHAR(50) | YES |  | 번역 Provider. 예: `GEMINI`, `PAPAGO`, `MANUAL` |
| status | status | VARCHAR(30) | NO | 기본 `AUTO_DRAFT` | 번역 상태 |
| created_at | createdAt | DATETIME | NO |  | 생성 시각 |
| updated_at | updatedAt | DATETIME | NO |  | 수정 시각 |

### Enum

`TranslationProviderType`

| 값 | 설명 |
|---|---|
| GEMINI | Gemini 기반 자동 번역 |
| PAPAGO | Papago 기반 자동 번역 확장 가능 |
| MANUAL | 사용자가 직접 입력 |

`TranslationStatus`

| 값 | 설명 |
|---|---|
| AUTO_DRAFT | 자동 번역 초안 |
| EDITED | 사용자가 수정한 번역 |

### 추천 제약

| 제약 | 설명 |
|---|---|
| UNIQUE (`lyric_line_ref_id`, `user_id`, `language_code`) | 같은 사용자가 같은 라인에 같은 언어 번역을 중복 저장하지 않도록 제한 |

## 구현 순서 메모

1. `User`, `UserRole`, `UserRepository`
2. `Playlist`, `PlaylistTrack`, `PlaylistRepository`, `PlaylistTrackRepository`
3. `Track`, `TrackSourceType`, `TrackRepository`
4. `CreatorTask`, `TaskStatus`, `CreatorTaskRepository`
5. `Lyric`, `LyricLineRef`, `UserLyricCache`, `LyricsProviderType`, `LyricCacheStorageType`, `LyricCacheStatus`, `LyricRepository`, `LyricLineRefRepository`, `UserLyricCacheRepository`
6. `LyricTranslation`, `TranslationStatus`, `TranslationProviderType`, `LyricTranslationRepository`
