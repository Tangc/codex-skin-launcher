const MAIN_CODEX_URL = "app://-/index.html";

export function isMainCodexTarget(target, testTargetURL = "") {
  if (target?.type !== "page" || !target.webSocketDebuggerUrl || typeof target.url !== "string") return false;
  if (testTargetURL && target.url === testTargetURL) return true;
  return target.url === MAIN_CODEX_URL;
}

export const targetFixtures = Object.freeze({
  main: MAIN_CODEX_URL,
  avatarOverlay: "app://-/index.html?initialRoute=%2Favatar-overlay",
  petSurface: "app://-/avatar-overlay-composition-surface.html?surfaceId=mascot-badge",
});
