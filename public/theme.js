const themeStorageKey = 'music-together-theme';
const themeSelect = document.getElementById('themeSelect');
const favicon = document.querySelector('link[rel="icon"]');
const defaultFavicon = favicon?.href;
const themeColor = document.querySelector('meta[name="theme-color"]');
const brand = document.getElementById('brandLink');
const workspaceFavicon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#1e2128"/><path d="m25 18-14 14 14 14m14-28 14 14-14 14M35 14 29 50" fill="none" stroke="#75b8e7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`;

window.getMusicPageTitle = () => document.documentElement.dataset.theme === 'workspace' ? 'workspace / editor' : '서디미 뮤직';

function applyTheme(theme, persist = true) {
  const selected = theme === 'workspace' ? 'workspace' : 'default';
  document.documentElement.dataset.theme = selected;
  themeSelect.value = selected;
  document.title = window.getMusicPageTitle();
  if (favicon) favicon.href = selected === 'workspace' ? workspaceFavicon : defaultFavicon;
  if (themeColor) themeColor.content = selected === 'workspace' ? '#171a20' : '#121212';
  brand.setAttribute('aria-label', selected === 'workspace' ? '워크스페이스 홈' : 'music together 홈');
  if (persist) {
    try { localStorage.setItem(themeStorageKey, selected); } catch { /* Keep the choice for this tab. */ }
  }
}

applyTheme(document.documentElement.dataset.theme, false);
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

const lyricsPanel = document.getElementById('lyricsPanel');
const lyricsToggle = document.getElementById('workspaceLyricsToggle');
lyricsToggle.addEventListener('click', () => {
  const expanded = lyricsPanel.classList.toggle('workspace-expanded');
  lyricsToggle.setAttribute('aria-expanded', String(expanded));
  lyricsToggle.textContent = expanded ? '접기' : '열기';
});

const runtimeSources = {
  room: document.getElementById('roomCode'),
  connection: document.getElementById('connectionStatus'),
  playback: document.getElementById('playbackLabel'),
  count: document.getElementById('playlistCount'),
};
const runtimeTargets = {
  room: document.getElementById('workspaceRoomId'),
  connection: document.getElementById('workspaceConnection'),
  playback: document.getElementById('workspacePlayback'),
  count: document.getElementById('workspacePlaylistCount'),
};

function updateWorkspaceRuntime() {
  runtimeTargets.room.textContent = runtimeSources.room.textContent.trim() || '—';
  runtimeTargets.connection.textContent = runtimeSources.connection.textContent.includes('실시간 연결됨') ? 'connected' : 'reconnecting';
  const playback = runtimeSources.playback.textContent;
  runtimeTargets.playback.textContent = playback.includes('재생할 수 없어요') ? 'error'
    : playback.includes('재생 중') ? 'playing'
      : playback.includes('재생이 끝') ? 'ended' : 'idle';
  runtimeTargets.count.textContent = String(Number.parseInt(runtimeSources.count.textContent, 10) || 0);
}

const runtimeObserver = new MutationObserver(updateWorkspaceRuntime);
for (const source of Object.values(runtimeSources)) {
  runtimeObserver.observe(source, { childList: true, characterData: true, subtree: true });
}
updateWorkspaceRuntime();
