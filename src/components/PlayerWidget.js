import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function PlayerWidget(track) {
  const playingClass = track.isPlaying ? " playing" : "";

  return `
    <section class="widget-section now-playing" aria-labelledby="now-playing-title">
      ${SectionHeader("NOW PLAYING", "+ 곡")}
      <div class="player-area${playingClass}" title="${track.isPlaying ? "재생 중" : "여기에 마우스를 올려보세요!"}">
        <div class="cat-tail" aria-hidden="true"></div>
        <div class="record" aria-label="재생 중인 레코드">
          <span class="record-label">
            <img class="paw-print" src="./assets/paw-print.svg" alt="" aria-hidden="true" />
          </span>
        </div>
        <div class="track-info">
          <h3 id="now-playing-title">${escapeHtml(track.title)}</h3>
          <p>${escapeHtml(track.artist)} · ${escapeHtml(track.playlistName)}</p>
          <div class="track-actions">
            <button class="action-button" type="button">현재곡 변경</button>
            <button class="action-button" type="button">링크 열기</button>
            <button class="action-button subtitle-toggle" id="subtitle-toggle" type="button" aria-pressed="false">자막 OFF</button>
          </div>
        </div>
      </div>
    </section>
  `;
}
