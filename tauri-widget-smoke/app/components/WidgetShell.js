export function WidgetShell(content) {
  return `
    <section class="widget-container">
      <header class="mac-header" data-tauri-drag-region>
        <div class="mac-dots" data-tauri-drag-region>
          <span class="mac-dot dot-red"></span>
          <span class="mac-dot dot-yellow"></span>
          <span class="mac-dot dot-green"></span>
        </div>
        <strong class="window-title" data-tauri-drag-region>KuroStep</strong>
        <button class="icon-button close-button" id="close-widget" type="button" aria-label="닫기">×</button>
      </header>
      <div class="widget-content">
        ${content}
      </div>
    </section>
  `;
}
