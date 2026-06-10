# KuroStep Learning Notes

## 문서 목적

이 문서는 KuroStep Spring Boot 백엔드를 공부하면서, 현재 코드가 어떤 역할을 하고 어떤 흐름으로 동작해야 하는지 정리하는 학습 노트이다.

현재 코드는 Entity, Repository, DTO, Controller, Service, 공통 예외 처리, 기본 Auth 흐름까지 만들어져 있다. JWT 인증은 아직 TODO 상태이므로, 이 노트는 아래 두 가지를 구분해서 본다.

- 현재 코드에 이미 있는 구조
- 앞으로 Security/JWT를 붙이면서 바뀔 구조

## MVC 흐름

Spring Boot 백엔드에서 요청은 보통 아래 순서로 지나간다.

```text
Client
-> Controller
-> Service
-> Repository
-> DB
-> Repository
-> Service
-> Controller
-> Client
```

KuroStep의 작업 카드 생성 API를 예로 들면 흐름은 이렇게 설명할 수 있다.

```text
POST /api/tasks?userId=1
요청 Body: CreatorTaskCreateRequest

1. CreatorTaskController.create()
2. CreatorTaskService.create()
3. UserRepository.findById(userId)
4. CreatorTask.create(user, title, description, taskDate)
5. CreatorTaskRepository.save(task)
6. CreatorTaskResponse.from(savedTask)
7. JSON 응답
```

현재는 JWT 인증이 아직 붙기 전이라 Controller에서 `@RequestParam Long userId`로 사용자 ID를 임시로 받는다.

나중에 JWT가 붙으면 `userId`를 요청 파라미터로 받지 않고, 로그인 토큰에서 꺼낸 사용자 ID를 사용해야 한다.

```text
현재 임시 방식:
GET /api/tasks?userId=1&date=2026-06-08

나중에 목표 방식:
GET /api/tasks?date=2026-06-08
Authorization: Bearer JWT_TOKEN
```

## Entity

Entity는 DB 테이블과 연결되는 Java 객체이다.

KuroStep에서 Entity는 `src/main/java/com/kurostep/*/domain` 패키지에 있다.

Entity의 공통 특징은 아래와 같다.

- `@Entity`: JPA가 관리하는 테이블 객체라는 뜻
- `@Table(name = "...")`: 실제 DB 테이블 이름 지정
- `@Id`: PK
- `@GeneratedValue(strategy = GenerationType.IDENTITY)`: DB auto increment 사용
- `@ManyToOne(fetch = FetchType.LAZY)`: 다대일 연관관계
- `@JoinColumn(name = "...")`: FK 컬럼명 지정
- `@Enumerated(EnumType.STRING)`: Enum을 숫자가 아니라 문자열로 저장
- `@NoArgsConstructor(access = AccessLevel.PROTECTED)`: JPA용 기본 생성자
- `@Getter`: 필드 조회만 열어두기
- `@Setter`는 쓰지 않고, `update`, `changeStatus` 같은 도메인 메서드로 변경

### BaseTimeEntity

파일: `KuroStep/src/main/java/com/kurostep/common/domain/BaseTimeEntity.java`

