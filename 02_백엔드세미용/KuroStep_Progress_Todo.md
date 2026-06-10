# KuroStep Progress Todo

## 문서 역할

이 문서는 KuroStep Spring Boot 백엔드 일정/Todo 관리 세션에서만 갱신한다.

- 오늘 백엔드에서 무엇을 검증할지 정한다.
- 마감까지 남은 백엔드 필수 작업을 보이게 한다.
- 지금 당장 할 1개 작업을 고른다.
- 일정이 밀리면 기능을 삭제하지 않고, 얇게 구현해서 검증 증거를 남기는 방향으로 조정한다.

## 현재 기준

- 현재 날짜: 2026-06-09
- 마지막 갱신: 2026-06-09 15:53 KST
- 마감: 2026-06-10 저녁 보고
- 현재 범위: KuroStep Spring Boot 백엔드 + Tauri 최소 위젯 연동
- 현재 전략: 기능을 삭제하지 않고, 실제 구현/검증 상태와 남은 리스크를 분리해서 기록한다.
- 건강 메모: 몸 상태가 좋지 않으므로 새 기능 확장보다 백엔드 검증, 보고서 반영, 시연 순서 정리를 우선한다.

## 현재 요약

KuroStep 백엔드는 테스트와 실제 HTTP 요청 기준으로 핵심 백엔드 MVP 흐름이 검증된 상태이다.
Tauri 최소 위젯은 Spring Boot API와 연결되어 작업 카드, 곡, 플레이리스트, 가사 라인, 번역 초안을 표시한다.
가사 오버레이는 별도 `lyrics` 창으로 현재 가사/번역을 전달하는 구조가 구현되어 있다.
YouTube 공식 iframe의 앱 내부 재생은 구현을 시도했으나 macOS Tauri WebView에서 `Error 153`이 재현되어 트러블슈팅 항목으로 기록한다.

WBS 시각화 파일:

- `02_백엔드세미용/KuroStep_WBS_Dashboard.html`

실제 검증 로그:

```text
track 1 https://www.youtube.com/watch?v=dQw4w9WgXcQ
lyric 1 lines 58 hasSourceText true
draft 1 MYMEMORY AUTO_DRAFT 절대 포기하지 않을 거예요
```

검증된 백엔드 흐름:

```text
회원가입
-> 로그인
-> JWT 인증
-> 실제 YouTube URL 곡 등록
-> 플레이리스트 생성
-> 플레이리스트에 곡 추가
-> 작업 카드 생성
-> 작업 카드에 플레이리스트 연결
-> 현재 곡 설정
-> 상태 변경
-> LRCLIB 가사 조회
-> 가사 라인 참조 58개 생성
-> MyMemory 번역 초안 생성
```

## WBS

