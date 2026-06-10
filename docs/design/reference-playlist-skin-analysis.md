# KuroStep Reference Playlist Skin Analysis

분석 대상: `playlist_260404_0`

사용자가 제공한 구글드라이브 자료를 로컬 폴더에 내려받아 확인한 결과, 해당 스킨은 YouTube 음원 추출이나 광고 스킵 구현이 아니라 **YouTube IFrame Player API + 숨김 iframe + 커스텀 플레이어 UI** 구조이다.

## 확인한 핵심 파일

- `playlist_260404_0/list.skin.php`
- `playlist_260404_0/list.song.skin.php`
- `playlist_260404_0/list.playlist.skin.php`
- `playlist_260404_0/player/player.js`
- `playlist_260404_0/player/player.css`

## 구조 요약

### 1. YouTube API 스크립트 주입

`list.skin.php`에서 최상위 문서에 YouTube IFrame API를 삽입한다.

```js
tag.src = "https://www.youtube.com/iframe_api";
tag.id = "player_youtube_api";
```

그 뒤 `player/player.js`를 삽입해 커스텀 플레이어 로직을 실행한다.

### 2. 숨겨진 YouTube 플레이어 컨테이너 생성

`list.skin.php`에서 최상위 문서 body에 `playlist_bgm_box`를 추가한다.

```js
var box = $('<div>', { id: 'playlist_bgm_box' });
box.appendTo(parentBody);
```

`player.css`에서 해당 컨테이너를 숨긴다.

```css
#playlist_bgm_box {
  display: none;
}
```

### 3. 공식 IFrame Player API로 재생

`player.js`에서 숨겨진 컨테이너에 YouTube 플레이어를 생성한다.

```js
playlist_player = new YT.Player('playlist_bgm_box', {
    height: '360',
    width: '640',
    playerVars: {
        listType: 'playlist',
        disablekb: 1,
        rel: 0,
        loop: 0,
        autoplay: 0,
        index: 0,
        enablejsapi: 1,
    },
    autoplay: true,
    events: {
        'onReady': function (event) { ... },
        'onError': function (event) { ... },
        'onStateChange': onPlayerStateChange,
    },
});
```

### 4. 자체 플레이어 UI

`player.js`는 YouTube 공식 API 메서드를 사용해 자체 UI를 제어한다.

- `playVideo()`
- `pauseVideo()`
- `nextVideo()`
- `previousVideo()`
- `playVideoAt(index)`
- `loadPlaylist(...)`
- `cuePlaylist(...)`
- `seekTo(...)`
- `getCurrentTime()`
- `getDuration()`
- `setVolume(...)`
- `mute()`
- `unMute()`
- `setShuffle(...)`
- `setLoop(...)`

### 5. 재생바와 가사 싱크

`playlist_displayInfo()`가 1초마다 현재 재생 시간을 읽고 UI를 갱신한다.

```js
var current = playlist_player.getCurrentTime();
var duration = playlist_player.getDuration();
var currentPercent = (current && duration ? current*100/duration : 0);
```

가사 화면이 활성화되어 있으면 현재 초 단위 시간을 기준으로 가사 라인을 활성화한다.

```js
highlight_lyric(Math.floor(current));
```

### 6. YouTube URL 처리

`list.song.skin.php`, `list.playlist.skin.php`는 `youtu.be`, `youtube.com/watch?v=` 형식에서 video id를 추출한다.

직접 음원 스트림을 가져오거나 mp3/mp4로 변환하는 코드는 확인되지 않았다.

## 광고 관련 확인 결과

확인된 것:

- YouTube iframe 화면은 `display: none`으로 숨겨진다.
- 사용자에게는 커스텀 플레이어 UI만 보인다.
- 그래서 화면 광고는 보이지 않는 구조이다.

확인되지 않은 것:

- 광고 DOM 탐지
- 광고 자동 스킵
- 광고 버튼 자동 클릭
- 광고 구간 자동 음소거
- YouTube 음원 스트림 추출
- mp3/mp4 다운로드
- 자체 광고로 YouTube 광고 대체

## KuroStep에 참고할 부분

참고 가능:

- YouTube 공식 IFrame Player API 기반 재생
- 숨겨진 플레이어 컨테이너와 커스텀 UI 분리
- 재생/정지/이전/다음/반복/셔플/음소거/볼륨
- 진행바 드래그 시 `seekTo()`
- `getCurrentTime()` 기반 가사 싱크
- YouTube URL에서 video id 추출

주의할 부분:

- `display: none` 처리된 YouTube iframe은 공식 정책과 충돌할 여지가 있으므로 발표에서는 "광고 제거"가 아니라 "참고 스킨 분석 결과"와 "구현 리스크"로 설명한다.
- 광고가 실제로 재생되는 경우 오디오 광고가 들릴 가능성은 배제할 수 없다.
- 광고 자동 스킵이나 자동 음소거는 구현하지 않는다.

## 결론

이 스킨은 광고 차단기가 아니라 **공식 YouTube IFrame Player API를 숨겨진 컨테이너에서 실행하고, 별도의 커스텀 UI로 제어하는 플레이어 스킨**이다.

KuroStep은 이 구조에서 재생 제어와 가사 싱크 아이디어를 참고하되, 광고 제거나 우회 기능은 구현 범위에서 제외한다.
