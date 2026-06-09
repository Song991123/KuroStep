# KuroStep Tauri Widget

재택 창작자가 오늘 작업, BGM, 플레이리스트, 재생 가사, 번역 메모를 한 창에서 확인하는 작은 macOS Tauri 데스크톱 위젯입니다.

## 폴더 구조

```txt
kurostep-tauri-widget/
  src/                 # 실제 위젯 UI
    components/        # UI 컴포넌트 소스
    assets/            # 위젯에서 쓰는 SVG/이미지
  src-tauri/           # Tauri/Rust 앱 설정과 엔트리포인트
  design/mockups/      # 참고용 HTML 목업과 디자인 산출물
```

## 실행

```sh
npm install
npm run dev
```

Rust가 없다면 먼저 설치가 필요합니다.

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

설치 후 새 터미널을 열거나 PATH를 다시 로드한 다음 위 실행 명령을 다시 사용하세요.
