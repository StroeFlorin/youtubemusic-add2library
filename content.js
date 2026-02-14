const BUTTON_ID = "add2library-toggle-button";
const STYLE_ID = "add2library-toggle-style";
const TOGGLE_STORAGE_KEY = "addToLibraryEnabled";

let isActionRunning = false;
let isFeatureEnabled = true;
let lastTrackKey = "";
let syncToken = 0;

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasLayoutBox(element) {
  return Boolean(element && element.getClientRects().length > 0);
}

function getPlayerBar() {
  return document.querySelector("ytmusic-player-bar");
}

function getCurrentTrackKey() {
  const link = document.querySelector(
    "ytmusic-player-bar a[href*='watch?v='], ytmusic-player-bar a[href*='list=']"
  );

  if (link?.getAttribute("href")) {
    return link.getAttribute("href");
  }

  const title = document.querySelector("ytmusic-player-bar .title")?.textContent;
  return normalize(title);
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID} {
      width: 40px;
      height: 40px;
      border: 0;
      padding: 8px;
      margin: 0;
      background: transparent;
      color: var(--ytmusic-icon-color, rgba(255, 255, 255, 0.8));
      border-radius: 999px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 120ms ease, color 120ms ease, opacity 120ms ease;
    }

    #${BUTTON_ID}:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    #${BUTTON_ID}:active {
      background: rgba(255, 255, 255, 0.14);
    }

    #${BUTTON_ID}[data-state="saved"] {
      color: var(--ytmusic-color-primary, #3ea6ff);
    }

    #${BUTTON_ID}[data-state="loading"] {
      opacity: 0.6;
      pointer-events: none;
    }

    #${BUTTON_ID} svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
      pointer-events: none;
    }
  `;

  document.documentElement.appendChild(style);
}

function getButtonIcon(state) {
  // Material icon path shapes: playlist_add, playlist_add_check
  if (state === "saved") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 10H2v2h12zm0-4H2v2h12zM2 16h8v-2H2zm19.59-2.58L23 14.83l-6.01 6.01-3.59-3.58L14.82 15l2.17 2.17z"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 10H2v2h12zm0-4H2v2h12zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2zm-16 2h8v-2H2z"></path>
    </svg>
  `;
}

function updateButtonState(state) {
  const button = document.getElementById(BUTTON_ID);
  if (!button) return;

  button.dataset.state = state || "default";

  if (state === "saved") {
    button.setAttribute("aria-label", "Remove from library");
    button.title = "Remove from library";
  } else if (state === "loading") {
    button.setAttribute("aria-label", "Updating library");
    button.title = "Updating library";
  } else {
    button.setAttribute("aria-label", "Save to library");
    button.title = "Save to library";
  }

  if (state !== "loading") {
    button.innerHTML = getButtonIcon(state);
  }
}

function getLibraryStateFromText(text) {
  const normalized = normalize(text);
  if (!normalized.includes("library")) return null;
  if (normalized.includes("remove")) return "saved";
  if (normalized.includes("save") || normalized.includes("add")) return "default";
  return null;
}

function findLibraryMenuEntry({ root = document, requireVisible = false } = {}) {
  const labelNodes = Array.from(
    root.querySelectorAll(
      "ytmusic-toggle-menu-service-item-renderer yt-formatted-string.text, ytmusic-menu-service-item-renderer yt-formatted-string.text"
    )
  );

  for (const labelNode of labelNodes) {
    const state = getLibraryStateFromText(labelNode.textContent);
    if (!state) continue;

    const item = labelNode.closest(
      "ytmusic-toggle-menu-service-item-renderer, ytmusic-menu-service-item-renderer"
    );
    if (!item) continue;
    if (requireVisible && !hasLayoutBox(labelNode) && !hasLayoutBox(item)) continue;
    return { item, state };
  }

  const itemNodes = Array.from(
    root.querySelectorAll(
      "ytmusic-toggle-menu-service-item-renderer, ytmusic-menu-service-item-renderer"
    )
  );

  for (const itemNode of itemNodes) {
    const state = getLibraryStateFromText(itemNode.textContent);
    if (!state) continue;
    if (requireVisible && !hasLayoutBox(itemNode)) continue;
    return { item: itemNode, state };
  }

  return null;
}

