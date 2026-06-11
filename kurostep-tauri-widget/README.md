# KuroStep Tauri Widget

재택 창작자가 오늘 작업, BGM, 플레이리스트, 재생 가사, 번역 메모를 작은 데스크톱 위젯으로 확인하는 KuroStep 클라이언트입니다.

현재 구조는 Tauri가 앱 창과 보조 위젯을 관리하고, 실제 화면은 GitHub Pages에 배포된 React UI를 iframe으로 불러오는 하이브리드 방식입니다.

## 폴더 구조

```txt
kurostep-tauri-widget/
  src-react/           # React/TypeScript UI 소스
  src/                 # Tauri shell, legacy reference, 앱 아이콘/정적 파일
  src-tauri/           # Tauri/Rust 앱 설정과 엔트리포인트
  design/mockups/      # 참고용 HTML 목업과 디자인 산출물
```

## 로컬 실행

```sh
npm install
npm run dev:react
npm run tauri:dev
```

## 빌드

```sh
npm run build:react
npm run tauri:build
```

현재 릴리즈 버전은 `0.2.3`입니다. macOS/Windows 배포 번들은 루트의 `.github/workflows/tauri-release.yml`에서 GitHub Actions로 생성합니다.

## Rust 설치

Rust가 없다면 먼저 설치가 필요합니다.

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

설치 후 새 터미널을 열거나 PATH를 다시 로드한 다음 실행 명령을 다시 사용하세요.
