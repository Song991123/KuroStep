# KuroStep Sunday Todo

## 목표

일요일 목표는 전체 완성이 아니라, Swagger에서 핵심 백엔드 흐름이 실제로 돌아가는 상태까지 만드는 것이다.

최소 성공 기준:

- 작업 카드 Todo CRUD가 된다.
- 곡을 등록하고 검색할 수 있다.
- 플레이리스트를 만들고 곡을 추가할 수 있다.
- 작업 카드에 플레이리스트를 연결할 수 있다.
- 컴파일과 기본 실행이 된다.

## 현재 상태

완료:

- Entity 1차 완성
- User, Track, Playlist, PlaylistTrack, CreatorTask
- Lyric, UserLyricCache, LyricLineRef, LyricTranslation
- 주요 Enum 생성
- JPA Auditing 설정
- 컴파일 성공

아직:

- Repository
- DTO
- Service
- Controller
- Security/JWT
- Swagger 확인
- Docker/EC2
- Tauri 연동

## 1단계. Repository 만들기

목표: Entity를 DB에서 조회/저장할 수 있는 입구 만들기.

### 만들 파일

```text
src/main/java/com/kurostep/task/repository/CreatorTaskRepository.java
src/main/java/com/kurostep/lyric/repository/LyricRepository.java
src/main/java/com/kurostep/lyric/repository/LyricLineRefRepository.java
src/main/java/com/kurostep/lyric/repository/UserLyricCacheRepository.java
src/main/java/com/kurostep/translation/repository/LyricTranslationRepository.java
```

### 확인할 기존 파일

```text
src/main/java/com/kurostep/user/repository/UserRepository.java
src/main/java/com/kurostep/track/repository/TrackRepository.java
src/main/java/com/kurostep/playlist/repository/PlaylistRepository.java
src/main/java/com/kurostep/playlist/repository/PlaylistTrackRepository.java
```

### 체크리스트

- [ ] `CreatorTaskRepository` 생성
- [ ] `TrackRepository` 메서드 확인
- [ ] `PlaylistRepository` 메서드 확인
- [ ] `PlaylistTrackRepository` 메서드 확인
- [ ] `LyricRepository` 생성
- [ ] `LyricLineRefRepository` 생성
- [ ] `UserLyricCacheRepository` 생성
- [ ] `LyricTranslationRepository` 생성
- [ ] `./gradlew compileJava` 성공

## 2단계. Todo 기능 틀 만들기

여기서 Todo는 `CreatorTask`이다.

사용자 입장에서 Todo 기능은 다음 흐름이다.

```text
오늘 할 작업을 만든다.
오늘 작업 목록을 본다.
작업 내용을 수정한다.
작업 상태를 TODO, DOING, DONE으로 바꾼다.
필요 없어진 작업을 삭제한다.
작업에 플레이리스트를 연결한다.
현재 재생 중인 플레이리스트 곡을 작업에 기록한다.
```

### Todo API 기능

- [ ] 작업 카드 생성
- [ ] 오늘 작업 목록 조회
- [ ] 날짜별 작업 목록 조회
- [ ] 작업 상세 조회
- [ ] 작업 제목/설명/날짜 수정
- [ ] 작업 상태 변경
- [ ] 작업 삭제
- [ ] 작업에 플레이리스트 연결
- [ ] 작업의 현재 플레이리스트 곡 설정

### Todo DTO

```text
task/dto/CreatorTaskCreateRequest.java
task/dto/CreatorTaskUpdateRequest.java
task/dto/CreatorTaskStatusUpdateRequest.java
task/dto/CreatorTaskResponse.java
```

체크리스트:

- [ ] `CreatorTaskCreateRequest`
- [ ] `CreatorTaskUpdateRequest`
- [ ] `CreatorTaskStatusUpdateRequest`
- [ ] `CreatorTaskResponse`

### Todo Service

```text
task/service/CreatorTaskService.java
```

넣을 메서드:

- [ ] `create`
- [ ] `findToday`
- [ ] `findByDate`
- [ ] `findOne`
- [ ] `update`
- [ ] `changeStatus`
- [ ] `delete`
- [ ] `connectPlaylist`
- [ ] `changeCurrentPlaylistTrack`

### Todo Controller

