# 릴리즈 안내

## 🚀 배포 구성

| 영역 | 방식 |
|---|---|
| React UI | GitHub Pages |
| Backend API | AWS EC2 + Docker Compose |
| Infrastructure | Terraform |
| Desktop App | Tauri GitHub Actions release |
| CI | GitHub Actions |

## GitHub Pages

React UI는 `kurostep-tauri-widget/dist-react`로 빌드한 뒤 GitHub Pages에 배포합니다.

```bash
cd kurostep-tauri-widget
npm ci
npm run build:react
```

배포 워크플로:

```text
.github/workflows/pages.yml
```

## Backend API

로컬 실행:

```bash
cd KuroStep
./gradlew bootRun
```

테스트:

```bash
cd KuroStep
./gradlew test
```

운영 배포 워크플로:

```text
.github/workflows/deploy-ec2.yml
```

## 데스크톱 릴리즈

Tauri 앱은 GitHub Actions에서 macOS와 Windows 번들을 만듭니다.

```text
.github/workflows/tauri-release.yml
```

0.1 핫픽스 릴리즈는 기존 `v0.1.0`을 삭제해서 같은 태그를 재사용하지 않고, 새 태그로 빌드합니다. `v0.1.0`은 2026-06-12에 `844955b` 기준으로 만들어진 이전 산출물입니다. `v0.1.1`은 기본 실행은 가능했지만 재생 시간, synced lyrics 선택, 작업 발자국 동기화, 가사 오버레이 클릭 영역에서 QA 차단 이슈가 확인되어 `v0.1.2`가 사용자가 받아야 할 기준 릴리즈입니다.

릴리즈 빌드 전 확인할 항목:

- `kurostep-tauri-widget/package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` 버전이 모두 `0.1.2`인지 확인합니다.
- GitHub Pages가 최신 React 번들을 배포했는지 확인합니다. 데스크톱 앱은 `shell.js`의 `v=20260621-v012` 캐시 키로 최신 React UI를 다시 불러옵니다.
- EC2 API 배포 workflow가 main 최신 커밋에서 성공했는지 확인합니다. 특히 LRCLIB 결과에서 plain lyrics보다 synced lyrics가 있는 후보를 우선 선택하는지 확인합니다.
- 배포 API에서 같은 YouTube `sourceId`를 다시 저장했을 때 `LEMONADE / aespa`로 메타데이터가 갱신되는지 확인합니다.
- Tauri 앱은 로컬 `shell.html`을 열지만 실제 제품 UI는 GitHub Pages React iframe을 로드하므로, 데스크톱 릴리즈 전에 Pages와 EC2를 먼저 맞춥니다.
- GitHub Release의 자동 `Source code` 파일은 설치 파일이 아닙니다. README와 포트폴리오 문서에는 사용자가 받아야 할 `.dmg`, `.msi`, `.exe` asset 기준으로 안내합니다.
- macOS 빌드는 ad-hoc signing 상태라 Gatekeeper 경고가 날 수 있습니다. 포트폴리오 문서에는 Finder에서 Control-click > Open으로 여는 테스트 방법을 함께 둡니다.
- 빌드 후에는 메인 플레이어 창, 작업 발자국 창, 가사 오버레이 창이 분리되는지 실제 앱에서 다시 확인합니다.

0.1.2 릴리즈 빌드:

```text
Actions > Build KuroStep Desktop Release > Run workflow
version: v0.1.2
branch: main
```

Release assets에서 받을 파일:

- macOS: `.dmg`
- Windows: `.msi` 또는 `.exe`

GitHub가 자동으로 표시하는 `Source code(zip/tar.gz)`는 저장소 스냅샷입니다. 일반 사용자가 실행하는 설치 파일이 아닙니다.

## 0.1 핫픽스 검증

0.1 핫픽스는 GitHub Pages React UI가 먼저 배포된 뒤 데스크톱 앱에서 같은 화면을 불러오는지 확인합니다. Tauri 앱은 로컬 `shell.html`을 열고, 실제 제품 UI는 GitHub Pages React 화면을 iframe으로 로드합니다.

배포 후 확인할 항목:

- GitHub Pages에서 로그인 후 YouTube 링크 버튼이 `준비 중`에 고정되지 않고 `링크 불러오기`로 활성화되는지 확인합니다.
- aespa `LEMONADE` 공식 MV를 넣었을 때 곡명이 `LEMONADE`, 아티스트가 `aespa`로 정리되고 가사가 표시되는지 확인합니다.
- Tauri 앱에서 메인 플레이어 창, 작업 발자국 창, 가사 오버레이 창이 각각 분리되어 보이는지 확인합니다.
- 플레이리스트 행의 총 시간이 플레이어 총 시간과 같은 값으로 갱신되는지 확인합니다.
- 재생 시간이 진행될 때 현재 가사 줄이 실제로 바뀌는지 확인합니다.
- 할 일을 추가했을 때 작업 발자국 창에 바로 반영되는지 확인합니다.
- 현재 가사 저장 후 작업 발자국 창의 가사 기록에 바로 나타나는지 확인합니다.
- 가사 오버레이는 보이는 글자 영역만 드래그/클릭 대상이고, 투명 여백이 넓게 마우스를 잡아먹지 않는지 확인합니다.
- 작업 발자국 ON/OFF, 가사 오버레이 ON/OFF, 설정 뒤로가기, 앱 종료 흐름을 실제 데스크톱 앱에서 확인합니다.
- README의 데스크톱 릴리즈 링크가 사용자가 받을 설치 파일이 있는 릴리즈를 가리키는지 확인합니다.

## macOS Gatekeeper

현재 macOS 앱은 포트폴리오 테스트용 ad-hoc signing 상태입니다. Apple Developer ID notarization을 거치지 않았기 때문에 일부 환경에서는 아래 경고가 뜰 수 있습니다.

```text
Apple은 KuroStep.app에 악성 코드가 없음을 확인할 수 없습니다.
```

테스트 실행 방법:

1. DMG를 열고 `KuroStep.app`을 Applications 폴더로 이동합니다.
2. Finder에서 Control-click > Open으로 실행합니다.
3. 그래도 막히면 아래 명령을 실행합니다.

```bash
xattr -rd com.apple.quarantine "/Applications/KuroStep.app"
```

정식 배포 단계에서는 Apple Developer Program 가입 후 Developer ID signing과 notarization을 적용할 예정입니다.

## 로컬 개발 서버 관리

개발 중 Vite, Spring Boot, Tauri dev 서버가 동시에 켜지면 MacBook 부하가 커질 수 있습니다. 작업을 마치기 전에는 아래 포트를 확인합니다.

```bash
lsof -nP -iTCP:5173 -iTCP:5174 -iTCP:5175 -iTCP:5177 -iTCP:8080 -sTCP:LISTEN
```

Codex 작업 시에는 필요한 서버만 짧게 띄우고, 검증 후 종료하는 것을 원칙으로 합니다.