모든 Entity의 생성 시각, 수정 시각을 공통으로 관리하는 부모 클래스이다.

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseTimeEntity {
    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

`@MappedSuperclass`는 이 클래스 자체를 테이블로 만들지 않고, 상속받은 Entity 테이블에 필드를 포함시킨다는 뜻이다.

`@CreatedDate`, `@LastModifiedDate`가 동작하려면 메인 클래스에 `@EnableJpaAuditing`이 필요하다. KuroStep은 `KuroStepApplication`에 이미 붙어 있다.

### User

파일: `KuroStep/src/main/java/com/kurostep/user/domain/User.java`

사용자 계정 Entity이다.

중요 필드:

- `email`: 로그인 이메일, unique
- `password`: BCrypt로 암호화된 비밀번호를 저장해야 함
- `nickname`: 닉네임
- `role`: `ROLE_USER`

`User.create(email, encodedPassword, nickname)`은 새 사용자를 만들 때 쓰는 정적 팩토리 메서드이다.

여기서 중요한 점은 Entity에는 원문 비밀번호가 들어가면 안 된다는 것이다. Service에서 먼저 BCrypt로 암호화한 뒤 `encodedPassword`를 넘겨야 한다.

### CreatorTask

파일: `KuroStep/src/main/java/com/kurostep/task/domain/CreatorTask.java`

KuroStep의 핵심 Entity인 작업 카드이다.

중요 필드:

- `user`: 작업 소유자
- `playlist`: 작업에 연결된 플레이리스트, 없을 수 있음
- `currentPlaylistTrack`: 현재 재생 또는 오버레이 표시 중인 플레이리스트 곡 항목
- `title`: 작업 제목
- `description`: 작업 설명
- `status`: `TODO`, `DOING`, `DONE`
- `taskDate`: 작업 날짜

`description`에는 `@Lob`을 사용한다.

이유: MySQL에서는 `TEXT`를 쓰고 싶지만, H2도 같이 쓰기 때문에 DB별 SQL 차이를 줄이려고 `@Column(columnDefinition = "TEXT")` 대신 JPA 표준에 가까운 `@Lob`을 사용했다.

도메인 메서드:

- `create(...)`: 새 작업 카드 생성
- `update(...)`: 제목, 설명, 날짜 수정
- `changeStatus(...)`: 상태 변경
- `connectPlaylist(...)`: 작업에 플레이리스트 연결
- `changeCurrentPlaylistTrack(...)`: 현재 표시 곡 항목 변경

### Playlist

파일: `KuroStep/src/main/java/com/kurostep/playlist/domain/Playlist.java`

사용자가 작업할 때 듣는 곡 묶음이다.

중요 필드:

- `user`: 플레이리스트 소유자
- `name`: 플레이리스트 이름
- `description`: 설명

`Playlist.create(user, name, description)`으로 생성하고, `update(name, description)`으로 수정한다.

### PlaylistTrack

파일: `KuroStep/src/main/java/com/kurostep/playlist/domain/PlaylistTrack.java`

플레이리스트와 곡 사이의 연결 Entity이다.

단순히 `Playlist`와 `Track`을 N:M으로 직접 연결하지 않고 `PlaylistTrack`을 둔 이유는, 연결 자체에 `sortOrder`라는 데이터가 있기 때문이다.

중요 필드:

- `playlist`: 어떤 플레이리스트에 들어있는지
- `track`: 어떤 곡인지
- `sortOrder`: 플레이리스트 안에서의 순서

`@UniqueConstraint(columnNames = {"playlist_id", "track_id"})`가 있어서 같은 플레이리스트에 같은 곡이 중복으로 들어가지 않게 설계되어 있다.

### Track

파일: `KuroStep/src/main/java/com/kurostep/track/domain/Track.java`

작업용 곡 정보이다.

중요 필드:

- `title`: 곡 제목
- `artist`: 아티스트
- `album`: 앨범
- `sourceType`: `YOUTUBE`, `SPOTIFY`, `SOUNDCLOUD`, `EXTERNAL_URL`, `LOCAL_FILE`
- `sourceUrl`: 외부 재생 링크
- `sourceId`: YouTube video id 같은 외부 플랫폼 ID
- `durationSeconds`: 곡 길이

KuroStep은 서버가 음원을 저장하거나 다운로드하지 않는다. 서버는 공식 외부 플레이어 링크와 메타데이터만 관리한다.

### Lyric

파일: `KuroStep/src/main/java/com/kurostep/lyric/domain/Lyric.java`

LRCLIB에서 조회한 가사 묶음의 메타데이터이다.

중요 필드:

- `track`: 어떤 곡의 가사인지
- `provider`: 현재는 `LRCLIB`
- `providerLyricsId`: LRCLIB 내부 ID
- `languageCode`: 원문 언어 코드
- `synced`: 시간 싱크가 있는 가사인지
- `fetchedAt`: 외부 Provider에서 조회한 시각

중요한 설계 포인트: 서버 DB에는 가사 전문을 저장하지 않는다. 원문 가사 파일은 Tauri 로컬 데이터 폴더에 저장하고, 서버는 메타데이터만 가진다.

### UserLyricCache

파일: `KuroStep/src/main/java/com/kurostep/lyric/domain/UserLyricCache.java`

사용자별 로컬 가사 파일 저장 상태를 관리한다.

같은 `Lyric`이라도 사용자 PC마다 로컬 파일 저장 여부가 다를 수 있어서, `Lyric`과 별도 Entity로 둔다.

중요 필드:

- `user`: 캐시 소유자
- `lyric`: 어떤 가사 묶음인지
- `cacheStorageType`: 현재는 `LOCAL_FILE`
- `localCacheKey`: Tauri 로컬 파일 키
- `cacheStatus`: `PENDING_LOCAL_SAVE`, `SAVED`, `MISSING`, `FAILED_LOCAL_SAVE`
- `savedAt`: 저장 완료 시각

도메인 메서드:

- `markSaved(savedAt)`
- `markMissing()`
- `markFailed()`

### LyricLineRef

파일: `KuroStep/src/main/java/com/kurostep/lyric/domain/LyricLineRef.java`

가사 한 줄을 서버에서 참조하기 위한 Entity이다.

중요 필드:

- `lyric`: 어떤 가사 묶음에 속하는지
- `lineIndex`: 몇 번째 줄인지
- `startTimeMs`: 시작 시간
- `textHash`: 로컬 원문 라인과 연결하기 위한 해시

중요한 점: 이 Entity도 원문 가사 텍스트를 저장하지 않는다. 서버는 라인 번호, 시간, 해시만 가지고, 실제 원문은 로컬 파일에 둔다.

### LyricTranslation

파일: `KuroStep/src/main/java/com/kurostep/translation/domain/LyricTranslation.java`

가사 라인별 한국어 번역문과 개인 메모를 저장하는 Entity이다.

중요 필드:

- `lyricLineRef`: 어떤 가사 라인에 대한 번역인지
- `user`: 누가 쓴 번역/메모인지
- `languageCode`: 보통 `ko`
- `translatedText`: 번역문
- `memoText`: 개인 메모
- `provider`: `GEMINI`, `PAPAGO`, `MANUAL`
- `status`: `AUTO_DRAFT`, `EDITED`

`createDraft(...)`로 자동 번역 초안을 만들고, 사용자가 수정하면 `edit(...)`으로 상태가 `EDITED`가 된다.

## Repository

Repository는 DB 접근 담당이다.

KuroStep의 Repository는 모두 `JpaRepository<Entity, Long>`을 상속한다.

```java
public interface CreatorTaskRepository extends JpaRepository<CreatorTask, Long> {
    List<CreatorTask> findByUserIdAndTaskDate(Long userId, LocalDate taskDate);
}
```

Spring Data JPA는 메서드 이름을 해석해서 쿼리를 자동으로 만든다.

예를 들어:

- `findByUserId`
- `findByUserIdAndTaskDate`
- `findByPlaylistIdOrderBySortOrderAsc`
- `existsByEmail`
- `findBySourceTypeAndSourceId`

이런 이름은 직접 SQL을 쓰지 않아도 JPA가 의미를 해석한다.

### Repository 파일별 역할

`UserRepository`

- `findByEmail(String email)`: 로그인할 때 이메일로 사용자 찾기
- `existsByEmail(String email)`: 회원가입 중복 검사

`CreatorTaskRepository`

- `findByUserId(Long userId)`: 특정 사용자의 모든 작업
- `findByUserIdAndTaskDate(Long userId, LocalDate taskDate)`: 특정 날짜 작업

`PlaylistRepository`

- `findByUserIdOrderByCreatedAtDesc(Long userId)`: 사용자의 플레이리스트 목록을 최신순 조회

`PlaylistTrackRepository`

- `findByPlaylistIdOrderBySortOrderAsc(Long playlistId)`: 플레이리스트 곡 목록 순서대로 조회
- `existsByPlaylistIdAndTrackId(Long playlistId, Long trackId)`: 중복 곡 추가 방지
- `findByPlaylistIdAndTrackId(Long playlistId, Long trackId)`: 플레이리스트 안의 특정 곡 항목 조회
- `findTopByPlaylistIdOrderBySortOrderDesc(Long playlistId)`: 마지막 순서의 곡 항목 조회

`TrackRepository`

- `findByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(...)`: 제목 또는 아티스트 검색
- `findBySourceTypeAndSourceId(...)`: 외부 플랫폼 기준 중복 곡 확인

`LyricRepository`

- `findByTrackId(Long trackId)`: 곡에 연결된 가사 목록
- `findByTrackIdAndProvider(...)`: 특정 Provider 가사 조회

`UserLyricCacheRepository`

- `findByUserIdAndLyricId(...)`: 사용자별 로컬 가사 캐시 상태 조회

`LyricLineRefRepository`

- `findByLyricIdOrderByLineIndexAsc(...)`: 가사 라인을 순서대로 조회

`LyricTranslationRepository`

- `findByLyricLineRefIdAndUserId(...)`: 특정 사용자의 특정 라인 번역 조회
- `findByUserIdAndLyricLineRefIdAndLanguageCode(...)`: 사용자, 라인, 언어 기준 번역 조회

## DTO

DTO는 API 요청/응답에 쓰는 객체이다.

Entity를 그대로 API 응답으로 내보내지 않고 DTO를 쓰는 이유는 아래와 같다.

- Entity 내부 구조를 외부에 직접 노출하지 않기 위해
- 필요한 필드만 응답하기 위해
- 요청값 검증을 DTO에서 처리하기 위해
- Entity 변경이 API 응답 형식에 바로 영향을 주지 않게 하기 위해

### Entity와 DTO의 차이

```text
Entity = DB에 저장되는 진짜 데이터 모델
DTO = API로 주고받기 좋게 포장한 전달용 데이터 모델
```

Entity는 JPA가 관리한다. Transaction 안에서 조회한 Entity를 수정하면 dirty checking으로 DB update가 일어날 수 있다.

DTO는 API 입구와 출구에서 사용한다. 클라이언트가 보내도 되는 값만 받고, 클라이언트에게 보여줘도 되는 값만 응답한다.

예:

```text
JSON 요청
-> Request DTO
-> Entity 생성
-> DB 저장
-> Entity
-> Response DTO
-> JSON 응답
```

게시물과 댓글처럼 하위 목록이 필요할 때도 Entity를 그대로 넣지 않고 DTO 안에 DTO를 넣는다.

```java
public record PostDetailResponse(
        Long id,
        String title,
        List<CommentResponse> comments
) {
}
```

KuroStep으로 보면 플레이리스트 상세 응답에 곡 목록을 넣고 싶을 때:

```java
public record PlaylistDetailResponse(
        Long id,
        String name,
        String description,
        List<PlaylistTrackResponse> tracks
) {
}
```

핵심:

```text
Entity는 DB 관계대로 연결하고,
DTO는 화면/API 응답 모양대로 조립한다.
```

### Request DTO

Request DTO는 클라이언트가 서버로 보내는 값이다.

예: `CreatorTaskCreateRequest`

```java
public record CreatorTaskCreateRequest(
        @NotBlank String title,
        String description,
        @NotNull LocalDate taskDate
) {
}
```

여기서 `@NotBlank`, `@NotNull`은 Bean Validation이다.

- `@NotBlank`: null, 빈 문자열, 공백 문자열을 막음
- `@NotNull`: null만 막음

Controller에서 `@Valid @RequestBody CreatorTaskCreateRequest request`라고 쓰면, 요청값이 DTO 조건을 어겼을 때 Controller에 들어오기 전에 검증 오류가 난다.

### Response DTO

Response DTO는 서버가 클라이언트로 돌려주는 값이다.

예: `CreatorTaskResponse`

```java
public static CreatorTaskResponse from(CreatorTask task) {
    return new CreatorTaskResponse(
            task.getId(),
            task.getTitle(),
            task.getDescription(),
            task.getStatus(),
            task.getTaskDate(),
            task.getPlaylist() == null ? null : task.getPlaylist().getId(),
            task.getCurrentPlaylistTrack() == null ? null : task.getCurrentPlaylistTrack().getId()
    );
}
```

`from(Entity)` 메서드는 Entity를 DTO로 변환하는 정적 팩토리 메서드이다.

`task.getPlaylist() == null ? null : task.getPlaylist().getId()`처럼 null 체크를 하는 이유는, 작업 카드에 아직 플레이리스트가 연결되지 않았을 수 있기 때문이다.

### record

`record`는 Java에서 DTO처럼 값을 담기 위한 클래스를 짧게 만들 수 있게 해주는 문법이다.

```java
public record TrackCreateRequest(
        String title,
        String artist,
        TrackSourceType sourceType
) {
}
```

자동으로 만들어지는 것:

- 필드
- 생성자
- getter 비슷한 접근 메서드
- `equals`
- `hashCode`
- `toString`

record 접근 방식:

```java
request.title()
request.artist()
request.sourceType()
```

일반 Lombok getter처럼 `request.getTitle()`이 아니다.

KuroStep 기준:

```text
Entity -> class 사용
DTO -> record 사용하기 좋음
```

## Controller

Controller는 HTTP 요청을 받는 입구이다.

KuroStep의 Controller는 `src/main/java/com/kurostep/*/controller` 패키지에 있다.

공통 특징:

- `@RestController`: 반환값을 JSON 응답으로 변환
- `@RequestMapping("/api/...")`: 공통 URL prefix
- `@PostMapping`: 생성
- `@GetMapping`: 조회
- `@PatchMapping`: 일부 수정
- `@DeleteMapping`: 삭제
- `@PathVariable`: URL 경로 값
- `@RequestParam`: 쿼리 파라미터
- `@RequestBody`: JSON body
- `@Valid`: DTO 검증 실행

### @Controller와 @RestController

`@Controller`는 보통 HTML 화면을 반환할 때 쓴다.

```java
@Controller
public class PageController {
    @GetMapping("/home")
    public String home() {
        return "home";
    }
}
```

이 경우 `"home"`은 문자열 응답이 아니라 `templates/home.html` 같은 화면 이름으로 해석된다.

`@RestController`는 JSON API를 만들 때 쓴다.

```java
@RestController
public class TrackController {
    @GetMapping("/api/tracks/1")
    public TrackResponse findOne() {
        return new TrackResponse(...);
    }
}
```

이 경우 반환값은 화면 이름이 아니라 JSON 응답으로 바뀐다.

정리:

```text
@Controller = 보통 HTML 화면 반환
@RestController = 보통 JSON 데이터 반환
```

한 클래스에서 둘을 섞고 싶으면 `@Controller`를 쓰고 JSON 메서드에만 `@ResponseBody`를 붙일 수 있다.

하지만 실무에서는 보통 분리한다.

```text
PageController = HTML
ApiController = JSON
```

KuroStep은 Tauri가 화면을 맡고 Spring Boot는 JSON API를 주는 구조라서 `@RestController` 중심이 맞다.

### CreatorTaskController

파일: `KuroStep/src/main/java/com/kurostep/task/controller/CreatorTaskController.java`

작업 카드 API를 담당한다.

주요 API:

- `POST /api/tasks`: 작업 생성
- `GET /api/tasks/today`: 오늘 작업 조회
- `GET /api/tasks?date=...`: 날짜별 작업 조회
- `GET /api/tasks/{taskId}`: 작업 상세 조회
- `PATCH /api/tasks/{taskId}`: 작업 수정
- `PATCH /api/tasks/{taskId}/status`: 작업 상태 변경
- `DELETE /api/tasks/{taskId}`: 작업 삭제
- `PATCH /api/tasks/{taskId}/playlist/{playlistId}`: 작업에 플레이리스트 연결
- `PATCH /api/tasks/{taskId}/current-playlist-track/{playlistTrackId}`: 현재 표시 곡 설정

현재는 모든 메서드가 `userId`를 `@RequestParam`으로 받는다. JWT 적용 후에는 로그인 사용자 ID로 교체해야 한다.

### PlaylistController

파일: `KuroStep/src/main/java/com/kurostep/playlist/controller/PlaylistController.java`

플레이리스트 API를 담당한다.

주요 API:

- `POST /api/playlists`: 플레이리스트 생성
- `GET /api/playlists`: 내 플레이리스트 목록
- `GET /api/playlists/{playlistId}`: 플레이리스트 상세
- `PATCH /api/playlists/{playlistId}`: 플레이리스트 수정
- `DELETE /api/playlists/{playlistId}`: 플레이리스트 삭제
- `POST /api/playlists/{playlistId}/tracks/{trackId}`: 플레이리스트에 곡 추가
- `GET /api/playlists/{playlistId}/tracks`: 플레이리스트 곡 목록
- `DELETE /api/playlists/{playlistId}/tracks/{trackId}`: 플레이리스트에서 곡 제거

### TrackController

파일: `KuroStep/src/main/java/com/kurostep/track/controller/TrackController.java`

곡 API를 담당한다.

주요 API:

- `POST /api/tracks`: 곡 등록
- `GET /api/tracks/search?keyword=...`: 곡 검색
- `GET /api/tracks/{trackId}`: 곡 상세 조회

곡은 현재 사용자별 소유 Entity가 아니라 공용 곡 메타데이터에 가깝다. 사용자는 플레이리스트를 통해 곡을 자기 작업 맥락에 연결한다.

### AuthController

파일: `KuroStep/src/main/java/com/kurostep/auth/controller/AuthController.java`

회원가입과 로그인을 담당한다.

주요 API:

- `POST /api/auth/signup`
- `POST /api/auth/login`

`@Valid @RequestBody SignupRequest request`처럼 요청 JSON을 DTO로 받고, DTO 검증 후 `AuthService`로 넘긴다.

## Service

Service는 실제 비즈니스 로직을 처리하는 계층이다.

Service의 책임:

- Repository로 Entity 조회
- 없으면 예외 발생
- 사용자 소유권 검증
- Entity 생성 또는 도메인 메서드 호출
- Transaction 관리
- Entity를 Response DTO로 변환

Controller에 DB 조회, 중복 검사, 권한 검증, Entity 생성 로직을 모두 넣으면 URL 처리 코드와 비즈니스 규칙이 섞인다.

그래서 Controller는 얇게 두고, 실제 판단은 Service에 둔다.

### AuthService

회원가입 흐름:

```text
이메일 중복 확인
-> 비밀번호 BCrypt 암호화
-> User Entity 생성
-> UserRepository.save(user)
-> AuthResponse 반환
```

로그인 흐름:

```text
이메일로 User 조회
-> 없으면 로그인 실패 예외
-> 입력 비밀번호와 저장된 암호화 비밀번호 비교
-> 성공하면 AuthResponse 반환
```

JWT는 아직 TODO이며, 현재는 로그인 성공 시 사용자 기본 정보만 반환한다.

### TrackService

곡 생성:

```text
1. sourceId가 있으면 sourceType + sourceId 기준으로 기존 곡 조회
2. 이미 있으면 기존 곡을 TrackResponse로 바꿔 반환
3. 없으면 Track.create(...)
4. trackRepository.save(track)
5. TrackResponse.from(savedTrack)
```

핵심 코드:

```java
return trackRepository.findBySourceTypeAndSourceId(request.sourceType(), request.sourceId())
        .map(TrackResponse::from)
        .orElseGet(() -> saveTrack(request));
```

검색:

```text
1. keyword가 null이면 빈 문자열로 처리
2. 앞뒤 공백 trim
3. title 또는 artist에 포함되는 곡 조회
4. TrackResponse 리스트로 변환
```

단건 조회:

```text
1. trackId로 Track 조회
2. 없으면 NotFoundException
3. TrackResponse.from(track)
```

### PlaylistService

플레이리스트 생성:

```text
1. userId로 User 조회
2. Playlist.create(user, request.name(), request.description())
3. playlistRepository.save(playlist)
4. PlaylistResponse.from(saved)
```

플레이리스트 곡 추가:

```text
1. playlistId로 Playlist 조회 + 사용자 권한 검증
2. trackId로 Track 조회
3. existsByPlaylistIdAndTrackId로 중복 확인
4. 마지막 sortOrder 다음 번호 계산
5. PlaylistTrack.create(playlist, track, sortOrder)
6. playlistTrackRepository.save(playlistTrack)
7. PlaylistTrackResponse.from(saved)
```

중요 helper:

- `getUser(userId)`: 사용자 조회
- `getOwnedPlaylist(userId, playlistId)`: 플레이리스트 조회 + 소유자 검증

### CreatorTaskService

작업 생성:

```text
1. userId로 User 조회
2. CreatorTask.create(user, title, description, taskDate)
3. creatorTaskRepository.save(task)
4. CreatorTaskResponse.from(savedTask)
```

작업 상세 조회:

```text
1. taskId로 CreatorTask 조회
2. 없으면 예외
3. task.getUser().getId()와 userId 비교
4. 다르면 권한 예외
5. CreatorTaskResponse.from(task)
```

작업 수정:

```text
1. 작업 조회
2. 사용자 권한 검증
3. task.update(...)
4. 트랜잭션 안에서 dirty checking으로 DB update
5. CreatorTaskResponse.from(task)
```

작업 상태 변경:

```text
1. 작업 조회
2. 사용자 권한 검증
3. task.changeStatus(request.status())
4. 응답 DTO 반환
```

작업-플레이리스트 연결:

```text
1. 작업 조회 + 작업 소유권 검증
2. playlistId로 Playlist 조회
3. 플레이리스트 소유권 검증
4. task.connectPlaylist(playlist)
5. 응답 DTO 반환
```

현재 곡 설정:

```text
1. 작업 조회 + 작업 소유권 검증
2. playlistTrackId로 PlaylistTrack 조회
3. playlistTrack이 task.playlist 안의 항목인지 검증
4. task.changeCurrentPlaylistTrack(playlistTrack)
5. 응답 DTO 반환
```

## Optional

`Optional<T>`는 값이 있을 수도 있고 없을 수도 있음을 표현하는 Java 타입이다.

KuroStep Repository에는 아래처럼 `Optional`을 반환하는 메서드가 있다.

```java
Optional<User> findByEmail(String email);
Optional<Track> findBySourceTypeAndSourceId(TrackSourceType sourceType, String sourceId);
Optional<Lyric> findByTrackIdAndProvider(Long trackId, LyricsProviderType provider);
```

왜 `Optional`을 쓰는가?

DB에서 조회했는데 결과가 없을 수 있기 때문이다.

나쁜 방식:

```java
User user = userRepository.findByEmail(email).get();
```

이렇게 하면 없을 때 `NoSuchElementException`이 나서 어떤 상황인지 알기 어렵다.

권장 방식:

```java
User user = userRepository.findByEmail(email)
        .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
```

### orElseThrow

```java
Track track = trackRepository.findById(trackId)
        .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));
```

뜻:

```text
값이 있으면 꺼낸다.
값이 없으면 예외를 던진다.
```

### map

```java
.map(TrackResponse::from)
```

뜻:

```text
Optional 안에 Track이 있으면
TrackResponse.from(track)을 실행해서
Optional<TrackResponse>로 바꾼다.
```

### orElseGet

```java
.orElseGet(() -> saveTrack(request));
```

뜻:

```text
Optional 안에 값이 없으면
그때 saveTrack(request)를 실행한다.
```

TrackService의 중복 곡 처리:

```java
return trackRepository.findBySourceTypeAndSourceId(request.sourceType(), request.sourceId())
        .map(TrackResponse::from)
        .orElseGet(() -> saveTrack(request));
```

뜻:

```text
sourceType + sourceId로 기존 곡을 찾는다.
있으면 Track -> TrackResponse로 바꿔 반환한다.
없으면 saveTrack(request)를 실행해서 새 곡을 저장한다.
```

## JPA

JPA는 Java 객체와 DB 테이블을 연결해주는 기술이다.

KuroStep에서 JPA가 해주는 일:

- Entity를 테이블에 매핑
- Repository 메서드로 DB 조회/저장
- 연관관계 FK 관리
- Transaction 안에서 변경 감지
- Enum 문자열 저장
- 생성일/수정일 자동 관리

### LAZY 로딩과 EAGER 로딩

KuroStep의 연관관계는 대부분 `fetch = FetchType.LAZY`이다.

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "user_id", nullable = false)
private User user;
```

LAZY는 연관된 객체를 처음부터 다 가져오지 않고, 실제로 접근할 때 가져오는 방식이다.

```text
LAZY = 필요할 때 조회
EAGER = 처음부터 같이 조회
```

EAGER는 편해 보이지만 연관관계가 많아지면 원하지 않는 객체까지 줄줄이 조회될 수 있다.

```text
Task 조회
-> User도 조회
-> Playlist도 조회
-> PlaylistTrack도 조회
-> Track도 조회
...
```

그래서 실무/JPA에서는 대부분 `LAZY`를 기본으로 잡고, 필요한 경우에만 fetch join이나 별도 쿼리로 같이 가져온다.

정리:

```text
EAGER = 친절하지만 과하게 많이 가져올 수 있음
LAZY = 평소엔 아끼고, 필요할 때 가져옴
```

### Dirty Checking

Dirty Checking은 JPA가 “조회한 Entity가 바뀌었는지 감시했다가 자동으로 update 해주는 기능”이다.

예:

```java
@Transactional
public CreatorTaskResponse changeStatus(Long userId, Long taskId, CreatorTaskStatusUpdateRequest request) {
    CreatorTask task = getOwnedTask(userId, taskId);
    task.changeStatus(request.status());

    return CreatorTaskResponse.from(task);
}
```

여기에는 `creatorTaskRepository.save(task)`가 없다. 그런데도 DB에 반영된다.

흐름:

```text
1. Transaction 시작
2. creatorTaskRepository.findById(taskId)
3. JPA가 task Entity를 영속성 컨텍스트에 올림
4. 처음 조회한 상태를 스냅샷처럼 기억해둠
5. task.changeStatus(DOING) 실행
6. Transaction 끝나기 직전
7. JPA가 처음 상태와 현재 상태를 비교
8. status가 바뀐 걸 발견
9. UPDATE SQL 자동 실행
10. commit
```

새 Entity는 `save()`가 필요하다.

```java
creatorTaskRepository.save(task);
```

이미 DB에서 조회한 Entity를 수정할 때는 Transaction 안이면 `save()` 없이도 변경 감지가 된다.

## Transaction

Transaction은 DB 작업을 하나의 단위로 묶는 것이다.

기본 개념:

```text
자동 커밋 끄고
여러 DB 작업을 하나로 묶고
하나라도 실패하면 rollback
성공하면 commit
```

Spring의 `@Transactional`은 이걸 메서드 단위로 자동 처리해준다.

```java
@Transactional
public TrackResponse create(...) {
    ...
}
```

내부 느낌:

```text
1. 메서드 호출 전 Spring이 가로챔
2. DB Connection 가져옴
3. autoCommit false
4. 메서드 실행
5. 예외 없으면 commit
6. RuntimeException 발생하면 rollback
7. Connection 정리
```

JPA에서는 이 Transaction 안에 “영속성 컨텍스트”라는 작업 공간이 생긴다.

```text
DB에서 조회한 Entity를 잠깐 올려두는 공간
Entity 변경을 감시하는 공간
같은 ID를 다시 조회하면 같은 객체를 돌려주는 공간
```

KuroStep Service에는 클래스 위에 아래 어노테이션이 붙어 있다.

```java
@Transactional(readOnly = true)
public class CreatorTaskService {
}
```

이 뜻은 기본적으로 조회 전용 Transaction을 사용한다는 것이다.

생성/수정/삭제 메서드에는 따로 `@Transactional`이 붙어 있다.

정리:

- 조회 메서드: `@Transactional(readOnly = true)`
- 생성/수정/삭제 메서드: `@Transactional`

조회 전용 `readOnly = true`는 “이 메서드는 DB를 바꾸지 않고 조회만 한다”는 힌트이다.

효과:

- 변경 감지 부담을 줄임
- 실수로 수정하는 흐름을 줄임
- DB/프레임워크에게 조회 최적화 힌트를 줌

## 예외 처리

KuroStep에는 공통 예외 처리 구조가 있다.

파일:

- `common/exception/ErrorResponse`
- `common/exception/NotFoundException`
- `common/exception/ForbiddenException`
- `common/exception/ConflictException`
- `common/exception/GlobalExceptionHandler`

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

## Security / JWT

현재 보안 설정 파일은 `KuroStep/src/main/java/com/kurostep/security/config/SecurityConfig.java`이다.

현재 상태:

```java
.csrf(csrf -> csrf.disable())
.headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin()))
.authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
```

즉, 지금은 모든 요청을 허용한다.

이 설정은 개발 초기 H2 콘솔, Swagger, API 테스트를 쉽게 하기 위한 임시 상태이다.

현재 이미 적용된 것:

- `PasswordEncoder`
- `BCryptPasswordEncoder`
- 회원가입 시 비밀번호 암호화
- 로그인 시 `passwordEncoder.matches(...)`로 비밀번호 검증

JWT를 붙이면 목표는 아래와 같다.

```text
1. 회원가입, 로그인, Swagger, H2 console 정도만 permitAll
2. 나머지 API는 authenticated
3. 요청 Header의 Authorization: Bearer ... 토큰 검사
4. 토큰에서 userId 또는 email 추출
5. Controller/Service에서 로그인 사용자 기준으로 권한 검증
```

Security와 Service 권한 검증의 역할은 다르다.

- Security/JWT: 이 요청이 로그인한 사용자의 요청인지 확인
- Service 권한 검증: 로그인 사용자가 이 데이터의 소유자인지 확인

인증과 인가:

```text
인증 Authentication = 너 누구야? 로그인했어?
인가 Authorization = 너 이 데이터에 접근할 권한 있어?
```

예를 들어 로그인한 사용자라도 남의 `taskId`를 URL에 넣으면 막아야 한다. 이건 Service에서 `task.getUser().getId()`와 로그인 사용자 ID를 비교해야 한다.

JWT 상세 내용은 별도 문서 `KuroStep_Security_JWT_Learning.md`에 정리한다.

## Validation

Validation은 요청값 검증이다.

KuroStep DTO는 Bean Validation을 사용한다.

예:

```java
public record TrackCreateRequest(
        @NotBlank String title,
        String artist,
        String album,
        @NotNull TrackSourceType sourceType,
        String sourceUrl,
        String sourceId,
        Integer durationSeconds
) {
}
```

Controller에서 `@Valid`를 붙이면 DTO 검증이 자동 실행된다.

```java
public TrackResponse create(@Valid @RequestBody TrackCreateRequest request)
```

검증 실패 예:

- `title`이 비어 있음
- `taskDate`가 null
- `sourceType`이 null
- `status`가 null

검증 실패는 `GlobalExceptionHandler`의 `handleValidation`에서 `VALIDATION_ERROR` JSON으로 바꾼다.

정리:

```text
Validation = Controller 입구에서 요청 DTO가 말이 되는 값인지 검사하는 장치
```

## 현재 코드 한 파일씩 뜯어보기

### KuroStepApplication.java

파일: `KuroStep/src/main/java/com/kurostep/KuroStepApplication.java`

Spring Boot 앱의 시작점이다.

- `@SpringBootApplication`: Spring Boot 자동 설정, 컴포넌트 스캔 시작
- `@EnableJpaAuditing`: `createdAt`, `updatedAt` 자동 입력 기능 활성화
- `main`: 애플리케이션 실행

### BaseTimeEntity.java

공통 시간 필드 부모 클래스이다.

모든 주요 Entity가 이 클래스를 상속해서 `createdAt`, `updatedAt`을 가진다.

### User.java / UserRole.java

회원 정보를 저장하는 Entity와 권한 Enum이다.

`AuthService.signup`에서 `User.create(...)`로 생성된다.

### CreatorTask.java / TaskStatus.java

작업 카드 Entity와 상태 Enum이다.

KuroStep의 “오늘 할 창작 작업”을 표현한다. 작업 카드는 사용자에게 속하고, 선택적으로 플레이리스트와 현재 플레이리스트 곡 항목을 참조한다.

### Playlist.java

사용자 소유 플레이리스트 Entity이다.

한 사용자가 여러 플레이리스트를 가질 수 있다.

### PlaylistTrack.java

플레이리스트와 곡의 연결 Entity이다.

`sortOrder`가 있기 때문에 단순 연결 테이블보다 더 중요한 도메인 객체이다.

### Track.java / TrackSourceType.java

곡 정보와 외부 소스 타입을 저장한다.

KuroStep은 음원을 직접 저장하지 않고, 외부 공식 재생 링크를 연결하는 방식이다.

### Lyric.java / LyricsProviderType.java

가사 묶음 메타데이터이다.

현재 Provider는 `LRCLIB` 하나이다.

### UserLyricCache.java / LyricCacheStorageType.java / LyricCacheStatus.java

사용자별 로컬 가사 파일 저장 상태를 관리한다.

서버가 원문 가사를 들고 있지 않고, Tauri 로컬 파일과 서버 메타데이터를 연결하기 위한 설계이다.

### LyricLineRef.java

가사 라인 참조 Entity이다.

원문 텍스트 대신 `lineIndex`, `startTimeMs`, `textHash`만 저장한다.

### LyricTranslation.java / TranslationProviderType.java / TranslationStatus.java

사용자별 한국어 번역 초안과 개인 메모를 저장한다.

자동 번역 초안이면 `AUTO_DRAFT`, 사용자가 수정하면 `EDITED` 상태가 된다.

### Repository 파일들

모두 `JpaRepository`를 상속한다.

직접 SQL 없이도 메서드 이름으로 조회 쿼리를 만들 수 있다.

가장 자주 볼 패턴:

```java
Optional<Entity> findBy...
List<Entity> findBy...
boolean existsBy...
```

### DTO 파일들

API 요청과 응답 모양을 정의한다.

Request DTO에는 검증 어노테이션이 붙어 있고, Response DTO에는 `from(Entity)` 변환 메서드가 있다.

### AuthController.java

회원가입과 로그인 HTTP API 입구이다.

`SignupRequest`, `LoginRequest`를 받고 `AuthService`로 넘긴다.

### CreatorTaskController.java

작업 카드 HTTP API 입구이다.

작업 카드 CRUD, 상태 변경, 플레이리스트 연결, 현재 곡 설정 API를 가진다.

### PlaylistController.java

플레이리스트 HTTP API 입구이다.

플레이리스트 CRUD와 플레이리스트 곡 추가/조회/삭제 API를 가진다.

### TrackController.java

곡 HTTP API 입구이다.

곡 등록, 검색, 상세 조회 API를 가진다.

### AuthService.java

회원가입/로그인 비즈니스 로직이다.

이메일 중복 검사, 비밀번호 암호화, 비밀번호 검증을 처리한다.

### CreatorTaskService.java

작업 카드 비즈니스 로직이다.

사용자 조회, 작업 조회, 소유자 검증, 작업 생성/수정/삭제, 상태 변경, 플레이리스트 연결, 현재 곡 설정을 처리한다.

### PlaylistService.java

플레이리스트 비즈니스 로직이다.

플레이리스트 소유권 검증과 곡 추가 중복 검증이 중요하다.

### TrackService.java

곡 비즈니스 로직이다.

외부 소스 기준 중복 확인, 검색, 상세 조회를 처리한다.

### SecurityConfig.java

Spring Security 설정 파일이다.

현재는 모든 요청 허용 상태이다. JWT 구현 후에는 회원가입/로그인/Swagger 정도만 열어두고 나머지는 인증이 필요하도록 바꿔야 한다.

### GlobalExceptionHandler.java / ErrorResponse.java

Service에서 발생한 예외를 JSON 에러 응답으로 바꿔준다.

Controller마다 try-catch를 쓰지 않아도 되는 이유가 이 공통 예외 처리이다.

## 테스트 코드 읽기

### AuthServiceTest

회원가입과 로그인을 검증한다.

중요하게 보는 것:

- 회원가입하면 userId가 생기는가
- 비밀번호가 원문 그대로 저장되지 않는가
- 중복 이메일이면 `ConflictException`이 나는가
- 가입한 이메일/비밀번호로 로그인 가능한가

### TrackServiceTest

곡 등록, 중복 등록 방지, 검색을 검증한다.

중요하게 보는 것:

- 곡 등록하면 tracks 테이블에 저장되는가
- 같은 `sourceType`, `sourceId`로 다시 등록하면 기존 곡을 반환하는가
- 제목 또는 아티스트로 검색할 수 있는가

### KuroStepFlowIntegrationTest

MVP 핵심 흐름을 Service 단위로 실제 연결해서 검증한다.

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

이 테스트는 단순히 메서드 하나를 보는 것이 아니라 KuroStep의 주요 도메인인 `Auth`, `Track`, `Playlist`, `CreatorTask`가 서로 이어지는지 확인한다.

## 발표 때 말하기 좋은 요약

KuroStep 백엔드는 Spring MVC 구조로 Controller, Service, Repository, Entity를 분리했습니다.

Controller는 HTTP 요청을 받고 DTO 검증을 수행합니다. Service는 사용자 소유권 검증과 작업 생성, 상태 변경, 플레이리스트 연결 같은 비즈니스 로직을 담당합니다. Repository는 Spring Data JPA를 통해 DB 접근을 처리합니다. Entity는 실제 DB 테이블과 매핑되며, Setter를 열어두기보다 `update`, `changeStatus` 같은 도메인 메서드로 상태를 변경하도록 설계했습니다.

특히 작업 카드, 플레이리스트, 곡, 가사 라인, 번역 메모를 JPA 연관관계로 연결했고, 사용자별 데이터 접근은 Service 계층에서 `userId`를 비교해 검증하는 방향으로 구현했습니다.

현재 인증은 개발 초기 단계라 임시로 `userId`를 요청 파라미터로 받고 있지만, 최종적으로는 Spring Security와 JWT를 적용해 로그인 사용자를 식별하고, Service에서 데이터 소유권을 한 번 더 검증하는 구조로 완성할 계획입니다.

## 2026-06-08 학습 정리: Controller 다음 Service 흐름

### Controller 복습

Controller는 URL 요청을 받는 입구이다.

예를 들어 `TrackController`는 `POST /api/tracks`, `GET /api/tracks/search`, `GET /api/tracks/{trackId}` 요청을 받고, 실제 로직은 `TrackService`에 맡긴다.

```text
Client JSON 요청
-> Controller가 DTO로 받음
-> Service 메서드 호출
-> Service 결과 DTO 반환
-> @RestController가 JSON 응답으로 변환
```

### Service가 필요한 이유

Controller에 DB 조회, 중복 검사, 권한 검증, Entity 생성 로직을 모두 넣으면 URL 처리 코드와 비즈니스 규칙이 섞인다.

그래서 Service가 아래 책임을 맡는다.

- Repository로 Entity 조회
- 없으면 `NotFoundException`
- 중복이면 `ConflictException`
- 남의 데이터면 `ForbiddenException`
- Entity 생성 또는 변경
- Entity를 Response DTO로 변환

Controller는 얇게 두고, 실제 판단은 Service에 둔다.

### TrackService 흐름

`TrackService.create(request)`는 곡 등록 메서드이다.

```text
1. sourceId가 있으면 중복 곡인지 먼저 확인
2. 이미 있으면 기존 Track을 TrackResponse로 바꿔 반환
3. 없으면 새 Track Entity 생성
4. trackRepository.save(track)로 DB 저장
5. TrackResponse.from(savedTrack)로 응답 DTO 생성
```

`TrackService.search(keyword)`는 검색어를 trim한 뒤 제목 또는 아티스트에 포함되는 곡을 찾고, 결과 Entity 목록을 `TrackResponse` 목록으로 변환한다.

`TrackService.findOne(trackId)`는 ID로 곡을 찾고, 없으면 `NotFoundException("곡을 찾을 수 없습니다.")`를 던진다.

### Optional 정리

Repository에서 단건 조회 결과가 없을 수 있으면 `Optional<T>`를 쓴다.

```java
trackRepository.findById(trackId)
        .orElseThrow(() -> new NotFoundException("곡을 찾을 수 없습니다."));
