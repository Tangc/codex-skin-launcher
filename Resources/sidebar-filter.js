(() => {
  "use strict";

  const API_NAME = "__codexSkinSidebarFilter";
  if (globalThis[API_NAME]) return;

  const HOST_ID = "codex-skin-sidebar-filter-host";
  const STYLE_ID = "codex-skin-sidebar-filter-style";
  const HIDDEN_ATTRIBUTE = "data-codex-sidebar-filter-hidden";
  const PROJECT_SELECTOR = '[data-sidebar-project-kind][role="listitem"]';
  const RUNNING_SELECTOR = '.animate-spin, [aria-busy="true"], [data-state="running"], [data-status="running"]';

  const state = {
    enabled: false,
    query: "",
    mode: "all",
    host: null,
    nav: null,
    observer: null,
    refreshTimer: 0,
    stats: { total: 0, running: 0, visible: 0, visibleProjects: 0 },
  };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
  }

  function findSidebar() {
    const labelled = document.querySelector(
      'nav[aria-label="已安排任务文件夹"], nav[aria-label="Scheduled task folders"]',
    );
    if (labelled) return labelled;
    const project = document.querySelector(PROJECT_SELECTOR);
    return project?.closest("nav[role=\"navigation\"], nav") || null;
  }

  function isTaskRow(element) {
    return element instanceof Element
      && element.matches('[role="listitem"]')
      && !element.matches(PROJECT_SELECTOR)
      && Boolean(element.querySelector('div[role="button"]'));
  }

  function taskRows(nav) {
    return [...nav.querySelectorAll('[role="listitem"]')].filter(isTaskRow);
  }

  function isRunning(row) {
    return row.matches(RUNNING_SELECTOR) || Boolean(row.querySelector(RUNNING_SELECTOR));
  }

  function projectName(project) {
    return normalizeText(project.getAttribute("aria-label") || project.textContent);
  }

  function taskName(row) {
    const trigger = row.querySelector('div[role="button"]');
    return normalizeText(trigger?.textContent || row.textContent);
  }

  function setHidden(element, hidden) {
    if (!element) return;
    if (hidden) element.setAttribute(HIDDEN_ATTRIBUTE, "true");
    else element.removeAttribute(HIDDEN_ATTRIBUTE);
  }

  function clearHidden(root = state.nav || document) {
    root?.querySelectorAll?.(`[${HIDDEN_ATTRIBUTE}]`).forEach((element) => {
      element.removeAttribute(HIDDEN_ATTRIBUTE);
    });
  }

  function hostMarkup() {
    return `
      <div class="filter" role="search" aria-label="筛选 Codex 项目和任务">
        <div class="search-row">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.25"></circle><path d="m12.5 12.5 4 4"></path></svg>
          <input type="search" autocomplete="off" spellcheck="false" placeholder="搜索项目或任务" aria-label="搜索项目或任务">
          <button class="clear-query" type="button" aria-label="清除筛选" title="清除筛选">×</button>
        </div>
        <div class="mode-row">
          <div class="modes" role="group" aria-label="任务执行状态">
            <button type="button" data-mode="all" aria-pressed="true">全部</button>
            <button type="button" data-mode="running" aria-pressed="false">执行中 <span data-field="running-count">0</span></button>
          </div>
          <span class="summary" data-field="summary" aria-live="polite">0 个任务</span>
        </div>
        <p class="empty" data-field="empty" role="status" hidden>没有匹配的任务</p>
      </div>`;
  }

  function hostStyles() {
    return `
      :host {
        display: block;
        flex: 0 0 auto;
        min-width: 0;
        padding: 7px 8px 5px;
        color: var(--color-token-text-primary, var(--color-token-foreground, #d9e1ec));
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif);
      }
      *, *::before, *::after { box-sizing: border-box; }
      button, input { font: inherit; }
      .filter { min-width: 0; }
      .search-row {
        height: 30px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 7px;
        border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        border-radius: 9px;
        color: color-mix(in srgb, currentColor 62%, transparent);
        background: color-mix(in srgb, var(--color-token-main-surface-primary, #141a24) 88%, transparent);
        transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
      }
      .search-row:focus-within {
        border-color: var(--csl-layout-accent, var(--color-token-text-link-foreground, #7c9cff));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--csl-layout-accent, #7c9cff) 18%, transparent);
      }
      svg { width: 14px; height: 14px; flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
      input {
        width: 100%;
        min-width: 0;
        height: 100%;
        padding: 0;
        border: 0;
        outline: 0;
        color: inherit;
        background: transparent;
        font-size: 12px;
      }
      input::placeholder { color: color-mix(in srgb, currentColor 58%, transparent); }
      input::-webkit-search-cancel-button { display: none; }
      .clear-query {
        width: 20px;
        height: 20px;
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        padding: 0 0 1px;
        border: 0;
        border-radius: 6px;
        color: inherit;
        background: transparent;
        cursor: pointer;
        font-size: 17px;
        line-height: 1;
      }
      .clear-query:hover { color: currentColor; background: color-mix(in srgb, currentColor 10%, transparent); }
      .clear-query[hidden] { display: none; }
      .mode-row { min-width: 0; height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding-top: 4px; }
      .modes { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 8px; background: color-mix(in srgb, currentColor 7%, transparent); }
      .modes button {
        min-height: 20px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border: 0;
        border-radius: 6px;
        color: color-mix(in srgb, currentColor 66%, transparent);
        background: transparent;
        cursor: pointer;
        font-size: 11px;
        line-height: 16px;
      }
      .modes button[aria-pressed="true"] {
        color: currentColor;
        background: color-mix(in srgb, var(--csl-layout-accent, var(--color-token-text-link-foreground, #7c9cff)) 20%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--csl-layout-accent, #7c9cff) 22%, transparent);
      }
      [data-field="running-count"] {
        min-width: 15px;
        padding: 0 4px;
        border-radius: 999px;
        color: color-mix(in srgb, currentColor 88%, transparent);
        background: color-mix(in srgb, currentColor 10%, transparent);
        text-align: center;
        font: 10px/15px ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .summary { min-width: 0; overflow: hidden; color: color-mix(in srgb, currentColor 52%, transparent); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      .empty { margin: 3px 0 0; padding: 7px 4px 2px; color: color-mix(in srgb, currentColor 55%, transparent); font-size: 11px; text-align: center; }
      .empty[hidden] { display: none; }
    `;
  }

  function ensureDocumentStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `[${HIDDEN_ATTRIBUTE}="true"] { display: none !important; }`;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  function onHostInput(event) {
    if (!event.target.matches("input[type=search]")) return;
    state.query = event.target.value;
    scheduleRefresh(80);
  }

  function resetFilter() {
    state.query = "";
    state.mode = "all";
    refresh();
    state.host?.shadowRoot?.querySelector("input")?.focus();
  }

  function onHostClick(event) {
    const modeButton = event.target.closest?.("button[data-mode]");
    if (modeButton) {
      state.mode = modeButton.dataset.mode === "running" ? "running" : "all";
      refresh();
      return;
    }
    if (event.target.closest?.(".clear-query")) resetFilter();
  }

  function onHostKeydown(event) {
    if (event.key !== "Escape" || !state.query) return;
    event.preventDefault();
    state.query = "";
    refresh();
  }

  function ensureHost(nav) {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("aria-label", "Codex 项目和任务筛选器");
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `<style>${hostStyles()}</style>${hostMarkup()}`;
      shadow.addEventListener("input", onHostInput);
      shadow.addEventListener("click", onHostClick);
      shadow.addEventListener("keydown", onHostKeydown);
    }
    const parent = nav.parentElement;
    if (parent && (host.parentElement !== parent || host.nextSibling !== nav)) {
      parent.insertBefore(host, nav);
    }
    state.host = host;
    return host;
  }

  function matchesQuery(name, query) {
    return !query || name.includes(query);
  }

  function updateControls(stats, hasResults) {
    const shadow = state.host?.shadowRoot;
    if (!shadow) return;
    const input = shadow.querySelector("input");
    if (input && input.value !== state.query) input.value = state.query;
    shadow.querySelectorAll("button[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
    const clear = shadow.querySelector(".clear-query");
    if (clear) clear.hidden = !state.query && state.mode === "all";
    const running = shadow.querySelector('[data-field="running-count"]');
    if (running) running.textContent = String(stats.running);
    const summary = shadow.querySelector('[data-field="summary"]');
    if (summary) summary.textContent = state.query || state.mode === "running"
      ? `${stats.visible} 个结果`
      : `${stats.total} 个任务`;
    const empty = shadow.querySelector('[data-field="empty"]');
    if (empty) empty.hidden = hasResults || (!state.query && state.mode === "all");
  }

  function refresh() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = 0;
    if (!state.enabled) return state.stats;

    const nav = findSidebar();
    if (!nav) {
      state.nav = null;
      state.host?.remove();
      state.host = null;
      return state.stats;
    }

    state.nav = nav;
    ensureDocumentStyle();
    ensureHost(nav);

    const rows = taskRows(nav);
    const projects = [...nav.querySelectorAll(PROJECT_SELECTOR)];
    const query = normalizeText(state.query);
    const filtering = Boolean(query) || state.mode === "running";
    const runningRows = new Set(rows.filter(isRunning));
    const visibleRows = new Set();
    let visibleProjects = 0;

    for (const project of projects) {
      const nameMatches = matchesQuery(projectName(project), query);
      const children = rows.filter((row) => row.closest(PROJECT_SELECTOR) === project);
      let visibleChildren = 0;

      for (const row of children) {
        const statusMatches = state.mode === "all" || runningRows.has(row);
        const textMatches = nameMatches || matchesQuery(taskName(row), query);
        const visible = statusMatches && textMatches;
        setHidden(row, filtering && !visible);
        if (visible) {
          visibleRows.add(row);
          visibleChildren += 1;
        }
      }

      const projectVisible = !filtering
        || visibleChildren > 0
        || (state.mode === "all" && nameMatches);
      setHidden(project, !projectVisible);
      if (projectVisible) visibleProjects += 1;
    }

    for (const row of rows) {
      if (row.closest(PROJECT_SELECTOR)) continue;
      const visible = (state.mode === "all" || runningRows.has(row))
        && matchesQuery(taskName(row), query);
      setHidden(row, filtering && !visible);
      if (visible) visibleRows.add(row);
    }

    const rowSet = new Set(rows);
    const projectSet = new Set(projects);
    nav.querySelectorAll('[role="listitem"]').forEach((element) => {
      if (!rowSet.has(element) && !projectSet.has(element)) setHidden(element, filtering);
    });

    if (!filtering) clearHidden(nav);

    state.stats = {
      total: rows.length,
      running: runningRows.size,
      visible: filtering ? visibleRows.size : rows.length,
      visibleProjects,
    };
    updateControls(state.stats, visibleRows.size > 0 || visibleProjects > 0);
    return { ...state.stats };
  }

  function scheduleRefresh(delay = 100) {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(refresh, delay);
  }

  function observePage() {
    if (state.observer) return;
    state.observer = new MutationObserver(() => scheduleRefresh(100));
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-label", "aria-busy", "data-state", "data-status"],
    });
  }

  function apply(input = {}) {
    state.enabled = input.enabled !== false;
    if (!state.enabled) {
      destroy();
      return { active: false };
    }
    observePage();
    const stats = refresh();
    return { active: Boolean(state.host), ...stats };
  }

  function setFilter(input = {}) {
    if (typeof input.query === "string") state.query = input.query;
    if (input.mode === "all" || input.mode === "running") state.mode = input.mode;
    return refresh();
  }

  function getState() {
    return {
      active: Boolean(state.host?.isConnected),
      query: state.query,
      mode: state.mode,
      ...state.stats,
    };
  }

  function destroy() {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = 0;
    state.observer?.disconnect();
    state.observer = null;
    clearHidden(state.nav || document);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    state.enabled = false;
    state.host = null;
    state.nav = null;
  }

  globalThis[API_NAME] = { apply, destroy, getState, refresh, setFilter, version: "1.0.0" };
})();
