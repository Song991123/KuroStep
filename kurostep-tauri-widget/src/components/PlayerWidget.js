import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function PlayerWidget(track) {
  if (!track) {
    return `
      <section class="widget-section now-playing">
        ${SectionHeader("NOW PLAYING")}
        <p class="state-message">아직 같이 걸을 곡이 없어요.</p>
      </section>
    `;
  }

  const playingClass = track.isPlaying ? " playing" : "";

  return `
    <section class="widget-section now-playing" aria-labelledby="now-playing-title">
      ${SectionHeader("NOW PLAYING")}
      <div class="player-area${playingClass}" title="${track.isPlaying ? "재생 중" : "작업 카드에 연결된 곡"}">
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
            <button class="action-button" type="button">YouTube 영상 보기</button>
            <button class="action-button subtitle-toggle" id="subtitle-toggle" type="button" aria-pressed="false">자막 OFF</button>
          </div>
        </div>
      </div>
    </section>
  `;
}
