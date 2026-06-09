export function WidgetShell(content) {
  return `
    <section class="widget-container">
      <header class="mac-header" id="window-drag-region" data-tauri-drag-region>
        <div class="mac-dots">
          <button class="mac-dot dot-red" id="window-close" type="button" aria-label="닫기"></button>
          <button class="mac-dot dot-yellow" id="window-minimize" type="button" aria-label="최소화"></button>
          <button class="mac-dot dot-green" id="window-zoom" type="button" aria-label="확대 또는 복원"></button>
        </div>
        <strong class="window-title" data-tauri-drag-region>KuroStep</strong>
      </header>
      <div class="widget-content">
        ${content}
      </div>
    </section>
  `;
}
