# KuroStep Normalization Review

## 문서 목적

이 문서는 KuroStep ERD와 데이터 딕셔너리를 정규화 관점과 실무 반정규화 관점에서 검토한 기록이다.

## 1. 정규화 검토 요약

| 영역 | 판단 | 조치 |
|---|---|---|
| 1정규형 | 만족 | 컬럼 값은 원자값으로 구성되어 있음 |
| 2정규형 | 대체로 만족 | 복합 PK를 쓰지 않고 surrogate key를 사용하므로 부분 함수 종속 위험이 낮음 |
| 3정규형 | 일부 보완 필요 | `creator_tasks.current_track_id`는 `playlist_tracks`를 우회하므로 `current_playlist_track_id`로 변경 |
| 실무 반정규화 | 일부 허용 | `tracks.source_url`, `tracks.source_id`, `lyric_line_refs.text_hash`, `user_lyric_caches.local_cache_key`는 조회/연동 편의를 위해 유지 |

## 2. 테이블별 검토

### users

정규화 관점:

- 사용자 계정 정보만 가진다.
- email, password, nickname, role은 모두 사용자 id에 직접 종속된다.
- 3정규형까지 문제 없다.

실무 보완:

- `email`은 UNIQUE가 필요하다.

### creator_tasks

기존 문제:

- 기존 구조는 `playlist_id`와 `current_track_id`를 함께 가지고 있었다.
- 이 경우 현재 곡이 연결 플레이리스트 안에 없는 곡이어도 저장될 수 있다.
- 즉, 작업 카드의 현재 곡이 플레이리스트 맥락을 우회할 수 있다.

수정 방향:

```text
current_track_id
→ current_playlist_track_id
```

수정 후 의미:

- 작업 카드는 플레이리스트를 연결한다.
- 현재 재생 곡은 해당 플레이리스트 안의 특정 항목인 `PlaylistTrack`을 참조한다.
- 실제 곡 정보는 `currentPlaylistTrack.track`을 통해 접근한다.

결론:

- 정규화와 도메인 의미 모두에서 `current_playlist_track_id`가 더 적절하다.

### playlists

정규화 관점:

- 사용자별 플레이리스트 정보만 가진다.
- `user_id`, `name`, `description` 구조는 적절하다.

실무 보완:

- 같은 사용자가 같은 이름의 플레이리스트를 여러 개 만들 수 있게 할지 정책이 필요하다.
- MVP에서는 중복 이름 허용이 더 단순하다.

### playlist_tracks

정규화 관점:

- 플레이리스트와 곡의 N:M 관계를 해소하는 연결 테이블이다.
- `sort_order`는 연결 관계의 속성이므로 이 테이블에 있는 것이 맞다.

검토 사항:

- `added_at`은 `created_at`과 의미가 겹친다.
- 정규화와 단순성을 위해 MVP에서는 `added_at`을 제거하고 `created_at`을 곡 추가 시각으로 사용한다.

실무 보완:

- `UNIQUE (playlist_id, track_id)`로 같은 플레이리스트 안의 곡 중복을 방지한다.
- 정렬은 `sort_order`, `id` 순으로 조회한다.
- `UNIQUE (playlist_id, sort_order)`는 재정렬 구현을 어렵게 만들 수 있으므로 MVP에서는 강제하지 않는다.

### tracks

정규화 관점:

- 곡 메타데이터와 외부 소스 정보를 함께 가진다.
- `source_id`는 `source_url`에서 추출 가능한 경우가 있으므로 엄밀히 보면 중복 데이터다.

실무 반정규화로 유지하는 이유:

- YouTube iframe, 외부 API, 중복 확인에는 `source_id`가 편하다.
- 사용자가 입력한 원본 링크 보존을 위해 `source_url`도 필요하다.

권장 제약:

- `source_id`가 있는 경우 `UNIQUE (source_type, source_id)`를 적용한다.

### lyrics

정규화 관점:

- 트랙에 대한 LRCLIB 가사 묶음의 메타데이터만 저장한다.
- 원문 가사 전문은 저장하지 않으므로 책임이 명확하다.

권장 제약:

- `provider_lyrics_id`가 있으면 `UNIQUE (provider, provider_lyrics_id)`를 고려한다.
- Provider ID가 없을 수 있으므로 구현에서는 중복 조회 방지 로직을 Service 계층에도 둔다.

### user_lyric_caches

정규화 관점:

- 사용자별 로컬 파일 상태는 사용자마다 다르므로 `lyrics`에서 분리하는 것이 맞다.
- `user_id + lyric_id`에 대해 하나의 로컬 캐시 상태를 가진다.

실무 반정규화:

- `local_cache_key`는 규칙으로 계산할 수도 있지만, Tauri 파일 저장 위치와 키를 안정적으로 관리하기 위해 저장한다.

권장 제약:

- `UNIQUE (user_id, lyric_id)`

### lyric_line_refs

정규화 관점:

- 원문 텍스트는 서버 DB에 저장하지 않고 라인 순서, 시작 시간, 해시만 저장한다.
- `text_hash`는 로컬 원문 파일과 서버 번역 메모 연결을 돕는 메타데이터다.

권장 제약:

- `UNIQUE (lyric_id, line_index)`

### lyric_translations

정규화 관점:

- 사용자별 번역문과 개인 메모는 사용자 데이터다.
- `translated_text`, `memo_text`, `provider`, `status` 모두 특정 사용자와 특정 라인 참조에 종속된다.

권장 제약:

- `UNIQUE (lyric_line_ref_id, user_id, language_code)`

## 3. 실무 반정규화로 유지하는 항목

| 항목 | 정규화 관점 | 유지 이유 |
|---|---|---|
| `tracks.source_url` + `tracks.source_id` | source_id가 URL에서 파생될 수 있음 | 원본 URL 보존과 API 연동 편의 |
| `lyric_line_refs.text_hash` | 로컬 원문에서 파생된 값 | 서버 번역 메모와 로컬 원문 라인 검증 |
| `user_lyric_caches.local_cache_key` | 규칙 기반 생성 가능 | Tauri 파일 위치와 상태 추적 |
| `creator_tasks.current_playlist_track_id` | 현재 재생 상태 성격 | 오버레이가 현재 곡을 빠르게 찾기 위한 실무 상태값 |

## 4. 최종 조정 사항

반영할 변경:

1. `creator_tasks.current_track_id`를 `current_playlist_track_id`로 변경한다.
2. `PlaylistTrack`을 현재 재생 곡 참조의 기준으로 사용한다.
3. `playlist_tracks.added_at`을 제거하고 `created_at`을 추가 시각으로 사용한다.
4. `tracks`에는 `source_type`, `source_url`, `source_id`를 유지하되 `UNIQUE (source_type, source_id)`를 권장한다.
5. `user_lyric_caches`는 사용자별 로컬 파일 상태 테이블로 유지한다.

## 5. 결론

현재 KuroStep ERD는 3정규형을 크게 벗어나지 않는다.

다만 실사용 흐름을 고려하면 `current_track_id`보다 `current_playlist_track_id`가 더 정확하다. 이 변경을 반영하면 작업 카드, 플레이리스트, 현재 재생 곡의 관계가 더 자연스럽고, 오버레이가 표시하는 현재 곡도 플레이리스트 맥락 안에 고정된다.
