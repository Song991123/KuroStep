import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function LyricMemoWidget(lyricMemo) {
  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="lyric-memo-title">
      ${SectionHeader("LYRIC", "라인 선택")}
      <div class="lyric-display" id="lyric-memo-title" aria-live="polite">
        <span class="lyric-time">${escapeHtml(lyricMemo.timestamp)}</span>
        <div class="lyric-lines">
          <p class="lyric-line">"${escapeHtml(lyricMemo.line)}"</p>
          <p class="lyric-translation">「${escapeHtml(lyricMemo.translation)}」</p>
        </div>
      </div>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo)}</textarea>
      <div class="button-row">
        <button class="action-button" type="button">메모 편집</button>
        <button class="action-button primary" type="button">저장</button>
      </div>
    </section>
  `;
}
