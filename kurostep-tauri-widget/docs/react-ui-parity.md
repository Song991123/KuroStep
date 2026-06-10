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
