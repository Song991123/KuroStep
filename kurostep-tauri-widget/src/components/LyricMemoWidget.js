import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function LyricMemoWidget(lyricMemo) {
  if (!lyricMemo) {
    return `
      <section class="widget-section lyric-memo-widget">
        ${SectionHeader("번역 메모")}
        <p class="state-message">곡을 재생하면 현재 가사와 한국어 메모를 만질 수 있다냥.</p>
      </section>
    `;
  }

  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="translation-memo-title">
      ${SectionHeader("번역 메모")}
      <p class="memo-context" id="translation-memo-title">
        <span>${escapeHtml(lyricMemo.timestamp)}</span>
        "${escapeHtml(lyricMemo.line)}"
      </p>
      <label class="memo-label" for="translated-text">한국어 번역문</label>
      <textarea class="memo-input" id="translated-text" rows="2">${escapeHtml(lyricMemo.translation || "")}</textarea>
      <label class="memo-label" for="translation-memo">개인 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo || "")}</textarea>
      <p class="memo-save-state" id="memo-save-state" aria-live="polite"></p>
      <div class="button-row">
        <button class="action-button" type="button">초안 다시</button>
        <button class="action-button primary" id="save-memo" type="button">저장</button>
      </div>
    </section>
  `;
}
