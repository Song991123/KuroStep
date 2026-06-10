# KuroStep Learning Notes 2

## 문서 목적

이 문서는 MVP 핵심 흐름이 실제 HTTP 요청으로 검증된 뒤, 회복 후 코드 흐름을 다시 따라가기 위한 두 번째 학습 노트이다.

기존 개념 정리와 MVC 기본 흐름은 `KuroStep_Learning_Notes.md`를 보고, 이 문서는 아래 흐름만 따로 복습한다.

1. `KuroStepFlowIntegrationTest`
2. `AuthService`
3. `TrackService`
4. `PlaylistService`
5. `CreatorTaskService`
6. Controller -> Service -> Repository -> DB 흐름
7. 예외 처리 흐름

## 2026-06-09 학습 정리: MVP HTTP 검증 후 코드 흐름

### 1. KuroStepFlowIntegrationTest

`KuroStepFlowIntegrationTest`는 MVP 핵심 흐름을 Service 단위로 실제 연결해서 검증한다.

흐름:

```text
회원가입
-> 곡 등록
-> 플레이리스트 생성
-> 플레이리스트에 곡 추가
-> 작업 카드 생성
-> 작업에 플레이리스트 연결
-> 현재 곡 설정
-> 작업 상태 DOING 변경
```

이 테스트는 단순히 메서드 하나를 보는 것이 아니라, KuroStep의 주요 도메인인 `Auth`, `Track`, `Playlist`, `CreatorTask`가 서로 이어지는지 확인한다.

테스트에서 보는 순서는 실제 사용자가 앱에서 할 법한 순서와 거의 같다.

```text
가입한다.
작업용 곡을 등록한다.
작업용 플레이리스트를 만든다.
플레이리스트에 곡을 넣는다.
오늘 할 작업 카드를 만든다.
작업 카드에 플레이리스트를 연결한다.
현재 표시할 곡을 고른다.
작업 상태를 DOING으로 바꾼다.
```

그래서 이 테스트는 "코드 조각 하나가 돈다"가 아니라 "KuroStep MVP 흐름이 이어진다"를 확인하는 테스트이다.

### 2. AuthService

`AuthService.signup`은 회원가입을 담당한다.

```text
이메일 중복 확인
-> 비밀번호 BCrypt 암호화
-> User Entity 생성
-> UserRepository.save(user)
-> AuthResponse 반환
```

코드 흐름:

```java
if (userRepository.existsByEmail(request.email())) {
    throw new ConflictException("이미 사용 중인 이메일입니다.");
}
```

이미 가입된 이메일이면 바로 예외를 던진다.

```java
User user = User.create(
        request.email(),
        passwordEncoder.encode(request.password()),
        request.nickname()
);
```

원문 비밀번호를 그대로 저장하지 않고 `passwordEncoder.encode(...)`로 BCrypt 암호화한 뒤 `User`를 만든다.

```java
return AuthResponse.from(userRepository.save(user));
```

DB에 저장한 뒤, Entity를 그대로 반환하지 않고 `AuthResponse` DTO로 바꿔 반환한다.

`AuthService.login`은 이메일로 사용자를 찾고, 입력 비밀번호와 DB에 저장된 암호화 비밀번호를 비교한다.

```text
이메일로 User 조회
-> 없으면 로그인 실패
-> passwordEncoder.matches로 비밀번호 비교
-> 틀리면 로그인 실패
-> 성공하면 AuthResponse 반환
```

JWT는 아직 TODO이며, 현재는 로그인 성공 시 사용자 기본 정보만 반환한다.

### 3. TrackService

`TrackService.create`는 곡을 등록한다.

중요한 흐름:

```text
sourceId가 있으면 중복 곡 확인
-> 기존 곡이 있으면 기존 곡 반환
-> 기존 곡이 없으면 새 Track 저장
```

코드:

```java
return trackRepository.findBySourceTypeAndSourceId(request.sourceType(), request.sourceId())
        .map(TrackResponse::from)
        .orElseGet(() -> saveTrack(request));
```

읽는 법:

```text
sourceType + sourceId로 기존 곡을 찾는다.
있으면 TrackResponse로 바꿔 반환한다.
없으면 saveTrack(request)를 실행해서 새 곡을 저장한다.
```

`TrackService.search`는 제목 또는 아티스트에 검색어가 포함된 곡을 찾고, `TrackResponse` 목록으로 변환한다.

```java
return trackRepository.findByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(searchKeyword, searchKeyword)
        .stream()
        .map(TrackResponse::from)
        .toList();
```

`TrackService.findOne`은 곡 ID로 조회하고, 없으면 `NotFoundException`을 던진다.

```java
Track track = trackRepository.findById(trackId)
        .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));
```

### 4. PlaylistService

`PlaylistService`는 사용자별 플레이리스트와 플레이리스트 안의 곡을 관리한다.

중요한 helper:

- `getUser(userId)`: 사용자를 찾고 없으면 `NotFoundException`
- `getOwnedPlaylist(userId, playlistId)`: 플레이리스트를 찾고, 소유자가 아니면 `ForbiddenException`

플레이리스트 생성 흐름:

```text
userId로 User 조회
-> Playlist.create(user, name, description)
-> PlaylistRepository.save
-> PlaylistResponse 반환
```

곡 추가 흐름:

```text
플레이리스트 조회 + 소유자 검증
-> 곡 조회
-> 이미 추가된 곡인지 확인
-> 마지막 sortOrder 다음 번호 계산
-> PlaylistTrack 생성
-> PlaylistTrackRepository.save
```

