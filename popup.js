const TOGGLE_STORAGE_KEY = "addToLibraryEnabled";

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isYouTubeMusicTab(tab) {
  return Boolean(tab?.url && tab.url.startsWith("https://music.youtube.com/"));
}

async function readToggleState() {
  const stored = await chrome.storage.local.get(TOGGLE_STORAGE_KEY);
  return stored[TOGGLE_STORAGE_KEY] !== false;
}

async function writeToggleState(enabled) {
  await chrome.storage.local.set({ [TOGGLE_STORAGE_KEY]: enabled });
}

async function sendToggleToActiveTab(enabled) {
  const tab = await getActiveTab();
  if (!tab?.id || !isYouTubeMusicTab(tab)) return false;

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "ADD2LIBRARY_TOGGLE",
      enabled,
    });
    return true;
  } catch {
    return false;
  }
}

async function reloadActiveMusicTab() {
  const tab = await getActiveTab();
  if (!tab?.id || !isYouTubeMusicTab(tab)) return false;

  try {
    await chrome.tabs.reload(tab.id);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const toggleEl = document.getElementById("library-toggle");
  const statusEl = document.getElementById("status");
  const tab = await getActiveTab();
  const onMusicTab = isYouTubeMusicTab(tab);

  const enabled = await readToggleState();
  toggleEl.checked = enabled;

  if (onMusicTab) {
    statusEl.textContent = enabled
      ? "Button is enabled on this tab."
      : "Button is disabled on this tab.";
  } else {
    statusEl.textContent =
      "Setting is saved globally. Open music.youtube.com to use it.";
  }

  toggleEl.addEventListener("change", async () => {
    const nextState = toggleEl.checked;
    toggleEl.disabled = true;
    statusEl.textContent = "Saving...";

    await writeToggleState(nextState);
    const appliedNow = await sendToggleToActiveTab(nextState);
    const reloaded = await reloadActiveMusicTab();

    if (reloaded) {
      statusEl.textContent = nextState
        ? "Enabled. Reloading this YouTube Music tab..."
        : "Disabled. Reloading this YouTube Music tab...";
    } else if (appliedNow) {
      statusEl.textContent = nextState
        ? "Button enabled on this tab."
        : "Button disabled on this tab.";
    } else {
      statusEl.textContent = nextState
        ? "Enabled. Open/reload music.youtube.com to apply."
        : "Disabled. Open/reload music.youtube.com to apply.";
    }

    toggleEl.disabled = false;
  });
})();
