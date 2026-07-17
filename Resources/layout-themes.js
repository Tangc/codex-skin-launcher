(() => {
  "use strict";

  const API_NAME = "__codexSkinLayoutEngine";
  if (globalThis[API_NAME]) return;

  const HOST_ID = "codex-skin-layout-host";
  const STYLE_ID = "codex-skin-layout-style";
  const THEMES = new Set(["original", "wechat", "feishu", "qq2007"]);
  const state = {
    config: { enabled: true, layoutTheme: "original", quotaBarEnabled: false },
    quota: { status: "loading", result: null, message: "正在读取 Codex 额度" },
    host: null,
    observer: null,
    refreshTimer: 0,
    clockTimer: 0,
    quotaTimer: 0,
  };

  const labels = {
    wechat: "微信式工作台",
    feishu: "飞书式工作台",
    qq2007: "QQ 2007 复古工作台",
  };

  const icons = {
    brand: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="5" width="24" height="22" rx="8"/><path d="M10 14h12M10 19h8"/><circle cx="12" cy="10" r="1"/><circle cx="20" cy="10" r="1"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
    files: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h6l2 2h8v10H4z"/></svg>`,
    terminal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 8 4 4-4 4M12 16h6"/></svg>`,
    diff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14M5 8l3-3 3 3M13 16l3 3 3-3"/></svg>`,
    browser: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>`,
  };

  const actionLabels = {
    newTask: ["new task", "new chat", "新任务", "新建任务"],
    files: ["files", "文件"],
    terminal: ["terminal", "终端"],
    diff: ["diff", "review changes", "changes", "更改", "差异"],
    browser: ["browser", "浏览器"],
    settings: ["settings", "preferences", "设置", "偏好设置"],
  };

  function validHex(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function normalize(input) {
    const config = input && typeof input === "object" ? input : {};
    const requested = typeof config.layoutTheme === "string" ? config.layoutTheme : "original";
    return {
      enabled: config.enabled !== false,
      layoutTheme: THEMES.has(requested) ? requested : "original",
      quotaBarEnabled: config.quotaBarEnabled === true,
      accentColor: validHex(config.accentColor, "#7C9CFF"),
      backgroundColor: validHex(config.backgroundColor, "#0D1117"),
      foregroundColor: validHex(config.foregroundColor, "#E8EDF5"),
    };
  }

  function shellMarkup() {
    return `
      <div class="quota-bar" data-level="unknown" data-status="loading" role="progressbar" aria-label="Codex 剩余额度" aria-valuemin="0" aria-valuemax="100">
        <div class="quota-track"><div class="quota-fill"></div></div>
        <div class="quota-popover" role="status">
          <strong data-field="quota-summary">正在读取 Codex 额度…</strong>
          <span data-field="quota-detail">额度变化后会自动更新</span>
          <small data-field="quota-extra"></small>
        </div>
      </div>
      <div class="shell" role="presentation">
        <header class="topbar">
          <div class="identity">
            <span class="brand-icon">${icons.brand}</span>
            <span class="brand-copy"><strong>Codex</strong><small data-field="theme">工作台</small></span>
          </div>
          <nav class="toolbar" aria-label="Codex 快捷工具">
            <button type="button" data-action="newTask">${icons.plus}<span>新任务</span></button>
            <button type="button" data-action="files">${icons.files}<span>文件</span></button>
            <button type="button" data-action="terminal">${icons.terminal}<span>终端</span></button>
            <button type="button" data-action="diff">${icons.diff}<span>变更</span></button>
            <button type="button" data-action="browser">${icons.browser}<span>浏览器</span></button>
          </nav>
          <div class="window-meta"><span class="connection-dot"></span><span data-field="clock">--:--</span><button type="button" data-action="settings" aria-label="设置">${icons.settings}</button></div>
        </header>

        <aside class="right-dock" aria-label="Codex 任务信息栏">
          <section class="assistant-card">
            <div class="assistant-avatar">${icons.brand}</div>
            <div><strong>Codex 小蓝</strong><small><span class="presence-dot"></span> 已连接</small></div>
          </section>
          <section class="task-card">
            <p class="eyebrow">当前任务</p>
            <h2 data-field="title">Codex</h2>
            <p data-field="location">本地工作区</p>
          </section>
          <section class="detail-card">
            <p class="eyebrow">工作状态</p>
            <dl>
              <div><dt>布局</dt><dd data-field="theme">工作台</dd></div>
              <div><dt>连接</dt><dd>本机 CDP</dd></div>
              <div><dt>注入</dt><dd>实时同步</dd></div>
            </dl>
          </section>
          <section class="tips-card"><strong>快捷入口</strong><p>顶部工具会转到 Codex 对应功能；若客户端改版，原有界面仍可正常使用。</p></section>
        </aside>

        <footer class="statusbar">
          <span><i class="status-led"></i>Codex UI Shell 已启用</span>
          <span data-field="status">任务列表 · 对话区 · 工具区</span>
          <span data-field="clock">--:--</span>
        </footer>
        <div class="toast" role="status" aria-live="polite"></div>
      </div>`;
  }

  function shadowStyles() {
    return `
      :host { all: initial; --accent: #7c9cff; --fg: #e8edf5; --bg: #0d1117; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; color: var(--shell-fg); }
      *, *::before, *::after { box-sizing: border-box; }
      button { font: inherit; }
      svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .shell { display: none; --top: 48px; --right: 252px; --bottom: 26px; --shell-bg: rgb(20 25 35 / .94); --shell-panel: rgb(29 35 47 / .92); --shell-fg: #eef3fa; --shell-muted: #9ba8ba; --shell-border: rgb(255 255 255 / .12); --shell-shadow: 0 10px 35px rgb(0 0 0 / .22); color: var(--shell-fg); }
      :host([data-layout-active="true"]) .shell { display: block; }
      .topbar, .right-dock, .statusbar { position: fixed; z-index: 900; pointer-events: auto; }
      .topbar { inset: 0 0 auto 0; height: var(--top); display: flex; align-items: center; gap: 18px; padding: 0 14px; background: var(--shell-bg); border-bottom: 1px solid var(--shell-border); box-shadow: var(--shell-shadow); }
      .identity { display: flex; align-items: center; gap: 9px; min-width: 176px; }
      .brand-icon { width: 30px; height: 30px; display: grid; place-items: center; color: var(--accent); }
      .brand-icon svg { width: 28px; height: 28px; }
      .brand-copy { display: flex; align-items: baseline; gap: 7px; white-space: nowrap; }
      .brand-copy strong { font-size: 14px; letter-spacing: .02em; }
      .brand-copy small { color: var(--shell-muted); font-size: 11px; }
      .toolbar { display: flex; align-items: stretch; align-self: stretch; min-width: 0; overflow: hidden; }
      .toolbar button, .window-meta button { appearance: none; border: 0; color: inherit; background: transparent; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
      .toolbar button { min-width: 68px; padding: 0 10px; font-size: 12px; border-inline: 1px solid transparent; }
      .toolbar button:hover, .window-meta button:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); color: color-mix(in srgb, var(--accent) 75%, white); }
      .window-meta { margin-left: auto; display: flex; align-items: center; gap: 9px; color: var(--shell-muted); font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .window-meta button { width: 30px; height: 30px; border-radius: 8px; }
      .connection-dot, .presence-dot, .status-led { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #4bd27b; box-shadow: 0 0 0 3px rgb(75 210 123 / .15); }
      .right-dock { top: var(--top); right: 0; bottom: var(--bottom); width: var(--right); padding: 14px; overflow: auto; background: var(--shell-panel); border-left: 1px solid var(--shell-border); box-shadow: -12px 0 30px rgb(0 0 0 / .12); }
      .right-dock section { border: 1px solid var(--shell-border); background: color-mix(in srgb, var(--shell-panel) 88%, transparent); border-radius: 12px; padding: 13px; margin-bottom: 11px; }
      .assistant-card { display: flex; align-items: center; gap: 11px; }
      .assistant-card strong { display: block; font-size: 13px; }
      .assistant-card small { display: flex; align-items: center; gap: 6px; margin-top: 5px; color: var(--shell-muted); font-size: 11px; }
      .assistant-avatar { width: 48px; height: 48px; display: grid; place-items: center; color: white; border-radius: 14px; background: linear-gradient(145deg, color-mix(in srgb, var(--accent) 84%, white), var(--accent)); box-shadow: inset 0 1px rgb(255 255 255 / .35), 0 7px 16px color-mix(in srgb, var(--accent) 28%, transparent); }
      .assistant-avatar svg { width: 31px; height: 31px; }
      .eyebrow { margin: 0 0 7px; color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
      .task-card h2 { margin: 0; font-size: 14px; line-height: 1.45; word-break: break-word; }
      .task-card > p:last-child, .tips-card p { margin: 7px 0 0; color: var(--shell-muted); font-size: 11px; line-height: 1.55; word-break: break-word; }
      .detail-card dl { margin: 0; }
      .detail-card dl div { display: flex; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--shell-border); font-size: 11px; }
      .detail-card dl div:last-child { border: 0; }
      .detail-card dt { color: var(--shell-muted); }
      .detail-card dd { margin: 0; text-align: right; }
      .tips-card strong { font-size: 12px; }
      .statusbar { inset: auto 0 0 0; height: var(--bottom); display: flex; align-items: center; gap: 18px; padding: 0 11px; overflow: hidden; white-space: nowrap; color: var(--shell-muted); background: var(--shell-bg); border-top: 1px solid var(--shell-border); font-size: 10px; }
      .statusbar span { display: inline-flex; align-items: center; gap: 7px; }
      .statusbar span:nth-child(2) { margin-left: auto; }
      .toast { position: fixed; z-index: 950; left: 50%; bottom: calc(var(--bottom) + 16px); transform: translate(-50%, 10px); padding: 8px 13px; border-radius: 9px; color: var(--shell-fg); background: var(--shell-bg); border: 1px solid var(--shell-border); box-shadow: var(--shell-shadow); font-size: 11px; opacity: 0; pointer-events: none; transition: .18s ease; }
      .toast.visible { opacity: 1; transform: translate(-50%, 0); }

      .quota-bar { position: fixed; z-index: 1100; inset: auto 0 0 0; height: 10px; padding-top: 3px; pointer-events: auto; color: #f7fafc; --quota-color: #8b96a8; }
      :host([data-quota-enabled="false"]) .quota-bar { display: none; }
      .quota-track { position: absolute; inset: auto 0 0; height: 7px; overflow: hidden; background: rgb(10 14 20 / .62); border-top: 1px solid rgb(255 255 255 / .12); box-shadow: 0 -1px 8px rgb(0 0 0 / .22); }
      .quota-fill { width: 100%; height: 100%; transform-origin: left center; background: var(--quota-color); box-shadow: 0 0 10px color-mix(in srgb, var(--quota-color) 65%, transparent); transition: width .55s cubic-bezier(.16, 1, .3, 1), background-color .25s ease; }
      .quota-bar[data-level="healthy"] { --quota-color: #35c96f; }
      .quota-bar[data-level="warning"] { --quota-color: #f2b84b; }
      .quota-bar[data-level="critical"] { --quota-color: #f05252; }
      .quota-bar[data-status="loading"] .quota-fill { width: 35%; background: linear-gradient(90deg, transparent, #7c9cff, transparent); animation: quota-loading 1.25s ease-in-out infinite; }
      .quota-bar[data-status="error"] .quota-fill, .quota-bar[data-status="unavailable"] .quota-fill { width: 100%; opacity: .6; background: repeating-linear-gradient(135deg, #7b8492 0 8px, #59616d 8px 16px); }
      .quota-bar[data-status="stale"] .quota-fill { opacity: .68; }
      .quota-popover { position: absolute; right: 12px; bottom: 15px; width: min(390px, calc(100vw - 24px)); padding: 11px 13px; border: 1px solid rgb(255 255 255 / .14); border-radius: 11px; color: #f5f7fa; background: rgb(20 25 35 / .96); box-shadow: 0 12px 38px rgb(0 0 0 / .34); opacity: 0; transform: translateY(7px); pointer-events: none; transition: .16s ease; }
      .quota-bar:hover .quota-popover, .quota-bar:focus-within .quota-popover { opacity: 1; transform: translateY(0); }
      .quota-popover strong, .quota-popover span, .quota-popover small { display: block; }
      .quota-popover strong { font-size: 13px; line-height: 1.35; }
      .quota-popover span { margin-top: 5px; color: #c5ccd7; font-size: 11px; line-height: 1.5; white-space: pre-line; }
      .quota-popover small { min-height: 1em; margin-top: 5px; color: #8f9aab; font-size: 10px; line-height: 1.45; }
      @keyframes quota-loading { from { transform: translateX(-110%); } to { transform: translateX(380%); } }

      :host([data-theme="wechat"]) .shell { --top: 46px; --right: 248px; --bottom: 25px; --accent: #07c160; --shell-bg: rgb(38 40 43 / .97); --shell-panel: rgb(245 247 248 / .96); --shell-fg: #f4f4f4; --shell-muted: #aeb2b7; --shell-border: rgb(0 0 0 / .13); }
      :host([data-theme="wechat"]) .right-dock { color: #202326; }
      :host([data-theme="wechat"]) .right-dock section { background: rgb(255 255 255 / .78); border-color: rgb(0 0 0 / .08); }
      :host([data-theme="wechat"]) .right-dock .task-card > p:last-child, :host([data-theme="wechat"]) .right-dock .tips-card p, :host([data-theme="wechat"]) .right-dock dt, :host([data-theme="wechat"]) .right-dock small { color: #7f858b; }
      :host([data-theme="wechat"]) .right-dock .detail-card dl div { border-color: rgb(0 0 0 / .08); }

      :host([data-theme="feishu"]) .shell { --top: 50px; --right: 270px; --bottom: 27px; --accent: #3370ff; --shell-bg: rgb(255 255 255 / .96); --shell-panel: rgb(247 248 250 / .97); --shell-fg: #1f2329; --shell-muted: #8f959e; --shell-border: rgb(31 35 41 / .12); --shell-shadow: 0 8px 28px rgb(31 35 41 / .10); }
      :host([data-theme="feishu"]) .brand-icon { color: var(--accent); }
      :host([data-theme="feishu"]) .toolbar button { border-radius: 8px; align-self: center; height: 34px; }

      :host([data-theme="qq2007"]) .shell { --top: 58px; --right: 268px; --bottom: 29px; --accent: #1a74d5; --shell-bg: linear-gradient(#dff2ff 0%, #9fd3fa 47%, #68afe6 50%, #c5e8ff 100%); --shell-panel: linear-gradient(90deg, rgb(235 248 255 / .97), rgb(199 230 251 / .97)); --shell-fg: #11385b; --shell-muted: #41698a; --shell-border: #5c9bc9; --shell-shadow: 0 2px 7px rgb(20 75 115 / .34); }
      :host([data-theme="qq2007"]) .topbar { border-bottom-color: #4c8fbe; text-shadow: 0 1px white; }
      :host([data-theme="qq2007"]) .brand-icon { color: #07589f; filter: drop-shadow(0 1px white); }
      :host([data-theme="qq2007"]) .brand-copy strong { font-size: 15px; }
      :host([data-theme="qq2007"]) .toolbar { gap: 3px; padding: 5px 0; }
      :host([data-theme="qq2007"]) .toolbar button { border: 1px solid transparent; border-radius: 3px; text-shadow: 0 1px white; }
      :host([data-theme="qq2007"]) .toolbar button:hover, :host([data-theme="qq2007"]) .window-meta button:hover { border-color: #6fa8cf; background: linear-gradient(#fff, #bfe3fb); color: #064c88; }
      :host([data-theme="qq2007"]) .right-dock { color: #153b59; border-left: 1px solid #5f9ecb; }
      :host([data-theme="qq2007"]) .right-dock section { border-radius: 3px; border-color: #79add0; background: linear-gradient(135deg, rgb(255 255 255 / .91), rgb(210 237 255 / .85)); box-shadow: inset 0 1px white; }
      :host([data-theme="qq2007"]) .assistant-avatar { border-radius: 9px; border: 1px solid #4b8dbc; background: radial-gradient(circle at 50% 30%, #8be1ff, #3489d1 60%, #15589d); }
      :host([data-theme="qq2007"]) .task-card > p:last-child, :host([data-theme="qq2007"]) .tips-card p, :host([data-theme="qq2007"]) dt, :host([data-theme="qq2007"]) small { color: #52748f; }
      :host([data-theme="qq2007"]) .statusbar { border-top-color: #4c8fbe; text-shadow: 0 1px white; }

      @media (max-width: 1179px) { .right-dock { display: none; } }
      @media (max-width: 760px) { .toolbar button span { display: none; } .toolbar button { min-width: 40px; padding-inline: 7px; } .identity { min-width: 118px; } .brand-copy small { display: none; } }
    `;
  }

  function appStyles() {
    return `
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) {
        --csl-top: 48px;
        --csl-right: 252px;
        --csl-bottom: 26px;
        --csl-layout-accent: #7c9cff;
      }
      html[data-codex-layout-theme="wechat"] { --csl-top: 46px; --csl-right: 248px; --csl-bottom: 25px; --csl-layout-accent: #07c160; }
      html[data-codex-layout-theme="feishu"] { --csl-top: 50px; --csl-right: 270px; --csl-bottom: 27px; --csl-layout-accent: #3370ff; }
      html[data-codex-layout-theme="qq2007"] { --csl-top: 58px; --csl-right: 268px; --csl-bottom: 29px; --csl-layout-accent: #1a74d5; }
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]),
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) body { width: 100%; height: 100%; overflow: hidden !important; }
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) body { padding: var(--csl-top) var(--csl-right) var(--csl-bottom) 0 !important; box-sizing: border-box !important; }
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root { width: 100% !important; height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root aside,
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root nav { border-color: color-mix(in srgb, var(--csl-layout-accent) 20%, transparent) !important; }
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root button:focus-visible,
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root input:focus,
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root textarea:focus,
      html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) #root [contenteditable="true"]:focus { outline-color: var(--csl-layout-accent) !important; }
      html[data-codex-layout-theme="wechat"] #root aside,
      html[data-codex-layout-theme="wechat"] #root [class*="sidebar" i] { background: rgb(38 40 43 / .91) !important; box-shadow: inset -1px 0 rgb(0 0 0 / .22); }
      html[data-codex-layout-theme="wechat"] #root main { background: rgb(245 247 248 / .72) !important; }
      html[data-codex-layout-theme="wechat"] #root [data-message-author-role="user"] { background: rgb(149 236 105 / .82) !important; border-radius: 8px !important; }
      html[data-codex-layout-theme="wechat"] #root textarea,
      html[data-codex-layout-theme="wechat"] #root [contenteditable="true"] { border-radius: 7px !important; }
      html[data-codex-layout-theme="feishu"] #root { padding: 10px !important; gap: 10px !important; }
      html[data-codex-layout-theme="feishu"] #root aside,
      html[data-codex-layout-theme="feishu"] #root main,
      html[data-codex-layout-theme="feishu"] #root [class*="sidebar" i] { border: 1px solid rgb(31 35 41 / .10) !important; border-radius: 12px !important; box-shadow: 0 4px 18px rgb(31 35 41 / .08); }
      html[data-codex-layout-theme="feishu"] #root button { border-radius: 8px !important; }
      html[data-codex-layout-theme="qq2007"] body { border: 1px solid #4d91c2; box-shadow: inset 0 0 0 1px #dff5ff; }
      html[data-codex-layout-theme="qq2007"] #root { padding: 4px !important; background: linear-gradient(180deg, rgb(231 246 255 / .82), rgb(190 224 247 / .70)) !important; }
      html[data-codex-layout-theme="qq2007"] #root aside,
      html[data-codex-layout-theme="qq2007"] #root main,
      html[data-codex-layout-theme="qq2007"] #root [class*="sidebar" i] { border: 1px solid #72a9cf !important; border-radius: 3px !important; box-shadow: inset 0 1px white, 0 1px 3px rgb(41 91 129 / .22); }
      html[data-codex-layout-theme="qq2007"] #root button { border-radius: 3px !important; }
      html[data-codex-layout-theme="qq2007"] #root input,
      html[data-codex-layout-theme="qq2007"] #root textarea,
      html[data-codex-layout-theme="qq2007"] #root [contenteditable="true"] { border-color: #76a8cc !important; border-radius: 2px !important; box-shadow: inset 0 1px 3px rgb(34 73 102 / .15); }
      @media (max-width: 1179px) {
        html[data-codex-layout-theme]:not([data-codex-layout-theme="original"]) { --csl-right: 0px; }
      }
    `;
  }

  function findNativeAction(action) {
    const needles = actionLabels[action] || [];
    if (!needles.length) return null;
    const candidates = document.querySelectorAll('#root button, #root [role="button"], #root a');
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const haystack = `${candidate.getAttribute("aria-label") || ""} ${candidate.getAttribute("title") || ""} ${candidate.textContent || ""}`.trim().toLowerCase();
      if (needles.some((needle) => haystack.includes(needle))) return candidate;
    }
    return null;
  }

  function showToast(message) {
    const toast = state.host?.shadowRoot?.querySelector(".toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  function onShellClick(event) {
    const button = event.target.closest?.("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const nativeControl = findNativeAction(action);
    if (nativeControl) {
      nativeControl.click();
      showToast(`已打开：${button.textContent.trim() || button.getAttribute("aria-label") || "Codex 功能"}`);
    } else {
      showToast("当前 Codex 版本未找到该快捷入口，请使用原界面操作");
    }
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("aria-label", "Codex 布局主题外壳");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${shadowStyles()}</style>${shellMarkup()}`;
      shadow.addEventListener("click", onShellClick);
      document.documentElement.appendChild(host);
    }
    state.host = host;
    return host;
  }

  function ensureAppStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = appStyles();
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function clampPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
  }

  function windowDurationLabel(minutes, fallback) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return fallback;
    if (value % 10080 === 0) return `${value / 10080}周窗口`;
    if (value % 1440 === 0) return `${value / 1440}天窗口`;
    if (value % 60 === 0) return `${value / 60}小时窗口`;
    return `${Math.round(value)}分钟窗口`;
  }

  function resetLabel(timestamp) {
    const milliseconds = Number(timestamp) * 1000;
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
    const remaining = milliseconds - Date.now();
    if (remaining <= 60_000) return "即将重置";
    if (remaining < 3_600_000) return `${Math.ceil(remaining / 60_000)}分钟后重置`;
    if (remaining < 86_400_000) return `${Math.ceil(remaining / 3_600_000)}小时后重置`;
    return `${Math.ceil(remaining / 86_400_000)}天后重置`;
  }

  function quotaSnapshots(result) {
    const buckets = result?.rateLimitsByLimitId && typeof result.rateLimitsByLimitId === "object"
      ? Object.entries(result.rateLimitsByLimitId).filter(([, snapshot]) => snapshot && typeof snapshot === "object")
      : [];
    if (buckets.length) return buckets;
    return result?.rateLimits && typeof result.rateLimits === "object"
      ? [[result.rateLimits.limitId || "codex", result.rateLimits]]
      : [];
  }

  function quotaWindows(result) {
    const entries = [];
    for (const [bucketId, snapshot] of quotaSnapshots(result)) {
      const bucketLabel = snapshot.limitName || snapshot.limitId || bucketId || "Codex";
      for (const [key, fallback] of [["primary", "主额度"], ["secondary", "次额度"]]) {
        const window = snapshot[key];
        const used = clampPercent(window?.usedPercent);
        if (used === null) continue;
        entries.push({
          bucketLabel,
          windowLabel: windowDurationLabel(window.windowDurationMins, fallback),
          remaining: Math.round((100 - used) * 10) / 10,
          resetsAt: window.resetsAt,
        });
      }
    }
    return entries.sort((left, right) => left.remaining - right.remaining);
  }

  function quotaExtras(result) {
    const extras = [];
    const snapshots = quotaSnapshots(result).map(([, snapshot]) => snapshot);
    if (result?.rateLimits && !snapshots.includes(result.rateLimits)) snapshots.push(result.rateLimits);
    const creditSnapshots = snapshots.map((snapshot) => snapshot.credits).filter(Boolean);
    const unlimited = creditSnapshots.some((credits) => credits.unlimited === true);
    const balance = creditSnapshots.map((credits) => credits.balance).find((value) => value !== null && value !== undefined && value !== "");
    if (unlimited) extras.push("Credits 不限");
    else if (balance !== undefined) extras.push(`Credits ${balance}`);
    const resetCount = Number(result?.rateLimitResetCredits?.availableCount);
    if (Number.isFinite(resetCount) && resetCount > 0) extras.push(`${resetCount} 次可用重置`);
    return extras;
  }

  function setQuotaText(name, value) {
    const node = state.host?.shadowRoot?.querySelector(`[data-field="${name}"]`);
    if (node) node.textContent = value;
  }

  function updateQuotaView() {
    const bar = state.host?.shadowRoot?.querySelector(".quota-bar");
    if (!bar) return;
    const status = state.quota?.status || "unavailable";
    const windows = quotaWindows(state.quota?.result);
    const hasSnapshot = windows.length > 0;

    if (!hasSnapshot) {
      const displayStatus = status === "loading" ? "loading" : (status === "unavailable" ? "unavailable" : "error");
      bar.dataset.status = displayStatus;
      bar.dataset.level = "unknown";
      bar.removeAttribute("aria-valuenow");
      setQuotaText("quota-summary", status === "loading" ? "正在读取 Codex 额度…" : "Codex 额度暂不可用");
      setQuotaText("quota-detail", state.quota?.message || "请确认当前使用 ChatGPT 账号登录 Codex");
      setQuotaText("quota-extra", "");
      bar.title = state.quota?.message || "Codex 额度暂不可用";
      return;
    }

    const binding = windows[0];
    const remaining = binding.remaining;
    const level = remaining > 60 ? "healthy" : (remaining > 20 ? "warning" : "critical");
    const stale = status !== "ready";
    bar.dataset.status = stale ? "stale" : "ready";
    bar.dataset.level = level;
    bar.setAttribute("aria-valuenow", String(remaining));
    bar.setAttribute("aria-valuetext", `Codex 剩余额度 ${remaining}%`);
    const fill = bar.querySelector(".quota-fill");
    if (fill) fill.style.width = `${remaining}%`;

    const summary = `Codex 剩余 ${remaining}%${stale ? "（缓存）" : ""}`;
    const details = windows.slice(0, 4).map((entry) => {
      const reset = resetLabel(entry.resetsAt);
      return `${entry.bucketLabel} · ${entry.windowLabel} ${entry.remaining}%${reset ? ` · ${reset}` : ""}`;
    });
    const extras = quotaExtras(state.quota.result);
    if (stale && state.quota?.message) extras.unshift(state.quota.message);
    if (state.quota?.updatedAt) {
      const updated = new Date(state.quota.updatedAt);
      if (!Number.isNaN(updated.getTime())) extras.push(`更新于 ${updated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`);
    }
    setQuotaText("quota-summary", summary);
    setQuotaText("quota-detail", details.join("\n"));
    setQuotaText("quota-extra", extras.join(" · "));
    bar.title = `${summary}｜${details[0] || ""}`;
  }

  function updateQuota(input) {
    state.quota = input && typeof input === "object" ? input : { status: "error", result: null, message: "额度状态无效" };
    if (!state.config.quotaBarEnabled) {
      clearInterval(state.quotaTimer);
      state.quotaTimer = 0;
      if (state.host) state.host.dataset.quotaEnabled = "false";
      return { active: false };
    }
    const host = ensureHost();
    host.dataset.quotaEnabled = "true";
    updateQuotaView();
    if (!state.quotaTimer) state.quotaTimer = setInterval(updateQuotaView, 1000);
    return { active: true };
  }

  function compactTitle() {
    const raw = (document.title || "Codex").replace(/\s*[—–|-]\s*Codex.*$/i, "").trim();
    return raw && raw.toLowerCase() !== "codex" ? raw.slice(0, 64) : "当前 Codex 任务";
  }

  function refreshShell() {
    if (!state.host?.shadowRoot) return;
    const title = compactTitle();
    const theme = labels[state.config.layoutTheme] || "Codex 工作台";
    const locationText = location.pathname && location.pathname !== "/" ? location.pathname.slice(0, 64) : "本地工作区";
    state.host.shadowRoot.querySelectorAll('[data-field="title"]').forEach((node) => { node.textContent = title; });
    state.host.shadowRoot.querySelectorAll('[data-field="theme"]').forEach((node) => { node.textContent = theme; });
    state.host.shadowRoot.querySelectorAll('[data-field="location"]').forEach((node) => { node.textContent = locationText; });
  }

  function updateClock() {
    if (!state.host?.shadowRoot) return;
    const value = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    state.host.shadowRoot.querySelectorAll('[data-field="clock"]').forEach((node) => { node.textContent = value; });
  }

  function observePage() {
    if (!state.observer) {
      state.observer = new MutationObserver(() => {
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(refreshShell, 160);
      });
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (!state.clockTimer) state.clockTimer = setInterval(updateClock, 15000);
  }

  function disableLayout() {
    clearTimeout(state.refreshTimer);
    clearInterval(state.clockTimer);
    state.refreshTimer = 0;
    state.clockTimer = 0;
    state.observer?.disconnect();
    state.observer = null;
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-codex-layout-theme");
    if (state.host) state.host.dataset.layoutActive = "false";
  }

  function destroy() {
    disableLayout();
    clearInterval(state.quotaTimer);
    state.quotaTimer = 0;
    document.getElementById(HOST_ID)?.remove();
    state.host = null;
  }

  function apply(input) {
    const config = normalize(input);
    state.config = config;
    if (!config.enabled || config.layoutTheme === "original") {
      disableLayout();
      if (config.quotaBarEnabled) {
        const host = ensureHost();
        host.dataset.quotaEnabled = "true";
        updateQuota(state.quota);
      } else {
        destroy();
      }
      return { active: false, theme: "original" };
    }

    const host = ensureHost();
    ensureAppStyle();
    host.dataset.layoutActive = "true";
    host.dataset.quotaEnabled = String(config.quotaBarEnabled);
    host.dataset.theme = config.layoutTheme;
    host.style.setProperty("--accent", config.accentColor);
    host.style.setProperty("--fg", config.foregroundColor);
    host.style.setProperty("--bg", config.backgroundColor);
    document.documentElement.setAttribute("data-codex-layout-theme", config.layoutTheme);
    observePage();
    refreshShell();
    updateClock();
    return { active: true, theme: config.layoutTheme };
  }

  globalThis[API_NAME] = { apply, updateQuota, destroy, version: "2.1.0" };
})();