| 작업 영역 | 세부 작업 | 상태 | 근거 파일 | 다음 행동 |
|---|---|---|---|---|
| 공통 기반 | 공통 예외 응답 추가 | 최소 구현 완료 | `KuroStep/src/main/java/com/kurostep/common/exception/GlobalExceptionHandler.java`, `ErrorResponse.java` | 보고서에 예외 처리 방식 정리 |
| 공통 기반 | RestClient 공통 설정 | 최소 구현 완료 | `KuroStep/src/main/java/com/kurostep/common/config/RestClientConfig.java` | 외부 API 연동 근거로 정리 |
| Auth/Security | 회원가입/로그인 구현 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/auth/service/AuthService.java`, `AuthController.java` | Swagger 수동 시나리오에 포함 |
| Auth/Security | BCrypt 비밀번호 암호화/검증 | 실제 검증 완료 | `KuroStep/src/test/java/com/kurostep/auth/service/AuthServiceTest.java` | 원문 저장 아님을 보고서에 명시 |
| Auth/Security | JWT 토큰 발급/검증 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/security/jwt/JwtTokenProvider.java`, `JwtAuthenticationFilter.java` | 보호 API 수동 호출 증거 정리 |
| Auth/Security | Spring Security로 `/api/**` 보호 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/security/config/SecurityConfig.java` | 권한 검증 보강 여부 판단 |
| API 문서화 | Swagger/OpenAPI 의존성 추가 | 최소 구현 완료 | `KuroStep/build.gradle` | Swagger UI 접근 캡처 또는 설명 확보 |
| API 문서화 | Swagger UI 접근 가능 | 실제 검증 완료 | Swagger UI 실행 확인 결과 | 핵심 API 시나리오 수동 확인 |
| Track | 곡 등록/검색/상세 조회 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/track/service/TrackService.java`, `TrackController.java` | 실제 YouTube URL 등록 흐름 유지 |
| Track | YouTube `sourceUrl`/`sourceId` 저장 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/track/domain/Track.java`, `http/kurostep-demo.http` | 발표 시 실제 링크 사용 근거로 제시 |
| Playlist | 플레이리스트 CRUD | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/playlist/service/PlaylistService.java`, `PlaylistController.java` | Swagger 수동 시나리오에 포함 |
| Playlist | 플레이리스트에 곡 추가/목록/삭제 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/playlist/service/PlaylistService.java`, `PlaylistTrack.java` | 작업 연결 전 단계로 시연 |
| Task | 작업 카드 CRUD | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/task/service/CreatorTaskService.java`, `CreatorTaskController.java` | Swagger 수동 시나리오에 포함 |
| Task | 오늘/날짜별 작업 조회 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/task/repository/CreatorTaskRepository.java` | "오늘 작업 관리" 요구사항과 연결 |
| Task | 작업 상태 변경 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/task/domain/TaskStatus.java` | 시연 마지막 단계로 사용 |
| Task | 작업-플레이리스트 연결 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/task/service/CreatorTaskService.java` | KuroStep 핵심 차별점으로 설명 |
| Task | 현재 플레이리스트 곡 설정 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/task/service/CreatorTaskService.java` | 작업과 음악 맥락 연결로 설명 |
| Lyrics | 가사 라인 참조 생성/조회 API | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/lyric/service/LyricService.java`, `LyricController.java` | LRCLIB 결과와 연결해서 설명 |
| Lyrics | LRCLIB 실제 외부 API 호출 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/lyric/provider/LrclibClient.java`, `LyricsProviderClient.java` | 검증 로그 `lyric 1 lines 58` 보고서 반영 |
| Lyrics | YouTube Track의 title/artist 기반 가사 조회 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/lyric/provider/LrclibClient.java` | Track과 Lyrics 연결 흐름으로 설명 |
| Lyrics | 가사 라인 참조 58개 생성 | 실제 검증 완료 | 실제 HTTP 검증 로그 | 발표용 검증 수치로 사용 |
| Translation | 번역 메모 저장/조회 API | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/translation/service/LyricTranslationService.java`, `LyricTranslationController.java` | 사용자 수정/저장 흐름으로 설명 |
| Translation | MyMemory 실제 외부 API 호출 | 실제 검증 완료 | `KuroStep/src/main/java/com/kurostep/translation/provider/MyMemoryTranslationClient.java` | 검증 로그 `MYMEMORY AUTO_DRAFT` 반영 |
| Translation | 번역 초안 생성 성공 | 실제 검증 완료 | 실제 HTTP 검증 로그 | 발표에서 실제 외부 연동 근거로 사용 |
| 검증/Test | `AuthServiceTest` 추가 | 실제 검증 완료 | `KuroStep/src/test/java/com/kurostep/auth/service/AuthServiceTest.java` | 테스트 목록에 반영 |
| 검증/Test | `TrackServiceTest` 추가 | 실제 검증 완료 | `KuroStep/src/test/java/com/kurostep/track/service/TrackServiceTest.java` | 테스트 목록에 반영 |
| 검증/Test | `KuroStepFlowIntegrationTest` 추가 | 실제 검증 완료 | `KuroStep/src/test/java/com/kurostep/KuroStepFlowIntegrationTest.java` | 핵심 흐름 검증 근거 |
| 검증/Test | `./gradlew test` 통과 | 실제 검증 완료 | Gradle test 실행 결과 | 발표 전 최종 1회 재실행 |
| 검증/HTTP | 전체 데모 시나리오 추가 | 실제 검증 완료 | `KuroStep/http/kurostep-demo.http` | 발표용 데모 순서로 정리 |
| 검증/HTTP | 실제 HTTP 요청으로 MVP 흐름 검증 | 실제 검증 완료 | `KuroStep/http/kurostep-demo.http`, 실제 검증 로그 | Swagger 수동 확인과 연결 |
| 문서/보고 | `KuroStep_MVP_Presentation_Assets.md` 생성 | 최소 구현 완료 | `02_백엔드세미용/KuroStep_MVP_Presentation_Assets.md` | 백엔드 최신 완료 범위 반영 |
| 문서/보고 | 최종 보고 템플릿 일부 현실화 | 최소 구현 완료 | `02_백엔드세미용/KuroStep_Backend_Semi_Final_Template.md` | Docker/Swagger 수동 확인 결과가 생기면 추가 반영 |
| 문서/보고 | 발표용 데모 시나리오 정리 | 진행 중 | `KuroStep/http/kurostep-demo.http` | Swagger 수동 확인 순서와 합치기 |
| Tauri | 최소 위젯 API 연동 | 최소 구현 완료 | `kurostep-tauri-widget/src/main.js` | 발표 시 백엔드 API 응답이 위젯에 표시되는 흐름 설명 |
| Tauri | 가사 오버레이 창 이벤트 연동 | 최소 구현 완료 | `kurostep-tauri-widget/src-tauri/src/lib.rs`, `src/lyrics.js` | 자막 ON/OFF와 현재 라인 전달 구조 설명 |
| Tauri | 앱 내부 YouTube iframe 플레이어 시도 | 트러블슈팅 기록 | `kurostep-tauri-widget/src/main.js`, 최종 보고서 15장 | `Error 153` 원인과 HTTPS 프론트 대안 설명 |
| 실행/배포 | Docker 빌드/실행 검증 | 필수 잔여 | 없음 | 다음 작업으로 진행 |
| API 문서화 | Swagger 핵심 API 수동 확인 | 필수 잔여 | Swagger UI | 회원가입부터 번역 초안까지 핵심 흐름 확인 |
| Auth/Security | 사용자별 권한 검증 보강 또는 문서화 | 필수 잔여 | Service 권한 검증 코드 | 남은 시간에 보강하거나 보고서에 한계 명시 |