function getOpenMenuRoots() {
  const dropdowns = Array.from(document.querySelectorAll("tp-yt-iron-dropdown"));
  return dropdowns.filter(
    (dropdown) =>
      dropdown.getAttribute("aria-hidden") !== "true" && hasLayoutBox(dropdown)
  );
}

function isAnyMenuOpen() {
  return getOpenMenuRoots().length > 0;
}

function getVisibleBackdrop() {
  const backdrops = Array.from(
    document.querySelectorAll("tp-yt-iron-overlay-backdrop")
  );
  return backdrops.find((backdrop) => hasLayoutBox(backdrop)) || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeMenuIfNeeded(menuButton) {
  if (!isAnyMenuOpen()) return;

  const backdrop = getVisibleBackdrop();
  if (backdrop) {
    backdrop.click();
    await sleep(40);
  }

  if (!isAnyMenuOpen()) return;

  const escapeDown = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const escapeUp = new KeyboardEvent("keyup", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  document.dispatchEvent(escapeDown);
  document.dispatchEvent(escapeUp);
  await sleep(40);

  if (!isAnyMenuOpen()) return;
  if (!menuButton) return;

  menuButton.click();
  await sleep(40);
}

function findVisibleLibraryMenuEntry() {
  const openMenuRoots = getOpenMenuRoots();
  for (const root of openMenuRoots) {
    const entry = findLibraryMenuEntry({ root, requireVisible: true });
    if (entry) return entry;
  }

  return findLibraryMenuEntry({ root: document, requireVisible: true });
}

async function waitFor(checkFn, timeoutMs = 1500, intervalMs = 60) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = checkFn();
    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

function getMenuButton(playerBar) {
  if (!playerBar) return null;

  return (
    playerBar.querySelector("ytmusic-menu-renderer tp-yt-paper-icon-button") ||
    playerBar.querySelector("ytmusic-menu-renderer button")
  );
}

function clickMenuItem(item) {
  const clickable =
    item.querySelector("tp-yt-paper-item") ||
    item.querySelector("button") ||
    item;

  clickable.click();
}

async function triggerNativeLibraryToggle() {
  const playerBar = getPlayerBar();
  const menuButton = getMenuButton(playerBar);

  if (!menuButton) {
    throw new Error("Could not find YouTube Music menu button in player bar.");
  }

  let entry = findVisibleLibraryMenuEntry();
  if (!entry) {
    menuButton.click();
    entry = await waitFor(findVisibleLibraryMenuEntry, 2200);
  }

  if (!entry) {
    throw new Error("Could not find 'Save to library' menu item.");
  }

  const state = entry.state;
  const action = state === "saved" ? "remove" : "save";

  clickMenuItem(entry.item);
  return action;
}

async function syncButtonStateFromNative(trackKeyAtStart) {
  if (!isFeatureEnabled) return;

  const button = document.getElementById(BUTTON_ID);
  if (!button || isActionRunning) return;

  const activeSyncToken = ++syncToken;
  updateButtonState("loading");

  const playerBar = getPlayerBar();
  const menuButton = getMenuButton(playerBar);
  if (!menuButton) {
    updateButtonState("default");
    return;
  }

  // First try to read state from menu renderers already attached in player bar.
  let state = findLibraryMenuEntry({ root: playerBar, requireVisible: false })?.state;
  const wasMenuAlreadyOpen = getOpenMenuRoots().length > 0;

  let openedMenu = false;
  if (!state) {
    menuButton.click();
    openedMenu = true;
    const visibleEntry = await waitFor(findVisibleLibraryMenuEntry, 2200);
    state = visibleEntry?.state || null;
  }

  if (openedMenu && !wasMenuAlreadyOpen) {
    await closeMenuIfNeeded(menuButton);
  }

  if (activeSyncToken !== syncToken) return;
  if (trackKeyAtStart && getCurrentTrackKey() !== trackKeyAtStart) return;
  updateButtonState(state || "default");
}

async function onLibraryButtonClick() {
  if (!isFeatureEnabled || isActionRunning) return;

  isActionRunning = true;
  const previousState = document.getElementById(BUTTON_ID)?.dataset.state || "default";
  updateButtonState("loading");

  try {
    const action = await triggerNativeLibraryToggle();

    if (action === "save") {
      // Action clicked was "Save", so it is now in the library.
      updateButtonState("saved");
    } else {
      // Action clicked was "Remove", so it is now out of the library.
      updateButtonState("default");
    }
  } catch (error) {
    console.warn("[Add2Library]", error);
    updateButtonState(previousState === "saved" ? "saved" : "default");
  } finally {
    isActionRunning = false;
  }
}

function removeLibraryButton() {
  const existingButton = document.getElementById(BUTTON_ID);
  if (existingButton) {
    existingButton.remove();
  }
}

function createLibraryButton() {
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.dataset.state = "default";
  button.setAttribute("aria-label", "Save to library");
  button.title = "Save to library";
  button.innerHTML = getButtonIcon("default");
  button.addEventListener("click", onLibraryButtonClick);
  return button;
}

function ensureLibraryButton() {
  if (!isFeatureEnabled) {
    removeLibraryButton();
    return;
  }

  const playerBar = getPlayerBar();
  if (!playerBar) return;

  if (document.getElementById(BUTTON_ID)) return;

  const menuRenderer = playerBar.querySelector("ytmusic-menu-renderer");
  if (!menuRenderer || !menuRenderer.parentElement) return;

  const button = createLibraryButton();
  menuRenderer.parentElement.insertBefore(button, menuRenderer);
}

function refreshStateForTrackChange() {
  if (!isFeatureEnabled) return;

  const trackKey = getCurrentTrackKey();
  if (!trackKey || trackKey === lastTrackKey) return;

  lastTrackKey = trackKey;
  syncButtonStateFromNative(trackKey);
}

let scheduled = false;
function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;

  requestAnimationFrame(() => {
    scheduled = false;
    if (!isFeatureEnabled) {
      removeLibraryButton();
      return;
    }
    ensureLibraryButton();
    refreshStateForTrackChange();
  });
}

function applyFeatureToggle(enabled) {
  isFeatureEnabled = enabled !== false;

  if (isFeatureEnabled) {
    scheduleRefresh();
    return;
  }

  syncToken += 1;
  isActionRunning = false;
  lastTrackKey = "";
  removeLibraryButton();
}

async function getInitialFeatureToggle() {
  try {
    const stored = await chrome.storage.local.get(TOGGLE_STORAGE_KEY);
    return stored[TOGGLE_STORAGE_KEY] !== false;
  } catch {
    return true;
  }
}

function registerToggleListeners() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "ADD2LIBRARY_TOGGLE") return false;

    applyFeatureToggle(message.enabled !== false);
    sendResponse({ ok: true, enabled: isFeatureEnabled });
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!Object.prototype.hasOwnProperty.call(changes, TOGGLE_STORAGE_KEY)) return;

    applyFeatureToggle(changes[TOGGLE_STORAGE_KEY].newValue !== false);
  });
}

async function init() {
  injectStyle();
  const initialToggle = await getInitialFeatureToggle();
  applyFeatureToggle(initialToggle);
  registerToggleListeners();

  const observer = new MutationObserver(() => {
    scheduleRefresh();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: false,
  });

  window.addEventListener("yt-navigate-finish", scheduleRefresh);
  setInterval(refreshStateForTrackChange, 1200);
}

init();