`PlaylistTrack`은 플레이리스트와 곡 사이의 연결 Entity이며, 곡 순서인 `sortOrder`를 가진다.

즉 `PlaylistTrack`은 단순한 중간 테이블이 아니라 "플레이리스트 안에 들어간 곡 한 칸"을 표현하는 객체이다.

### 5. CreatorTaskService

`CreatorTaskService`는 작업 카드의 핵심 흐름을 담당한다.

주요 기능:

- 작업 카드 생성
- 오늘 작업 조회
- 날짜별 작업 조회
- 작업 상세 조회
- 작업 수정
- 작업 상태 변경
- 작업 삭제
- 작업에 플레이리스트 연결
- 현재 플레이리스트 곡 설정

중요한 helper:

- `getUser(userId)`: 사용자 조회
- `getOwnedTask(userId, taskId)`: 작업 조회 + 작업 소유자 검증

작업 생성 흐름:

```text
userId로 User 조회
-> CreatorTask.create(user, title, description, taskDate)
-> CreatorTaskRepository.save
-> CreatorTaskResponse 반환
```

작업 상태 변경 흐름:

```text
작업 조회 + 소유자 검증
-> task.changeStatus(request.status())
-> Dirty Checking으로 DB update
-> CreatorTaskResponse 반환
```

작업에 플레이리스트 연결:

```text
작업 조회 + 작업 소유자 검증
-> 플레이리스트 조회
-> 플레이리스트 소유자 검증
-> task.connectPlaylist(playlist)
-> 응답 반환
```

현재 곡 설정에서는 `playlistTrack`이 작업에 연결된 플레이리스트 안에 있는 곡인지 확인한다.

```text
작업에 연결된 플레이리스트의 곡만 현재 곡으로 설정할 수 있다.
```

이 검증이 없으면 A 플레이리스트를 연결한 작업에 B 플레이리스트의 곡을 현재 곡으로 넣는 이상한 상태가 생길 수 있다.

### 6. Controller -> Service -> Repository -> DB 흐름

HTTP 요청 기준 흐름:

```text
HTTP 요청
-> Controller
-> Request DTO
-> Service
-> Repository
-> Entity
-> DB 저장/조회
-> Entity
-> Response DTO
-> JSON 응답
```

예: 곡 등록

```text
POST /api/tracks
-> TrackController.create
-> TrackCreateRequest
-> TrackService.create
-> TrackRepository.findBySourceTypeAndSourceId
-> Track.create
-> TrackRepository.save
-> TrackResponse.from
-> JSON 응답
```

역할 정리:

```text
Controller = HTTP 요청을 받고 DTO로 받는 입구
Service = 중복 검사, 권한 검증, Entity 생성/변경 같은 실제 판단
Repository = JPA를 통해 DB와 연결
Entity = DB 테이블과 연결된 객체
DTO = API 요청/응답에 맞춘 데이터 모양
```

KuroStep에서 아직 JWT가 붙기 전이라 `PlaylistController`, `CreatorTaskController`는 임시로 `@RequestParam Long userId`를 받는다.

JWT 적용 후에는 URL에서 `userId`를 받지 않고, 토큰에서 로그인 사용자 ID를 꺼내는 구조로 바꿔야 한다.

### 7. 예외 처리 흐름

Service에서 예외가 발생하면 `GlobalExceptionHandler`가 잡아서 JSON 에러 응답으로 바꾼다.

예외 종류:

- `NotFoundException`: 찾을 수 없음, HTTP 404
- `ForbiddenException`: 접근 권한 없음, HTTP 403
- `ConflictException`: 중복 또는 충돌, HTTP 409
- `IllegalArgumentException`: 잘못된 요청, HTTP 400
- `MethodArgumentNotValidException`: DTO 검증 실패, HTTP 400

응답 형태:

```json
{
  "code": "NOT_FOUND",
  "message": "곡을 찾을 수 없습니다."
}
```

핵심은 Controller마다 try-catch를 쓰지 않고, 공통 예외 처리에서 한 번에 JSON 응답을 만든다는 것이다.

예: 곡을 찾지 못한 경우

```text
TrackService.findOne
-> trackRepository.findById(trackId)
-> Optional.empty()
-> NotFoundException 발생
-> GlobalExceptionHandler.handleNotFound
-> HTTP 404 + ErrorResponse JSON
```

예: 남의 플레이리스트 접근

```text
PlaylistService.getOwnedPlaylist
-> playlist.getUser().getId()와 userId 비교
-> 다르면 ForbiddenException
-> GlobalExceptionHandler.handleForbidden
-> HTTP 403 + ErrorResponse JSON
```

## 회복 후 읽는 순서

컨디션이 좋지 않을 때는 이 순서만 따라가도 충분하다.

1. `KuroStepFlowIntegrationTest`의 `mvpFlow()`를 위에서 아래로 읽는다.
2. 각 줄이 어떤 Service로 들어가는지만 표시한다.
3. `AuthService`, `TrackService`, `PlaylistService`, `CreatorTaskService`를 한 파일씩 본다.
4. 이해가 안 되는 코드는 "왜 이 검증이 필요한지"만 질문한다.
5. 마지막으로 `GlobalExceptionHandler`를 보고 예외가 JSON으로 바뀌는 흐름을 확인한다.

오늘의 최소 컷라인:

```text
회원가입 -> 곡 -> 플레이리스트 -> 작업 카드 -> 연결 -> 현재 곡 -> 상태 변경
```

이 순서를 말로 설명할 수 있으면 충분하다.

