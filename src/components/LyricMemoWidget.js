import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function LyricMemoWidget(lyricMemo) {
  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="translation-memo-title">
      ${SectionHeader("TRANSLATION MEMO", "라인 선택")}
      <p class="memo-context" id="translation-memo-title">
        <span>${escapeHtml(lyricMemo.timestamp)}</span>
        "${escapeHtml(lyricMemo.line)}"
      </p>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo)}</textarea>
      <p class="memo-save-state" id="memo-save-state" aria-live="polite"></p>
      <div class="button-row">
        <button class="action-button" type="button">메모 편집</button>
        <button class="action-button primary" id="save-memo" type="button">저장</button>
      </div>
    </section>
  `;
}
