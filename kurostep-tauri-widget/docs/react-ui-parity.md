# KuroStep React UI Parity Notes

## 기준 UI
- 기준 커밋: `a296bb7 Sync saved lyric pieces across widgets`
- 현재 적용 버그픽스 커밋: `ddae0f6 Patch vanilla widget partial refresh bugs`
- React 실험 실패 브랜치: `react-tsx-experiment`
- 새 이식 브랜치: `react-ui-parity`

## 절대 지킬 것
- 새 디자인 금지
- 기존 `src/styles.css` 토큰과 className 유지
- `embedded=1`에서는 내부 mac-header가 아니라 `embedded-content`만 렌더
- Tauri shell은 그대로 유지
- 폰트 스케일 유지: 본문 10~13px, 제목 13~24px 범위
- 카드/위젯 구조 유지: `widget-group`, `widget-section`, `sub-section`, `player-area`, `todo-list`, `playlist-list`

## 기존 구조 분해
- Shell: `widgetShell(content, options)`
- Auth: `auth-screen > auth-brand > auth-switch > auth-form`
- Main: `embedded-content > app-status > global-widget-controls > widget-stack`
- Task/Paw: `task-paw-widget lyric-paw-widget`
- Music: `music-player-widget > now-playing > youtube link > playlist`
- Lyrics: `lyrics-widget > lyrics-preview`

## React 이식 원칙
- CSS는 `src/styles.css`를 그대로 import/copy한다.
- JSX의 className은 기존 HTML class와 동일하게 둔다.
- 화면 전체를 갈아엎는 갱신 금지: 플레이어 iframe은 독립 컴포넌트로 유지한다.
- 투두/메모/플레이리스트 상태 변경은 각각 해당 컴포넌트 state만 갱신한다.

## 2026-06-10 작업 절차
1. 기존 Vanilla 안정판 구조를 먼저 분석한다.
   - `ensureWorkspaceData`: 로그인 사용자 기준 작업 카드, 플레이리스트, 현재 트랙을 보장한다.
   - `registerTrackFromInputs`: YouTube 단일 영상/플레이리스트 링크를 트랙으로 만들고 플레이리스트에 붙인다.
   - `refreshTaskPawWidgetDom`, `refreshPlaylistWidgetDom`, `updatePlaybackDom`: 전체 재렌더 대신 필요한 영역만 갱신한다.
2. React는 새 UI를 만들지 않고 기존 CSS와 className을 그대로 사용한다.
3. 샘플 데이터는 제거하고 백엔드 API로 로그인 후 실제 DB 데이터를 불러온다.
4. 플레이어/가사 동기화는 별도 단계로 두고, 먼저 Auth, Task, Playlist, Track CRUD 흐름을 고정한다.
5. 매 단계마다 `npm run build:react`, `npx tsc --noEmit`, Playwright 캡처로 검증한다.

## 현재 React 이식 완료 범위
- 로그인/회원가입 화면: 기존 `auth-screen` 구조 유지
- 로그인 유지: `kurostep.auth` localStorage 기반
- 백엔드 API 연결: 로컬은 `localhost:8080`, GitHub Pages/Tauri는 `https://54-116-185-226.sslip.io`
- 작업실 초기화: 오늘 작업 카드 없으면 기본 작업 생성, 플레이리스트 없으면 기본 플레이리스트 생성
- 오늘 할 일 목록 표시: 실제 `tasks/today` 결과 표시
- 작업 상태 변경: `TODO`, `DOING`, `DONE` 서버 반영
- 작업 삭제: 서버 삭제 후 목록 갱신
- YouTube 단일 링크 추가: 메타데이터 추출 후 트랙 생성/플레이리스트 추가
- YouTube 플레이리스트 링크 추가: 백엔드 preview 호출 후 사용자가 넣을 곡 수 선택
- 플레이리스트 표시: 10곡 단위 페이징
- 트랙 선택: 현재 작업 카드의 currentPlaylistTrack 갱신
- 트랙 제거: 플레이리스트에서 해당 곡 제거
- 셔플: 서버 reorder API 호출

## 아직 React로 옮기는 중인 범위
- YouTube IFrame 실제 재생 제어
- 트랙 전환 시 iframe 보존과 버퍼링 최소화
- LRCLIB 가사 fetch, localStorage 캐시, 선번역/선준비 큐
- 현재 줄 저장과 번역 메모 저장/삭제
- 가사 오버레이 별도 창 동기화
- Tauri shell window minimize/exit/settings 실제 invoke 연결
