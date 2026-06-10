# KuroStep Tauri Widget Feature Sections

## 문서 목적

이 문서는 KuroStep의 사용자 화면을 **웹페이지가 아니라 Mac에서 실행하는 Tauri 데스크톱 위젯/최소 클라이언트** 기준으로 정리한다.

Spring Boot 백엔드는 REST API를 제공하고, Tauri 위젯은 사용자가 작업 카드, 곡, 플레이리스트, 가사 라인, 번역 메모를 조작하는 데스크톱 진입점 역할을 한다.

## 기준 JSON

아래 구조를 기준으로 Tauri 위젯 기능을 섹션별로 나눈다.

```json
{
  "clientType": "Tauri desktop widget",
  "isWebPage": false,
  "purpose": "KuroStep Spring Boot REST API를 호출하는 최소 데스크톱 위젯",
  "sections": [
    "AuthWidget",
    "TaskWidget",
    "TrackWidget",
    "PlaylistWidget",
    "LyricMemoWidget",
    "TodayWorkWidget"
  ],
  "mvpPolicy": {
    "include": [
      "회원가입",
      "로그인",
      "작업 카드 CRUD",
      "작업 상태 변경",
      "곡 등록/검색",
      "플레이리스트 생성/조회",
      "플레이리스트에 곡 추가",
      "작업 카드에 플레이리스트 연결",
      "현재 곡 설정",
      "가사 라인 참조 조회",
      "번역 메모 저장/조회"
    ],
    "excludeOrLater": [
      "완성형 오버레이",
      "YouTube 음원 다운로드",
      "서버 가사 전문 저장",
      "자동 가사 수집 완성",
      "자동 번역 Provider 완성",
      "WebSocket 실시간 동기화"
    ]
  }
}
```

## 1. AuthWidget

### 섹션 역할

사용자가 Tauri 위젯에서 KuroStep 백엔드에 회원가입하고 로그인하는 진입 섹션이다.

이 섹션은 웹 로그인 페이지가 아니라, 데스크톱 위젯 내부의 로그인 패널이다.

### 사용자 흐름

```text
이메일 입력
-> 비밀번호 입력
-> 닉네임 입력
-> 회원가입
-> 로그인
-> userId 또는 token 저장
-> 다른 위젯 섹션 활성화
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 회원가입 | POST | `/api/auth/signup` |
| 로그인 | POST | `/api/auth/login` |

### MVP 기준

- 현재 백엔드에서는 회원가입, 로그인, BCrypt 검증이 동작한다.
- JWT 완성 전까지 Tauri 위젯은 응답의 `userId`를 저장해 API 요청에 사용한다.
- JWT가 구현되면 `userId` 직접 전달 방식은 `Authorization: Bearer {token}` 방식으로 교체한다.

## 2. TaskWidget

### 섹션 역할

오늘 할 창작 작업 카드를 관리하는 핵심 위젯 섹션이다.

KuroStep에서 작업 카드는 단순 Todo가 아니라, 플레이리스트와 현재 곡을 연결하는 중심 데이터이다.

### 사용자 흐름

```text
오늘 작업 카드 생성
-> 작업 목록 조회
-> 작업 내용 수정
-> 작업 상태 변경
-> 필요하면 작업 삭제
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 작업 카드 생성 | POST | `/api/tasks?userId={userId}` |
| 오늘 작업 조회 | GET | `/api/tasks/today?userId={userId}` |
| 날짜별 작업 조회 | GET | `/api/tasks?userId={userId}&taskDate={date}` |
| 작업 상세 조회 | GET | `/api/tasks/{taskId}?userId={userId}` |
| 작업 수정 | PATCH | `/api/tasks/{taskId}?userId={userId}` |
| 작업 삭제 | DELETE | `/api/tasks/{taskId}?userId={userId}` |
| 작업 상태 변경 | PATCH | `/api/tasks/{taskId}/status?userId={userId}` |

### 화면에 보여줄 정보

| 항목 | 설명 |
|---|---|
| title | 작업 제목 |
| description | 작업 설명 |
| taskDate | 작업 날짜 |
| status | `TODO`, `DOING`, `DONE` |
| playlistId | 연결된 작업용 플레이리스트 |
| currentPlaylistTrackId | 현재 작업 중 들을 곡 |

### MVP 기준

