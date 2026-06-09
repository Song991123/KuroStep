import { SectionHeader } from "./SectionHeader.js";
import { escapeHtml } from "./html.js";

export function LyricMemoWidget(lyricMemo) {
  return `
    <section class="widget-section lyric-memo-widget" aria-labelledby="lyric-memo-title">
      ${SectionHeader("LYRIC MEMO", "라인 선택")}
      <blockquote class="lyric-box" id="lyric-memo-title">
        ${escapeHtml(lyricMemo.line)}
      </blockquote>
      <label class="memo-label" for="translation-memo">한국어 번역 메모</label>
      <textarea class="memo-input" id="translation-memo" rows="2">${escapeHtml(lyricMemo.memo)}</textarea>
      <div class="button-row">
        <button class="action-button" type="button">메모 편집</button>
        <button class="action-button primary" type="button">저장</button>
      </div>
    </section>
  `;
}
