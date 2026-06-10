# KuroStep Progress Todo

## 문서 역할

이 문서는 KuroStep Spring Boot 백엔드 일정/Todo 관리 세션에서만 갱신한다.

- 오늘 백엔드에서 무엇을 검증할지 정한다.
- 마감까지 남은 백엔드 필수 작업을 보이게 한다.
- 지금 당장 할 1개 작업을 고른다.
- 일정이 밀리면 기능을 삭제하지 않고, 얇게 구현해서 검증 증거를 남기는 방향으로 조정한다.

## 현재 기준

- 현재 날짜: 2026-06-10
- 마지막 갱신: 2026-06-10 12:40 KST
- 마감: 2026-06-10 저녁 보고
- 현재 범위: KuroStep Spring Boot 백엔드 + Tauri 최소 위젯 연동
- 현재 전략: 기능을 삭제하지 않고, 실제 구현/검증 상태와 남은 리스크를 분리해서 기록한다.
- 건강 메모: 몸 상태가 좋지 않으므로 새 기능 확장보다 백엔드 검증, 보고서 반영, 시연 순서 정리를 우선한다.

## 현재 요약

KuroStep 백엔드는 테스트와 실제 HTTP 요청 기준으로 핵심 백엔드 MVP 흐름이 검증된 상태이다.
Tauri 최소 위젯은 Spring Boot API와 연결되어 작업 카드, 곡, 플레이리스트, 가사 라인, 번역 초안을 표시한다.
가사 오버레이는 별도 `lyrics` 창으로 현재 가사/번역을 전달하는 구조가 구현되어 있다.
YouTube 공식 iframe의 앱 내부 재생은 구현을 시도했으나 macOS Tauri WebView에서 `Error 153`이 재현되어 트러블슈팅 항목으로 기록한다.
GitHub Pages 배포와 백엔드 CI는 성공했고, AWS EC2 배포를 위한 Terraform/Docker/GitHub Actions 파일을 추가했다.
포폴용 공개 문서는 `docs/` 구조로 정리했고, 루트 `README.md`는 한국 포폴용 첫 화면 문서로 재작성했다.
Terraform 보안 파일(`tfstate`, `tfvars`, `.env`, SSH key 등)은 `.gitignore`로 차단했다.
EC2용 SSH 키와 로컬 `terraform.tfvars`는 준비했지만, 현재 로컬 AWS credential이 `InvalidClientTokenId`로 실패해 실제 `terraform plan/apply`는 AWS 인증 갱신 후 진행해야 한다.

WBS 시각화 파일:

- `docs/project-management/wbs-dashboard.html`

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
| 문서/보고 | 발표 자료 메모 생성 | 최소 구현 완료 | `docs/report/presentation-assets.md` | 백엔드 최신 완료 범위 반영 |
| 문서/보고 | 최종 보고서 일부 현실화 | 최소 구현 완료 | `docs/report/final-report.md` | Docker/Swagger 수동 확인 결과가 생기면 추가 반영 |
| 문서/보고 | 발표용 데모 시나리오 정리 | 진행 중 | `KuroStep/http/kurostep-demo.http` | Swagger 수동 확인 순서와 합치기 |
| Tauri | 최소 위젯 API 연동 | 최소 구현 완료 | `kurostep-tauri-widget/src/main.js` | 발표 시 백엔드 API 응답이 위젯에 표시되는 흐름 설명 |
| Tauri | 가사 오버레이 창 이벤트 연동 | 최소 구현 완료 | `kurostep-tauri-widget/src-tauri/src/lib.rs`, `src/lyrics.js` | 자막 ON/OFF와 현재 라인 전달 구조 설명 |
| Tauri | 앱 내부 YouTube iframe 플레이어 시도 | 트러블슈팅 기록 | `kurostep-tauri-widget/src/main.js`, 최종 보고서 15장 | `Error 153` 원인과 HTTPS 프론트 대안 설명 |
| 실행/배포 | 로컬 Dockerfile 구성 | 최소 구현 완료 | `KuroStep/Dockerfile`, `KuroStep/docker-compose.yml` | 필요 시 `docker compose up --build`로 확인 |
| 실행/배포 | EC2 운영 Docker Compose 구성 | 코드 준비 완료 | `KuroStep/Dockerfile.prod`, `KuroStep/docker-compose.prod.yml`, `.env.prod.example`, `application-prod.yaml` | AWS 서버에서 실행 확인 필요 |
| 실행/배포 | Terraform EC2 인프라 코드 | 코드 준비 완료 / AWS 인증 대기 | `infra/main.tf`, `variables.tf`, `outputs.tf`, `user-data.sh`, `terraform.tfvars.example` | AWS credential 갱신 후 `terraform plan/apply` |
| 실행/배포 | Terraform 보안 파일 차단 | 실제 반영 완료 | `.gitignore` | `terraform.tfstate`, `*.tfvars`, `.env`, SSH key Git 추적 금지 유지 |
| 실행/배포 | EC2 SSH 키/로컬 tfvars 준비 | 로컬 준비 완료 | `~/.ssh/kurostep_ec2`, `infra/terraform.tfvars` | AWS 인증 후 plan 실행 |
| 실행/배포 | GitHub Actions EC2 배포 workflow | 코드 준비 완료 | `.github/workflows/deploy-ec2.yml` | EC2 생성, GitHub Secrets 등록 후 수동 실행 |
| 실행/배포 | GitHub Pages 위젯 배포 | 실제 검증 완료 | `.github/workflows/pages.yml`, `https://song991123.github.io/KuroStep/` | EC2 HTTPS API 연결 필요 |
| 실행/배포 | 백엔드 CI | 실제 검증 완료 | `.github/workflows/backend-ci.yml`, GitHub Actions 성공 결과 | 발표 자료에 CI 통과 반영 |
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
| CI/CD | GitHub Pages 배포, 백엔드 CI, EC2 deploy workflow 작성 | GitHub 기반 자동화 구조를 설명할 수 있음 |
| AWS/IaC | Terraform으로 EC2, 보안그룹, Elastic IP 코드화 | 콘솔 수동 클릭이 아닌 코드 기반 인프라 관리 근거 |