```text
task/controller/CreatorTaskController.java
```

API 틀:

```text
POST   /api/tasks
GET    /api/tasks/today
GET    /api/tasks?date=2026-06-07
GET    /api/tasks/{taskId}
PATCH  /api/tasks/{taskId}
PATCH  /api/tasks/{taskId}/status
DELETE /api/tasks/{taskId}
PATCH  /api/tasks/{taskId}/playlist/{playlistId}
PATCH  /api/tasks/{taskId}/current-playlist-track/{playlistTrackId}
```

체크리스트:

- [ ] Controller 생성
- [ ] 생성 API 연결
- [ ] 목록 조회 API 연결
- [ ] 상세 조회 API 연결
- [ ] 수정 API 연결
- [ ] 상태 변경 API 연결
- [ ] 삭제 API 연결
- [ ] 플레이리스트 연결 API 연결
- [ ] 현재 곡 설정 API 연결
- [ ] Swagger 또는 HTTP 요청으로 확인

## 3단계. Track 기능 틀 만들기

목표: 사용자가 작업용 곡을 등록하고 검색할 수 있게 한다.

### Track API

```text
POST /api/tracks
GET  /api/tracks/search?keyword=
GET  /api/tracks/{trackId}
```

체크리스트:

- [ ] `TrackCreateRequest`
- [ ] `TrackResponse`
- [ ] `TrackService`
- [ ] `TrackController`
- [ ] 곡 등록 확인
- [ ] 곡 검색 확인
- [ ] 곡 상세 조회 확인

## 4단계. Playlist 기능 틀 만들기

목표: 플레이리스트를 만들고, 곡을 넣고, 작업 카드와 연결할 수 있게 한다.

### Playlist API

```text
POST   /api/playlists
GET    /api/playlists
GET    /api/playlists/{playlistId}
PATCH  /api/playlists/{playlistId}
DELETE /api/playlists/{playlistId}
POST   /api/playlists/{playlistId}/tracks/{trackId}
GET    /api/playlists/{playlistId}/tracks
DELETE /api/playlists/{playlistId}/tracks/{trackId}
```

체크리스트:

- [ ] `PlaylistCreateRequest`
- [ ] `PlaylistUpdateRequest`
- [ ] `PlaylistResponse`
- [ ] `PlaylistTrackResponse`
- [ ] `PlaylistService`
- [ ] `PlaylistController`
- [ ] 플레이리스트 생성 확인
- [ ] 플레이리스트 목록 확인
- [ ] 플레이리스트에 곡 추가 확인
- [ ] 플레이리스트 곡 목록 확인

## 5단계. 실행 확인

체크리스트:

- [ ] `./gradlew compileJava`
- [ ] `./gradlew test`
- [ ] Spring Boot 실행
- [ ] H2 콘솔 접속
- [ ] Swagger 접속
- [ ] 작업 카드 생성 API 확인
- [ ] 곡 등록 API 확인
- [ ] 플레이리스트 생성 API 확인
- [ ] 플레이리스트에 곡 추가 API 확인
- [ ] 작업 카드에 플레이리스트 연결 API 확인

## 일요일 컷라인

여기까지 되면 성공:

```text
작업 카드 CRUD
작업 상태 변경
곡 등록/검색
플레이리스트 생성
플레이리스트에 곡 추가
작업 카드에 플레이리스트 연결
```

여기까지 못 하면 우선순위:

1. 작업 카드 CRUD
2. 작업 상태 변경
3. 곡 등록
4. 플레이리스트 생성
5. 플레이리스트에 곡 추가
6. 작업 카드에 플레이리스트 연결

## 월요일 이후로 넘길 것

- Spring Security + JWT
- 사용자별 권한 검증 고도화
- LRCLIB 실제 연동
- Tauri 로컬 가사 파일 저장
- 자동 번역 Provider
- Docker
- EC2 배포
- Tauri 오버레이

## 막히면 보는 기준

- Entity는 DB 테이블이다.
- DTO는 요청/응답 모양이다.
- Repository는 DB 입구다.
- Service는 비즈니스 로직과 권한 검증 위치다.
- Controller는 URL과 HTTP 요청을 받는 곳이다.
- Todo 기능의 중심 Entity는 `CreatorTask`다.