## 현재 백엔드 완료 범위

2026-06-09 기준으로 아래 항목은 백엔드 보고 가능 범위에 포함한다.

| 구분 | 완료 내용 | 보고 포인트 |
|---|---|---|
| Auth/Security | JWT 기반 회원가입/로그인/인증, `/api/**` 보호 | Spring Security와 JWT 흐름이 실제 동작함 |
| Track | YouTube `sourceUrl`/`sourceId` 저장, 곡 등록/검색/상세 조회 | 실제 YouTube 링크를 데이터 흐름에 사용함 |
| Playlist | CRUD, 곡 추가/목록/삭제 | 작업용 BGM 묶음을 관리함 |
| Task | CRUD, 오늘/날짜별 조회, 상태 변경, 플레이리스트 연결, 현재 곡 설정 | 작업과 음악 맥락을 연결하는 핵심 흐름 |
| Lyrics | LRCLIB 실제 호출, 라인 참조 생성/조회 | 실제 외부 가사 API 호출과 라인 58개 생성 확인 |
| Translation | MyMemory 실제 호출, 번역 초안 생성, 번역 메모 저장/조회 | 실제 외부 번역 API 호출과 fallback 가능한 저장 구조 |
| Exception | 공통 예외 응답 | 실패 응답 형식 일관화 |
| Swagger | OpenAPI 의존성 추가 및 API 문서 접근 가능 | API 문서화 근거 확보 |
| Test/HTTP | `./gradlew test` 통과, HTTP 데모 시나리오 검증 | 테스트와 수동 검증 모두 확보 |
| Tauri | 최소 위젯 API 연동, 가사 오버레이 이벤트 구조 | 백엔드 결과를 데스크톱 위젯으로 표시함 |
| Tauri/YouTube | 공식 iframe 앱 내부 재생 시도 및 `Error 153` 재현 | 실제 제약을 트러블슈팅으로 기록함 |