```

- `orElseThrow`: 값이 있으면 꺼내고, 없으면 예외 발생
- `map`: Optional 안의 값을 다른 값으로 변환
- `orElseGet`: 값이 없을 때만 새 값을 계산해서 반환

TrackService의 중복 곡 처리:

```java
return trackRepository.findBySourceTypeAndSourceId(request.sourceType(), request.sourceId())
        .map(TrackResponse::from)
        .orElseGet(() -> saveTrack(request));
```

뜻:

```text
sourceType + sourceId로 기존 곡을 찾는다.
있으면 Track -> TrackResponse로 바꿔 반환한다.
없으면 saveTrack(request)를 실행해서 새 곡을 저장한다.
```

### Repository와 DB 연결

`TrackRepository extends JpaRepository<Track, Long>`라고 쓰면 Spring Data JPA가 기본 CRUD 기능을 만들어준다.

```java
Optional<Track> findBySourceTypeAndSourceId(TrackSourceType sourceType, String sourceId);
```

이 메서드는 이름을 보고 JPA가 아래 의미의 쿼리를 만든다.

```text
tracks 테이블에서 source_type과 source_id가 일치하는 row를 찾는다.
```

직접 SQL을 쓰지 않아도 Repository 메서드 이름으로 DB 조회가 가능하다.

### 테스트 코드가 흐름 검증인 이유

`TrackServiceTest`는 Service를 직접 호출해서 실제 Repository 저장 결과까지 확인한다.

예:

```text
TrackService.create(request)
-> Track Entity 생성
-> TrackRepository.save(track)
-> tracks 테이블 저장
-> 응답 DTO 반환
-> Repository로 다시 조회해서 저장 확인
```

`KuroStepFlowIntegrationTest`는 더 큰 흐름을 검증한다.

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

이 테스트는 단일 메서드만 보는 것이 아니라 KuroStep MVP 사용 흐름이 Service들을 지나며 실제로 이어지는지 확인한다.