- 작업 카드 CRUD와 상태 변경은 실제 동작 범위이다.
- Tauri 위젯에서는 오늘 작업 목록을 기본 화면으로 둔다.

## 3. TrackWidget

### 섹션 역할

작업 중 들을 곡 정보를 등록하고 검색하는 위젯 섹션이다.

KuroStep은 음원을 다운로드하거나 서버에서 재생하지 않고, 사용자가 입력한 공식 외부 링크와 곡 메타데이터를 관리한다.

### 사용자 흐름

```text
곡 제목 입력
-> 아티스트 입력
-> 외부 링크 입력
-> 곡 등록
-> 등록된 곡 검색
-> 플레이리스트에 추가할 곡 선택
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 곡 등록 | POST | `/api/tracks` |
| 곡 검색 | GET | `/api/tracks/search?keyword={keyword}` |
| 곡 상세 조회 | GET | `/api/tracks/{trackId}` |

### 화면에 보여줄 정보

| 항목 | 설명 |
|---|---|
| title | 곡 제목 |
| artist | 아티스트 |
| album | 앨범명 |
| durationSeconds | 재생 시간 |
| sourceType | `YOUTUBE`, `SPOTIFY`, `SOUNDCLOUD`, `LOCAL_FILE`, `EXTERNAL_URL` |
| sourceUrl | 공식 외부 재생 링크 |
| sourceId | 외부 서비스의 영상/트랙 식별자 |

### MVP 기준

- 실제 YouTube URL은 `sourceUrl`로 등록 가능하다.
- Tauri 내부에는 YouTube IFrame Player API 기반 공식 플레이어 영역을 둔다.
- 평소에는 공식 YouTube iframe을 접어두고 KuroStep 커스텀 플레이어만 보여준다.
- 사용자가 `YouTube 영상 보기`를 누르면 iframe 영역이 아래로 펼쳐져 공식 YouTube 플레이어를 직접 조작할 수 있다.
- 사용자가 `영상 숨기기`를 누르면 iframe은 다시 접히지만, 같은 YouTube Player API 인스턴스를 유지해 재생 시간과 가사 싱크는 이어진다.
- macOS Tauri 로컬 번들 환경에서는 YouTube가 embedding origin을 `tauri://localhost`로 인식해 `Error 153`이 발생할 수 있다.
- 이 경우 기능 실패로 숨기지 않고, 트러블슈팅에 “공식 iframe 재생 시 Tauri WebView origin 제약 발생”으로 기록한다.

## 4. PlaylistWidget

### 섹션 역할

사용자가 작업용 BGM 묶음을 만드는 위젯 섹션이다.

하나의 플레이리스트는 여러 곡을 가질 수 있고, 하나의 작업 카드에 연결될 수 있다.

### 사용자 흐름

```text
플레이리스트 생성
-> 곡 검색
-> 플레이리스트에 곡 추가
-> 플레이리스트 곡 목록 확인
-> 작업 카드에 플레이리스트 연결
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 플레이리스트 생성 | POST | `/api/playlists?userId={userId}` |
| 플레이리스트 목록 | GET | `/api/playlists?userId={userId}` |
| 플레이리스트 상세 | GET | `/api/playlists/{playlistId}?userId={userId}` |
| 플레이리스트 수정 | PATCH | `/api/playlists/{playlistId}?userId={userId}` |
| 플레이리스트 삭제 | DELETE | `/api/playlists/{playlistId}?userId={userId}` |
| 곡 추가 | POST | `/api/playlists/{playlistId}/tracks?userId={userId}` |
| 곡 목록 | GET | `/api/playlists/{playlistId}/tracks?userId={userId}` |
| 곡 제거 | DELETE | `/api/playlists/{playlistId}/tracks/{playlistTrackId}?userId={userId}` |

### 화면에 보여줄 정보

| 항목 | 설명 |
|---|---|
| name | 플레이리스트 이름 |
| description | 플레이리스트 설명 |
| tracks | 플레이리스트에 들어간 곡 목록 |
| sortOrder | 곡 정렬 순서 |

### MVP 기준

- 플레이리스트 생성/조회/수정/삭제와 곡 추가/조회/삭제는 실제 동작 범위이다.
- 곡 순서 변경 UI는 시간이 남으면 붙이고, 보고에서는 `sortOrder` 설계가 있음을 설명한다.

## 5. TaskPlaylistWidget

### 섹션 역할

작업 카드와 플레이리스트를 연결하고, 현재 작업 중 들을 곡을 지정하는 위젯 섹션이다.

KuroStep의 차별점인 `작업 카드 - 작업용 곡` 연결이 여기서 드러난다.

### 사용자 흐름

```text
작업 카드 선택
-> 플레이리스트 선택
-> 작업 카드에 플레이리스트 연결
-> 플레이리스트 안의 곡 선택
-> 현재 곡으로 설정
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 작업 카드에 플레이리스트 연결 | PATCH | `/api/tasks/{taskId}/playlist?userId={userId}` |
| 현재 곡 설정 | PATCH | `/api/tasks/{taskId}/current-track?userId={userId}` |

