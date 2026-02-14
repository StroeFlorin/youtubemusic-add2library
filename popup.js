async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

(async () => {
  const titleEl = document.getElementById("title");
  const copyBtn = document.getElementById("copy");

  const tab = await getActiveTab();
  const title = tab?.title ?? "(no title found)";

  titleEl.textContent = `Current tab: ${title}`;

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(title);
      copyBtn.textContent = "Copied ✅";
      setTimeout(() => (copyBtn.textContent = "Copy title"), 900);
    } catch {
      copyBtn.textContent = "Copy failed ❌";
      setTimeout(() => (copyBtn.textContent = "Copy title"), 900);
    }
  });
})();