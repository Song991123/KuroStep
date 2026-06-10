# KuroStep React UI Parity Notes

## 기준 UI
- 기준 커밋: `a296bb7 Sync saved lyric pieces across widgets`
- 현재 적용 버그픽스 커밋: `ddae0f6 Patch vanilla widget partial refresh bugs`
- React 실험 실패 브랜치: `react-tsx-experiment`
- 새 이식 브랜치: `react-ui-parity`
- main 병합 커밋: `55dd4dc`
- 최신 React 수정 커밋: `345dfab Fix playlist import flow in React widget`

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
- 플레이리스트 드래그 앤 드롭 순서 변경: 서버 reorder API 호출
- YouTube IFrame 플레이어: `YT.Player`를 React ref로 보관해서 재렌더와 분리
- 재생/일시정지, 이전/다음, 10초 이동, 진행바 seek, 반복, 볼륨 조절
- 메인 위젯 순서: `BGM 턴테이블 -> 가사 창`, 작업 발자국은 보조 위젯 영역으로 분리
- LRCLIB 가사 fetch 및 localStorage 캐시
- 플레이리스트 현재/다음 곡 가사 prewarm
- 재생 위치 기반 현재 가사 줄 선택
- 현재 줄 번역 auto-draft 조회/생성
- 번역문/작업 메모 저장, 삭제
- 현재 가사 조각 localStorage 저장, 삭제
- 가사 오버레이 `set_lyrics_visible` Tauri/shell 메시지 연결
- 작업 발자국 창 `set_paw_visible` Tauri/shell 메시지 연결
- 설정 화면: 로그인 계정, 닉네임, 로그아웃, 앱 종료
- shell `auth_state`, `open_settings` 메시지 연동
- Tauri shell iframe URL을 `view=main/paw` 쿼리 기반 React 라우팅으로 전환
- Tauri shell 메시지 검증 origin을 배포 URL 고정값이 아니라 실제 iframe content URL 기준으로 계산
- GitHub Pages 배포를 정적 `src` 업로드에서 `npm run build:react` 산출물(`dist-react`) 업로드로 전환
- 로컬 검증 완료: `view=main`은 BGM 턴테이블/가사 창만 렌더, `view=paw`는 작업 발자국만 렌더
- 로컬 shell 검증 완료: `shell.html?view=main&content=로컬 React URL`에서 로그인 후 shell 설정/종료 버튼 노출 확인
- 단일 YouTube 영상 링크 추가 검증 완료: 트랙 생성, 플레이리스트 추가, 현재 트랙 지정, 가사 fetch 요청 확인
- YouTube 플레이리스트 링크 추가 검증 완료: preview API 호출, 사용자가 입력한 수량만큼 트랙 생성/추가 확인
- 현재 트랙이 있는 상태에서 새 영상 링크 추가 검증 완료: 플레이리스트에는 곡이 추가되고 NOW PLAYING 현재 곡은 유지
- React dev 환경의 중복 생성 원인이던 `React.StrictMode` 제거
- Tauri dev 검증 완료: 임시 content URL로 로컬 React 화면을 shell 안에 표시 확인
- GitHub Pages 검증 완료: `https://song991123.github.io/KuroStep/`가 React 빌드 화면을 로드
- Tauri shell 검증 완료: 로컬 shell이 GitHub Pages React iframe을 로드
- 플레이리스트 링크 등록 수정 완료: `window.prompt()` 제거, 앱 내부 확인 패널에서 담을 곡 수 선택
- 플레이리스트 preview 병목 수정 완료: 백엔드는 앞 10곡 preview만 병렬 생성하고 noembed timeout을 3초로 제한
- 트랙 제거 후 상태 동기화 수정 완료: 현재곡 삭제 시 작업 발자국의 `currentPlaylistTrackId` 표시까지 갱신
- API 주소 주입 개선: `VITE_KUROSTEP_API_BASE_URL`을 지원하여 로컬 검증 시 `18080` 같은 별도 포트를 확실히 지정 가능

## 2026-06-11 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 |
| `npm run build:react` | 통과 |
| `./gradlew test` | 통과 |
| GitHub Pages 배포 | 성공, commit `345dfab` |
| Backend CI | 성공, commit `345dfab` |
| 로컬 React 회원가입 | 성공 |
| 플레이리스트 preview 패널 | 성공 |
| 플레이리스트 2곡 담기 | 성공 |
| 트랙 선택 | 성공 |
| 트랙 제거 | 성공 |
| Tauri shell iframe 로드 | 성공 |

## 남은 범위

- 실제 YouTube IFrame 재생은 영상별 embed 허용 여부에 영향을 받는다. Rick Astley 공식 영상처럼 iframe에서 “동영상을 재생할 수 없음”이 뜨는 경우가 있다.
- 가사 오버레이 창에서 `lyrics:update` 이벤트 수신 UI는 추가 장시간 검증이 필요하다.
- LRCLIB가 한국곡/특정 영상 가사를 못 찾을 때 사용자 입력 가사 등록 대안이 필요하다.
- EC2 API는 인프라가 1대만 존재하지만, 현재 Docker MySQL volume 비밀번호 불일치 이슈가 남아 있어 배포 API 로그인 검증 전 운영 조치가 필요하다.