## 다음 작업 순서

| 우선순위 | 할 일 | 목표 | 최소 완료 기준 |
|---|---|---|---|
| 1 | AWS credential 갱신 | Terraform 실행 준비 | `aws sts get-caller-identity` 성공 |
| 2 | Terraform plan/apply | EC2 서버 생성 | `infra` output으로 public IP 확인 |
| 3 | GitHub Secrets 등록 | EC2 자동 배포 준비 | `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, DB/JWT secret 등록 |
| 4 | EC2 deploy workflow 수동 실행 | Spring Boot + MySQL 컨테이너 실행 | GitHub Actions deploy 성공 |
| 5 | EC2 API 직접 확인 | 배포 서버 동작 증거 확보 | `http://EC2_PUBLIC_IP:8080/swagger-ui/index.html` 또는 `/api` 요청 확인 |
| 6 | HTTPS 후속 판단 | GitHub Pages와 API 연결 | 도메인/Nginx/Let's Encrypt 적용 여부 결정 |

## 현재 리스크 기록

- Tauri 로컬 번들 앱에서 YouTube iframe이 `tauri://localhost` origin으로 인식되어 `Error 153`이 발생한다.
- 참고 스킨 파일 분석 결과, YouTube IFrame Player API를 사용하면서 iframe 컨테이너를 `display: none` 처리하고 커스텀 플레이어 UI만 보여주는 구조를 확인했다.
- 로컬에 내려받은 `playlist_260404_0` 전체를 확인했고, 상세 분석은 `docs/design/reference-playlist-skin-analysis.md`에 정리했다.
- 이 방식은 영상 화면과 영상 광고 UI를 숨길 수 있지만, YouTube 광고 자체를 제거하거나 제어하는 것은 아니다.
- 광고가 실제로 재생되면 숨겨진 iframe의 오디오가 들릴 수 있으며, 이 부분은 공식 플레이어 정책에 따르는 한계로 트러블슈팅에 기록한다.
- `저작권보호심의 제도와 동향 25년 3호` 자료를 참고해 유튜브 광고 제거, 광고 자동 스킵, 다운로드, 스트림 추출은 법적 리스크가 큰 항목으로 분리한다.
- 스트림 추출, 음원 다운로드, 광고 제거 기능은 공식 임베드 흐름이 아니므로 발표용 구현 범위로 잡지 않는다.
- 앱 내부 재생을 유지하려면 GitHub Pages 등 HTTPS로 배포된 프론트를 Tauri가 로드하는 구조를 추가 검토한다.
- GitHub Pages는 HTTPS이므로 EC2 API가 HTTP만 제공하면 Mixed Content 정책에 걸릴 수 있다.
- EC2 배포 직후에는 `http://EC2_PUBLIC_IP:8080`로 직접 API를 확인하고, GitHub Pages와 연결하려면 HTTPS 설정이 필요하다.
- Terraform과 GitHub Actions 배포 코드는 준비됐지만 실제 AWS 적용은 AWS 인증 정보와 GitHub Secrets 등록이 필요하다.
- 현재 AWS CLI는 `InvalidClientTokenId`로 실패한다. 새 access key/secret key로 `aws configure`를 다시 실행해야 한다.
- EC2 deploy workflow는 서버와 GitHub Secrets가 없을 때 push마다 실패하지 않도록 `workflow_dispatch` 수동 실행 전용으로 바꿨다.
- 이후 백엔드 구현 중 발생하는 Security, JWT, JPA, Provider, Docker 문제도 같은 방식으로 증상/원인/해결 과정을 누적 기록한다.

## 지금 당장 할 1개 작업

AWS 콘솔에서 새 Access Key를 발급하고 로컬에서 `aws configure`를 다시 실행한 뒤 `aws sts get-caller-identity`로 인증을 확인한다.