## 다음 작업 순서

| 우선순위 | 할 일 | 목표 | 최소 완료 기준 |
|---|---|---|---|
| 1 | Docker 빌드/실행 검증 | 로컬 실행 환경 증거 확보 | Docker build 또는 compose 실행 성공 |
| 2 | Swagger 핵심 API 수동 확인 | 문서화 화면에서 흐름 확인 | 회원가입/로그인/Track/Task/Lyrics/Translation 중 핵심 API 확인 |
| 3 | 발표용 데모 시나리오 정리 | 발표 중 헤매지 않게 순서 고정 | `http/kurostep-demo.http` 기준 5분 시나리오 작성 |
| 4 | 사용자별 권한 검증 보강 또는 문서화 | 인증/인가 한계 관리 | 보강 가능하면 테스트 추가, 아니면 보고서에 명시 |
| 5 | Tauri 위젯/가사 오버레이 시연 확인 | 백엔드와 데스크톱 위젯 연결 증거 확보 | 작업/곡/가사/번역 표시와 자막 ON/OFF 확인 |
| 6 | 최종 테스트 재실행 | 발표 전 안정성 확인 | `./gradlew test` 성공 |

## 현재 리스크 기록

- Tauri 로컬 번들 앱에서 YouTube iframe이 `tauri://localhost` origin으로 인식되어 `Error 153`이 발생한다.
- 참고 스킨 파일 분석 결과, YouTube IFrame Player API를 사용하면서 iframe 컨테이너를 `display: none` 처리하고 커스텀 플레이어 UI만 보여주는 구조를 확인했다.
- 로컬에 내려받은 `playlist_260404_0` 전체를 확인했고, 상세 분석은 `KuroStep_Reference_Playlist_Skin_Analysis.md`에 정리했다.
- 이 방식은 영상 화면과 영상 광고 UI를 숨길 수 있지만, YouTube 광고 자체를 제거하거나 제어하는 것은 아니다.
- 광고가 실제로 재생되면 숨겨진 iframe의 오디오가 들릴 수 있으며, 이 부분은 공식 플레이어 정책에 따르는 한계로 트러블슈팅에 기록한다.
- `저작권보호심의 제도와 동향 25년 3호` 자료를 참고해 유튜브 광고 제거, 광고 자동 스킵, 다운로드, 스트림 추출은 법적 리스크가 큰 항목으로 분리한다.
- 스트림 추출, 음원 다운로드, 광고 제거 기능은 공식 임베드 흐름이 아니므로 발표용 구현 범위로 잡지 않는다.
- 앱 내부 재생을 유지하려면 GitHub Pages 등 HTTPS로 배포된 프론트를 Tauri가 로드하는 구조를 추가 검토한다.
- 이후 백엔드 구현 중 발생하는 Security, JWT, JPA, Provider, Docker 문제도 같은 방식으로 증상/원인/해결 과정을 누적 기록한다.

## 지금 당장 할 1개 작업

Tauri 위젯에서 백엔드 데이터 표시와 가사 오버레이 ON/OFF를 확인하고, 그 다음 Docker 빌드/실행을 검증한다.
