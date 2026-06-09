import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function PlaylistWidget(tracks) {
  const items = tracks
    .map((track) => {
      const playing = track.isPlaying ? " playing" : "";
      return `
        <li class="playlist-item${playing}">
          <span class="playlist-track">${escapeHtml(track.title)}</span>
          <span class="playlist-duration">${escapeHtml(track.duration)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="widget-section playlist-widget" aria-labelledby="playlist-title">
      ${SectionHeader("PLAYLIST", "관리")}
      <ol class="playlist-list" id="playlist-title">
        ${items}
      </ol>
      <div class="button-row">
        <button class="action-button" type="button">+ 플레이리스트</button>
        <button class="action-button" type="button">+ 곡 추가</button>
        <button class="action-button" type="button">순서 편집</button>
      </div>
    </section>
  `;
}