### MVP 기준

- 이 섹션은 현재 백엔드 MVP에서 검증된 핵심 흐름이다.
- 현재 곡은 반드시 해당 작업에 연결된 플레이리스트 안의 곡이어야 한다.

## 6. LyricMemoWidget

### 섹션 역할

곡에 연결된 가사 라인 참조를 확인하고, 라인별 한국어 번역 메모를 저장하는 위젯 섹션이다.

서버 DB는 저작권 위험을 줄이기 위해 가사 원문 전문 저장을 목표로 하지 않고, 라인 참조와 번역 메모 중심으로 관리한다.

### 사용자 흐름

```text
곡 선택
-> 가사 라인 참조 조회
-> 특정 라인 선택
-> 한국어 번역 또는 메모 작성
-> 저장
-> 다시 조회
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 가사 라인 참조 생성 | POST | `/api/tracks/{trackId}/lyrics/line-refs` |
| 곡의 가사 조회 | GET | `/api/tracks/{trackId}/lyrics` |
| 가사 상세 조회 | GET | `/api/lyrics/{lyricId}` |
| 번역 메모 저장 | POST | `/api/lyric-line-refs/{lineRefId}/translations?userId={userId}` |
| 번역 메모 조회 | GET | `/api/lyric-line-refs/{lineRefId}/translations?userId={userId}` |

### 화면에 보여줄 정보

| 항목 | 설명 |
|---|---|
| lineIndex | 가사 라인 순서 |
| startTimeMs | 싱크 시작 시간 |
| textHash | 원문 라인 식별용 해시 |
| translatedText | 사용자가 저장한 번역문 |
| memoText | 라인별 개인 메모 |
| languageCode | 번역 언어 코드 |

### MVP 기준

- 현재 구현은 가사 라인 참조와 번역 메모 저장/조회까지이다.
- LRCLIB 실제 호출, 로컬 가사 파일 자동 저장, 자동 번역 Provider 호출은 확장 범위이다.
- Tauri 구현 시 가사 원문 파일은 사용자 PC의 앱 데이터 폴더에 저장하는 방향으로 설계한다.

## 7. TodayWorkWidget

### 섹션 역할

Tauri 위젯을 켰을 때 사용자가 가장 먼저 보는 오늘 작업 요약 섹션이다.

웹페이지의 대시보드가 아니라, 작은 데스크톱 작업 위젯에서 오늘 진행할 작업과 연결된 BGM 맥락을 빠르게 확인하는 영역이다.

### 사용자 흐름

```text
앱 실행
-> 로그인 상태 확인
-> 오늘 작업 목록 조회
-> 작업 선택
-> 연결 플레이리스트와 현재 곡 확인
-> 상태 변경 또는 현재 곡 변경
```

### 연결 API

| 기능 | Method | API |
|---|---|---|
| 오늘 작업 조회 | GET | `/api/tasks/today?userId={userId}` |
| 작업 상세 조회 | GET | `/api/tasks/{taskId}?userId={userId}` |
| 플레이리스트 곡 목록 | GET | `/api/playlists/{playlistId}/tracks?userId={userId}` |
| 작업 상태 변경 | PATCH | `/api/tasks/{taskId}/status?userId={userId}` |

### MVP 기준

- 첫 Tauri 구현에서는 TodayWorkWidget을 메인 화면으로 둔다.
- “오늘 작업”, “연결된 플레이리스트”, “현재 곡”, “상태 변경”만 보여줘도 최소 시연이 가능하다.

## 8. Tauri 위젯 구현 우선순위

| 순서 | 섹션 | 이유 |
|---|---|---|
| 1 | AuthWidget | 사용자 식별이 있어야 모든 API 요청이 가능하다. |
| 2 | TodayWorkWidget | 앱을 켰을 때 바로 보여줄 핵심 화면이다. |
| 3 | TaskWidget | 작업 카드가 KuroStep의 중심 데이터이다. |
| 4 | TrackWidget | 작업용 곡 등록과 검색이 필요하다. |
| 5 | PlaylistWidget | 곡을 작업용 묶음으로 관리한다. |
| 6 | TaskPlaylistWidget | 작업과 음악 맥락을 연결한다. |
| 7 | LyricMemoWidget | 가사 라인과 번역 메모를 연결한다. |

## 9. 이번 세미에서의 표현 기준

보고서와 발표에서는 아래처럼 표현한다.

```text
KuroStep의 화면은 일반 웹페이지가 아니라 Tauri 기반 데스크톱 위젯으로 구성한다.
Spring Boot 서버는 REST API를 제공하고, Tauri 위젯은 해당 API를 호출해
오늘 작업, 작업용 곡, 플레이리스트, 가사 라인 참조, 번역 메모를 표시한다.
```

피해야 할 표현:

- 웹사이트 메인 화면
- 웹페이지 대시보드
- 브라우저 기반 음악 앱
- 서버에서 YouTube 음원을 재생
- 서버에 가사 전문을 수집 저장

사용할 표현:

- Tauri 데스크톱 위젯
- Mac 실행 클라이언트
- Spring Boot REST API 연동 위젯
- 공식 외부 링크 기반 곡 메타데이터 관리
- 사용자 로컬 가사 파일 저장 설계
- 라인 참조와 번역 메모 관리

## 10. 최소 시연 시나리오

Tauri 위젯은 아래 흐름을 기준으로 최소 시연한다.

```text
1. Tauri 위젯 실행
2. 회원가입 또는 로그인
3. 오늘 작업 카드 생성
4. 곡 등록
5. 플레이리스트 생성
6. 플레이리스트에 곡 추가
7. 작업 카드에 플레이리스트 연결
8. 현재 곡 설정
9. 작업 상태를 DOING으로 변경
10. 가사 라인과 자동 번역 초안을 확인
11. 자막 ON/OFF로 가사 오버레이 창 확인
```

## 11. 구현 리스크와 처리 기준

| 항목 | 처리 |
|---|---|
| Tauri 로컬 번들 YouTube iframe `Error 153` | `tauri://localhost` origin 제약으로 기록하고, HTTPS 프론트 배포 구조를 대안으로 검토한다. |
| YouTube iframe 화면 노출 | 기본 상태에서는 접어두고, 사용자가 `YouTube 영상 보기`를 누르면 공식 iframe을 펼쳐 직접 조작할 수 있게 한다. |
| YouTube 광고 | 광고 제거, 광고 자동 스킵, 광고 자동 음소거는 구현하지 않는다. 광고가 재생되면 사용자가 펼쳐진 YouTube 화면에서 직접 스킵/정지/음소거/다음 곡 이동을 선택하도록 한다. |
| 저작권/부정경쟁 리스크 | 2025 저작권보호심의 자료를 근거로 광고 우회와 다운로드 기능은 제외한다. |
| YouTube iframe 스타일 적용 누락 | `YT.Player`가 `div#youtube-player`를 `iframe#youtube-player`로 교체해 기존 class가 사라지므로, `#youtube-player` 선택자에도 크기 스타일을 적용한다. |
| 완성형 상시 오버레이 | 현재는 가사/번역 표시용 오버레이를 우선 구현하고, 클릭 통과/멀티 모니터/전역 단축키는 고도화 항목으로 둔다. |
| WebSocket | 상태 동기화가 필요해질 때 확장한다. |
| YouTube 음원 다운로드 | 구현하지 않는다. |
| 서버 가사 전문 저장 | 구현하지 않는다. |
| LRCLIB 실제 API 호출 | 백엔드 안정화 후 확장한다. |
| 자동 번역 Provider 호출 | 번역 메모 저장 흐름이 안정화된 뒤 확장한다. |
| 디자인 고도화 | 발표 가능 MVP 이후 진행한다. |
