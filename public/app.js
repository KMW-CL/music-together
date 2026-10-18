const $ = (id) => document.getElementById(id);
const ui = {
  landing: $('landingView'), steps: $('landingSteps'), recentRooms: $('recentRooms'), recentRoomList: $('recentRoomList'),
  room: $('roomView'), create: $('createRoomButton'), leave: $('leaveRoomButton'),
  brand: $('brandLink'), code: $('roomCode'), listenerCount: $('roomListenerCount'), role: $('roleTag'), connection: $('connectionStatus'),
  copy: $('copyLinkButton'),
  copyLabel: $('copyLinkLabel'),
  playerPanel: $('playerPanel'), videoSizeButton: $('videoSizeButton'),
  form: $('videoForm'), videoUrl: $('videoUrl'), videoTitle: $('videoTitle'), addTrack: $('addTrackButton'), probePreview: $('probePreview'),
  hostCardDescription: $('hostCardDescription'),
  openSearch: $('openSearchButton'), searchDialog: $('searchDialog'), closeSearch: $('closeSearchButton'), searchProbePreview: $('searchProbePreview'),
  searchForm: $('searchForm'), searchQuery: $('searchQuery'), searchButton: $('searchButton'), searchStatus: $('searchStatus'), searchResults: $('searchResults'),
  searchPagination: $('searchPagination'), searchPrevious: $('searchPrevious'), searchNext: $('searchNext'), searchPageLabel: $('searchPageLabel'),
  empty: $('emptyPlayer'), emptyMessage: $('emptyMessage'),
  joinPlay: $('joinPlayButton'), alert: $('playerAlert'), alertTitle: $('playerAlertTitle'),
  alertDescription: $('playerAlertDescription'), alertLink: $('playerAlertLink'),
  trackTitle: $('trackTitle'), trackSubtitle: $('trackSubtitle'),
  youtubeLink: $('youtubeLink'), seek: $('seekBar'), currentTime: $('currentTime'), duration: $('duration'),
  volume: $('volumeControl'), volumeValue: $('volumeValue'), muteButton: $('volumeMuteButton'),
  volumeWaves: $('volumeWaves'), volumeMuteSlash: $('volumeMuteSlash'),
  next: $('nextTrackButton'),
  playbackLabel: $('playbackLabel'), playlistList: $('playlistList'), playlistCount: $('playlistCount'),
  repeatButton: $('repeatButton'), repeatOneButton: $('repeatOneButton'), shuffleButton: $('shuffleButton'),
  playlistEmpty: $('playlistEmpty'), toast: $('toast'),
};

let roomId = null;
let state = null;
let hostToken = null;
let isHost = false;
let stateReceivedAt = 0;
let events = null;
let player = null;
let playerReady = false;
let playerError = null;
let autoplayBlocked = false;
let autoplayAttempted = false;
let playerInitialized = false;
let playerTrackId = null;
let playerEpoch = null;
let seeking = false;
let metadataReportedTrackId = null;
let durationReportedTrackId = null;
let advancingTrackId = null;
let toastTimer;
let precheckEnabled = false;
let addingTrack = false;
let failedVideoIds = new Set();
let searchPageSize = 4;
let searchItems = [];
let searchPage = 0;
let searchNextPageToken = null;
let searchRequestId = 0;
let searchLoading = false;
let searchedQuery = '';
let searchDurationUnavailable = false;
let playlistDrag = null;
const volumeStorageKey = 'music-together-volume';
const volumeRestoreStorageKey = 'music-together-volume-before-mute';
const videoSizeStorageKey = 'music-together-compact-video';
const recentRoomStorageKey = 'music-together-recent-rooms';
const maxRecentRooms = 8;
const playlistActions = new Set(['add', 'load', 'select', 'move', 'remove', 'repeat', 'repeat-one', 'shuffle', 'metadata']);
let recentRooms = readRecentRooms();
let localVolume = readLocalVolume();
let volumeBeforeMute = readVolumeBeforeMute(localVolume);
let compactVideo = false;
try { compactVideo = localStorage.getItem(videoSizeStorageKey) === 'true'; } catch { /* Keep the default view. */ }
updateVolumeUI();
updateVideoSize();

function updateVideoSize() {
  ui.playerPanel.classList.toggle('video-compact', compactVideo);
  ui.videoSizeButton.classList.toggle('is-compact', compactVideo);
  ui.videoSizeButton.setAttribute('aria-label', compactVideo ? '영상 크게 보기' : '영상 작게 보기');
  ui.videoSizeButton.setAttribute('aria-pressed', String(compactVideo));
  ui.videoSizeButton.title = compactVideo ? '영상 크게 보기' : '영상 작게 보기';
}

function readLocalVolume() {
  try {
    const saved = localStorage.getItem(volumeStorageKey);
    if (saved === null) return 100;
    const volume = Number(saved);
    return Number.isInteger(volume) && volume >= 0 && volume <= 100 ? volume : 100;
  } catch { return 100; }
}

function readVolumeBeforeMute(volume) {
  if (volume > 0) return volume;
  try {
    const saved = Number(localStorage.getItem(volumeRestoreStorageKey));
    if (Number.isInteger(saved) && saved >= 1 && saved <= 100) return saved;
  } catch { /* Use the default volume when storage is unavailable. */ }
  return 100;
}

function updateVolumeUI() {
  const muted = localVolume === 0;
  ui.volume.value = String(localVolume);
  ui.volumeValue.textContent = `${localVolume}%`;
  ui.muteButton.setAttribute('aria-pressed', String(muted));
  ui.muteButton.setAttribute('aria-label', muted ? '음소거 해제' : '음소거');
  ui.muteButton.title = muted ? '음소거 해제' : '음소거';
  ui.volumeWaves.classList.toggle('hidden', muted);
  ui.volumeMuteSlash.classList.toggle('hidden', !muted);
}

function applyLocalVolume() {
  if (!playerReady || !player) return;
  player.setVolume(localVolume);
  if (localVolume === 0) player.mute();
  else player.unMute();
}

function setLocalVolume(volume) {
  localVolume = volume;
  if (localVolume > 0) volumeBeforeMute = localVolume;
  updateVolumeUI();
  try {
    localStorage.setItem(volumeStorageKey, String(localVolume));
    localStorage.setItem(volumeRestoreStorageKey, String(volumeBeforeMute));
  } catch { /* The current tab still keeps its volume. */ }
  applyLocalVolume();
}

function showToast(message) {
  ui.toast.textContent = message;
  if (ui.searchDialog.open) ui.searchStatus.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3_200);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safe / 60);
  const remainder = String(safe % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatVideoDuration(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return '--:--';
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

function expectedPosition() {
  if (!state) return 0;
  return Math.max(0, state.position + (state.playing ? (Date.now() - stateReceivedAt) / 1_000 : 0));
}

function canEditPlaylist() {
  return !state?.hostOnly || isHost;
}

function hostStorageKey(id) {
  return `music-together-host:${id}`;
}

function readHostToken(id) {
  try { return localStorage.getItem(hostStorageKey(id)); }
  catch { return null; }
}

function saveHostToken(id, token) {
  try { localStorage.setItem(hostStorageKey(id), token); }
  catch { /* Keep host access in this tab. */ }
}

function readRecentRooms() {
  try {
    const saved = JSON.parse(localStorage.getItem(recentRoomStorageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    const seen = new Set();
    return saved
      .filter((item) => item && /^[a-f0-9]{8}$/.test(item.id)
        && Number.isSafeInteger(item.visitedAt) && item.visitedAt > 0 && item.visitedAt < 8.64e15)
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .filter((item) => !seen.has(item.id) && seen.add(item.id))
      .slice(0, maxRecentRooms);
  } catch { return []; }
}

function saveRecentRooms() {
  try { localStorage.setItem(recentRoomStorageKey, JSON.stringify(recentRooms)); }
  catch { /* Keep recent rooms available until this tab closes. */ }
  renderRecentRooms();
}

function rememberRoom(id) {
  recentRooms = [{ id, visitedAt: Date.now() }, ...recentRooms.filter((item) => item.id !== id)].slice(0, maxRecentRooms);
  saveRecentRooms();
}

function renderRecentRooms() {
  const hasRooms = recentRooms.length > 0;
  ui.landing.classList.toggle('has-recent-rooms', hasRooms);
  ui.recentRooms.classList.toggle('hidden', !hasRooms);
  ui.steps.classList.toggle('hidden', hasRooms);
  const entries = recentRooms.map(({ id, visitedAt }) => {
    const item = document.createElement('li');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'recent-room-open';
    open.dataset.roomId = id;
    open.dataset.action = 'open';
    open.setAttribute('aria-label', `음악방 ${id.toUpperCase()} 다시 입장`);
    const code = document.createElement('strong');
    code.textContent = `#${id.toUpperCase()}`;
    const visited = document.createElement('small');
    visited.textContent = new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(visitedAt);
    const action = document.createElement('span');
    action.textContent = '입장 →';
    open.append(code, visited, action);
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'recent-room-forget';
    forget.dataset.roomId = id;
    forget.dataset.action = 'forget';
    forget.setAttribute('aria-label', `음악방 ${id.toUpperCase()} 방문 기록에서 삭제`);
    forget.title = '방문 기록에서 삭제';
    forget.textContent = '×';
    item.append(open, forget);
    return item;
  });
  ui.recentRoomList.replaceChildren(...entries);
}

function parseVideoId(value) {
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { return null; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1];
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했어요.');
  return data;
}

async function refreshSearchConfig() {
  try {
    const config = await api('/api/config');
    precheckEnabled = config.precheckEnabled;
    ui.searchButton.disabled = !precheckEnabled || searchLoading;
    if (!searchItems.length && !searchLoading) ui.searchStatus.textContent = precheckEnabled
      ? '검색어를 입력해 주세요.'
      : '검색에는 YouTube Data API 키가 필요해요. 링크 입력은 계속 사용할 수 있어요.';
  } catch {
    precheckEnabled = false;
    ui.searchButton.disabled = true;
    ui.searchStatus.textContent = '검색 설정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

function decodeYouTubeText(value) {
  return new DOMParser().parseFromString(value, 'text/html').body.textContent || value;
}

function renderSearchResults(items) {
  ui.searchResults.replaceChildren();
  for (const item of items) {
    const row = document.createElement('li');
    const artwork = document.createElement('div');
    artwork.className = 'search-result-art';
    const image = document.createElement('img');
    image.src = `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`;
    image.alt = '';
    image.loading = 'lazy';
    const duration = document.createElement('span');
    duration.className = 'search-result-duration';
    duration.textContent = formatVideoDuration(item.durationSeconds);
    duration.setAttribute('aria-label', item.durationSeconds ? `영상 길이 ${duration.textContent}` : '영상 길이 확인 불가');
    artwork.append(image, duration);
    const details = document.createElement('div');
    details.className = 'search-result-text';
    const title = document.createElement('strong');
    const displayTitle = decodeYouTubeText(item.title);
    title.textContent = displayTitle;
    const channel = document.createElement('span');
    channel.textContent = decodeYouTubeText(item.channel);
    details.append(title, channel);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '추가';
    button.disabled = !canEditPlaylist();
    button.setAttribute('aria-label', `${displayTitle} 목록에 추가`);
    button.addEventListener('click', () => addVideo(item.videoId, '', button));
    row.append(artwork, details, button);
    ui.searchResults.append(row);
  }
}

function resetSearchResults() {
  searchRequestId++;
  searchItems = [];
  searchPage = 0;
  searchNextPageToken = null;
  searchLoading = false;
  searchedQuery = '';
  searchDurationUnavailable = false;
  ui.searchResults.replaceChildren();
  ui.searchPagination.classList.add('hidden');
  ui.searchButton.disabled = !precheckEnabled;
  ui.searchButton.innerHTML = '검색하기 <span aria-hidden="true">⌕</span>';
}

function updateSearchPageCapacity() {
  const nextSize = window.innerHeight < 470 || (window.innerWidth < 650 && window.innerHeight < 700) ? 1
    : window.innerWidth < 650 || window.innerHeight < 640 ? 2 : 4;
  if (nextSize === searchPageSize) return;
  const firstVisibleIndex = searchPage * searchPageSize;
  searchPageSize = nextSize;
  searchPage = Math.floor(firstVisibleIndex / searchPageSize);
  if (searchItems.length) renderSearchPage();
}

function renderSearchPage() {
  const start = searchPage * searchPageSize;
  const end = Math.min(start + searchPageSize, searchItems.length);
  renderSearchResults(searchItems.slice(start, end));
  ui.searchStatus.textContent = searchItems.length
    ? `${searchPage + 1}페이지 · ${start + 1}~${end}번째 결과 · 곡을 고르면 재생 가능 여부를 확인합니다.${searchDurationUnavailable ? ' 영상 길이를 불러오지 못했어요. 다시 검색해 주세요.' : ''}`
    : '검색 결과가 없어요. 다른 검색어를 입력해 보세요.';
  const hasNext = end < searchItems.length || Boolean(searchNextPageToken);
  ui.searchPagination.classList.toggle('hidden', searchPage === 0 && !hasNext);
  ui.searchPrevious.disabled = searchLoading || searchPage === 0;
  ui.searchNext.disabled = searchLoading || !hasNext;
  ui.searchPageLabel.textContent = `${searchPage + 1}페이지`;
}

function setConnection(connected) {
  ui.connection.classList.toggle('offline', !connected);
  ui.connection.lastElementChild.textContent = connected ? '실시간 연결됨' : '다시 연결 중';
}

function destroyPlayer() {
  if (player?.destroy) player.destroy();
  $('youtubePlayer')?.remove();
  player = null;
  playerReady = false;
  playerError = null;
  playerInitialized = false;
  playerTrackId = null;
  playerEpoch = null;
  const mount = document.createElement('div');
  mount.id = 'youtubePlayer';
  ui.empty.before(mount);
}

function leaveRoom() {
  if (ui.searchDialog.open) ui.searchDialog.close();
  events?.close();
  events = null;
  roomId = null;
  state = null;
  hostToken = null;
  isHost = false;
  stateReceivedAt = 0;
  autoplayBlocked = false;
  autoplayAttempted = false;
  failedVideoIds.clear();
  ui.searchQuery.value = '';
  resetSearchResults();
  ui.searchStatus.textContent = '검색어를 입력해 주세요.';
  metadataReportedTrackId = null;
  durationReportedTrackId = null;
  advancingTrackId = null;
  destroyPlayer();
  ui.room.classList.add('hidden');
  ui.landing.classList.remove('hidden');
  renderRecentRooms();
  history.pushState({}, '', location.pathname);
  document.title = 'music together — 같은 순간, 같은 음악';
}

function render() {
  if (!state) return;
  const hasVideo = Boolean(state.videoId);
  const videoData = playerReady && player ? player.getVideoData() : null;
  ui.code.textContent = `#${state.id.toUpperCase()}`;
  ui.listenerCount.textContent = `${Math.max(1, Number.isFinite(state.listeners) ? state.listeners : 1)}명`;
  const editable = canEditPlaylist();
  ui.role.textContent = state.hostClaimable ? '방장 등록' : state.hostOnly ? '방장만 목록 조작' : '✳ 함께 조작 가능';
  ui.role.disabled = !isHost && !state.hostClaimable;
  ui.role.setAttribute('aria-pressed', String(Boolean(state.hostOnly)));
  ui.role.title = state.hostClaimable ? '기존 방의 방장 권한을 등록합니다' : isHost ? '목록 조작 권한을 변경합니다' : '방장만 변경할 수 있어요';
  ui.empty.classList.toggle('hidden', hasVideo);
  ui.emptyMessage.textContent = state.hostOnly ? '방장이 곡을 추가하면 여기에 표시됩니다.' : '누구든 곡을 추가하면 여기에 표시됩니다.';
  ui.hostCardDescription.textContent = editable ? '유튜브에서 곡을 찾거나 링크를 붙여넣어 주세요.' : '방장만 재생목록에 곡을 추가할 수 있어요.';
  ui.openSearch.disabled = !editable;
  ui.videoUrl.disabled = !editable;
  ui.videoTitle.disabled = !editable;
  ui.addTrack.disabled = !editable || addingTrack;
  for (const button of ui.searchResults.querySelectorAll?.('button') || []) button.disabled = !editable;
  ui.next.disabled = !hasVideo || !state.playlist?.length;
  ui.seek.disabled = !hasVideo || !playerReady || Boolean(playerError);
  ui.playbackLabel.textContent = playerError ? '이 영상은 방 안에서 재생할 수 없어요' : !hasVideo ? '곡을 추가하면 자동으로 재생돼요' : (state.playing ? '모두 함께 재생 중' : '재생이 끝났어요');
  ui.trackTitle.textContent = hasVideo ? (state.current?.titleSource === 'fallback' && videoData?.video_id === state.videoId ? videoData.title || state.current.title : state.current?.title || '유튜브 영상') : '첫 곡을 기다리는 중';
  ui.trackSubtitle.textContent = playerError ? '방 안에서 재생 불가' : hasVideo ? (state.playing ? '지금 함께 듣는 중' : '재생이 끝났어요') : 'YouTube에서 재생됩니다';
  ui.youtubeLink.classList.toggle('hidden', !hasVideo);
  if (hasVideo) ui.youtubeLink.href = `https://www.youtube.com/watch?v=${state.videoId}`;
  ui.joinPlay.classList.toggle('hidden', !hasVideo || !state.playing || !autoplayBlocked || Boolean(playerError));
  ui.alert.classList.toggle('hidden', !playerError);
  if (playerError) {
    ui.alertTitle.textContent = playerError.title;
    ui.alertDescription.textContent = `${playerError.description} (오류 ${playerError.code})`;
    ui.alertLink.href = `https://www.youtube.com/watch?v=${state.videoId}`;
  }
}

function actionButton(label, action, trackId, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'list-action';
  button.textContent = label;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.dataset.action = action;
  button.dataset.trackId = trackId;
  button.disabled = disabled;
  return button;
}

function trackRow(track, index, total) {
  const row = document.createElement('li');
  row.className = 'playlist-item';
  row.dataset.trackId = track.id;
  const isCurrent = track.id === state.currentId;
  row.classList.toggle('is-current', isCurrent);
  if (isCurrent) row.setAttribute('aria-current', 'true');
  const dragHandle = document.createElement('button');
  dragHandle.type = 'button';
  dragHandle.className = 'track-drag-handle';
  dragHandle.dataset.trackId = track.id;
  dragHandle.textContent = '⠿';
  dragHandle.setAttribute('aria-label', `${track.title} 순서 이동, ${index + 1}번째 곡`);
  dragHandle.title = '끌어서 순서 변경 · 방향키 또는 Home/End로 이동';
  dragHandle.disabled = total < 2 || !canEditPlaylist();
  const number = document.createElement('span');
  number.className = 'track-number';
  number.textContent = String(index + 1).padStart(2, '0');
  number.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.className = 'track-thumbnail';
  image.src = `https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`;
  image.alt = '';
  image.loading = 'lazy';
  const details = document.createElement('div');
  details.className = 'playlist-track-details';
  const title = document.createElement('strong');
  title.textContent = track.title;
  const subtitle = document.createElement('span');
  subtitle.textContent = isCurrent ? (state.playing ? '● 지금 재생 중' : '● 현재 곡 · 재생 종료') : 'YouTube';
  details.append(title, subtitle);
  const actions = document.createElement('div');
  actions.className = 'list-actions';
  if (canEditPlaylist() && (!isCurrent || !state.playing)) actions.append(actionButton('재생', 'select', track.id));
  if (canEditPlaylist()) actions.append(actionButton('삭제', 'remove', track.id));
  row.append(dragHandle, number, image, details, actions);
  return row;
}

function renderPlaylist() {
  if (playlistDrag) stopPlaylistDrag();
  const playlist = state?.playlist || [];
  ui.playlistCount.textContent = `${playlist.length}곡`;
  const repeatingOne = state?.repeatOne === true;
  const repeating = state?.repeat !== false && !repeatingOne;
  const shuffling = state?.shuffle === true;
  ui.repeatButton.setAttribute('aria-pressed', String(repeating));
  ui.repeatOneButton.setAttribute('aria-pressed', String(repeatingOne));
  ui.shuffleButton.setAttribute('aria-pressed', String(shuffling));
  ui.repeatButton.disabled = !canEditPlaylist();
  ui.repeatOneButton.disabled = !canEditPlaylist();
  ui.shuffleButton.disabled = !canEditPlaylist();
  ui.playlistEmpty.classList.toggle('hidden', playlist.length > 0);
  ui.playlistList.replaceChildren(...playlist.map((track, index) => trackRow(track, index, playlist.length)));
}

function playerErrorMessage(code) {
  if (code === 100) return { title: '영상을 찾을 수 없어요', description: '삭제되었거나 비공개 영상입니다. 다른 링크를 선택해 주세요.' };
  if (code === 101 || code === 150) return { title: '이 영상은 방 안에서 재생할 수 없어요', description: 'YouTube가 이 사이트에서의 재생을 차단했습니다. API 검사에서 허용으로 보여도 권리자나 플랫폼 제한이 적용될 수 있어요. 다른 영상을 추가해 주세요.' };
  if (code === 153) return { title: 'YouTube가 이 브라우저의 재생을 차단했어요', description: '사이트 식별 정보가 전달되지 않았을 수 있습니다. 일반 브라우저에서 열어 보세요.' };
  if (code === 5) return { title: '브라우저에서 영상을 재생하지 못했어요', description: '다른 브라우저에서 시도하거나 다른 영상을 선택해 주세요.' };
  return { title: '이 영상을 재생하지 못했어요', description: '유튜브에서 영상을 확인하거나 다른 링크를 선택해 주세요.' };
}

async function probeEmbeddedPlayback(videoId) {
  if (!window.YT?.Player) return { allowed: false, reason: 'YouTube 플레이어를 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' };
  const inSearchDialog = ui.searchDialog.open;
  const preview = inSearchDialog ? ui.searchProbePreview : ui.probePreview;
  const mountId = inSearchDialog ? 'searchProbePlayer' : 'probePlayer';
  preview.classList.remove('hidden');
  const mount = document.createElement('div');
  mount.id = mountId;
  const previousMount = $(mountId);
  if (previousMount) previousMount.replaceWith(mount);
  else preview.append(mount);
  return new Promise((resolve) => {
    let probe = null;
    let settled = false;
    let readyTimer = null;
    const timeout = setTimeout(() => finish({ allowed: false, reason: '삽입 재생 확인 시간이 초과됐어요. 다시 시도해 주세요.' }), 8_000);
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(readyTimer);
      try { probe?.destroy(); } catch { /* The iframe may not have finished loading. */ }
      $(mountId)?.remove();
      const placeholder = document.createElement('div');
      placeholder.id = mountId;
      preview.append(placeholder);
      preview.classList.add('hidden');
      resolve(result);
    }
    try {
      probe = new YT.Player(mount, {
        width: 200, height: 200, videoId,
        playerVars: { playsinline: 1, controls: 0, origin: location.origin, rel: 0 },
        events: {
          onReady() {
            if (settled) return;
            // onReady only confirms the iframe loaded; give YouTube time to report video errors.
            readyTimer = setTimeout(() => finish({ allowed: true }), 3_000);
          },
          onError(event) {
            const reason = [100, 101, 150].includes(event.data)
              ? '이 영상은 이 사이트의 삽입 플레이어에서 재생할 수 없어요. 목록에 추가하지 않았습니다.'
              : '이 브라우저에서 영상 재생을 확인하지 못했어요. 목록에 추가하지 않았습니다.';
            finish({ allowed: false, reason });
          },
        },
      });
    } catch {
      finish({ allowed: false, reason: '삽입 플레이어를 만들지 못했어요. 다시 시도해 주세요.' });
    }
  });
}

function skipUnplayableTrack() {
  if (!state?.current || ![100, 101, 150].includes(playerError?.code)) return false;
  const trackId = state.current.id;
  if (advancingTrackId === trackId) return true;
  failedVideoIds.add(state.videoId);
  const hasAnotherCandidate = state.playlist
    .some((track) => !failedVideoIds.has(track.videoId));
  if (hasAnotherCandidate) {
    advancingTrackId = trackId;
    showToast('재생할 수 없는 곡을 건너뛰고 다음 곡으로 넘어갑니다.');
    sendControl('next', { trackId, playbackEpoch: state.playbackEpoch }).then((result) => {
      if (!result && advancingTrackId === trackId) advancingTrackId = null;
    });
    return true;
  }
  if (state.playing) {
    advancingTrackId = trackId;
    sendControl('pause', { position: 0 }).then(() => {
      if (advancingTrackId === trackId) advancingTrackId = null;
    });
  }
  return false;
}

function ensurePlayer() {
  if (!state?.videoId || player || !window.YT?.Player) return;
  playerTrackId = state.current.id;
  playerEpoch = state.playbackEpoch;
  player = new YT.Player('youtubePlayer', {
    width: '100%', height: '100%', videoId: state.videoId,
    playerVars: { playsinline: 1, controls: 0, disablekb: 1, origin: location.origin, rel: 0 },
    events: {
      onReady(event) {
        if (event.target !== player) return;
        playerReady = true;
        applyLocalVolume();
        syncPlayer();
        render();
      },
      onStateChange(event) {
        if (event.target !== player) return;
        if (event.data === YT.PlayerState.PLAYING) {
          playerError = null;
          autoplayBlocked = false;
          autoplayAttempted = false;
          failedVideoIds.clear();
        }
        if (event.data === YT.PlayerState.CUED || event.data === YT.PlayerState.PAUSED) {
          autoplayAttempted = false;
          syncPlayer();
        }
        if (state?.videoId && playerReady && event.data === YT.PlayerState.ENDED && state.current && advancingTrackId !== state.current.id) {
          advancingTrackId = state.current.id;
          sendControl('next', { trackId: advancingTrackId, playbackEpoch: state.playbackEpoch, fromEnd: true }).then((result) => { if (!result) advancingTrackId = null; });
        }
        render();
      },
      onAutoplayBlocked(event) {
        if (event.target !== player) return;
        autoplayBlocked = true;
        autoplayAttempted = false;
        render();
      },
      onError(event) {
        if (event.target !== player) return;
        playerError = { code: event.data, ...playerErrorMessage(event.data) };
        render();
        if (!skipUnplayableTrack()) showToast(playerError.title);
      },
    },
  });
}

function syncPlayer() {
  if (!playerReady || !state?.videoId || playerError) return;
  if (!playerInitialized) {
    playerInitialized = true;
    const target = expectedPosition();
    if (playerTrackId !== state.current.id || playerEpoch !== state.playbackEpoch) {
      playerTrackId = state.current.id;
      playerEpoch = state.playbackEpoch;
      const video = { videoId: state.videoId, startSeconds: target };
      if (state.playing && !autoplayBlocked) {
        autoplayAttempted = true;
        player.loadVideoById(video);
      }
      else player.cueVideoById(video);
      render();
      return;
    }
    if (target > 1.5) player.cueVideoById({ videoId: state.videoId, startSeconds: target });
  }
  if (autoplayBlocked) {
    if (!state.playing && player.getPlayerState() === YT.PlayerState.PLAYING) player.pauseVideo();
    render();
    return;
  }
  const target = expectedPosition();
  const actual = player.getCurrentTime() || 0;
  if (Math.abs(target - actual) > 2) player.seekTo(target, true);
  const playerState = player.getPlayerState();
  if (state.playing && !autoplayAttempted && [YT.PlayerState.PAUSED, YT.PlayerState.CUED, YT.PlayerState.UNSTARTED].includes(playerState)) {
    autoplayAttempted = true;
    player.playVideo();
  }
  if (!state.playing && playerState === YT.PlayerState.PLAYING) player.pauseVideo();
  render();
}

function applyState(next) {
  if (next.id !== roomId || (state && next.version < state.version)) return;
  const videoChanged = state?.videoId !== next.videoId || state?.currentId !== next.currentId
    || state?.playbackEpoch !== next.playbackEpoch;
  state = next;
  stateReceivedAt = Date.now();
  if (videoChanged) {
    autoplayAttempted = false;
    playerInitialized = false;
    metadataReportedTrackId = null;
    durationReportedTrackId = null;
    advancingTrackId = null;
    playerError = null;
    if (!next.videoId && player) destroyPlayer();
  }
  render();
  renderPlaylist();
  ensurePlayer();
  if (playerReady) syncPlayer();
  skipUnplayableTrack();
}

async function sendControl(type, extra = {}) {
  if (!roomId) return null;
  if (playlistActions.has(type) && !canEditPlaylist()) {
    showToast('이 방은 방장만 재생목록을 변경할 수 있어요.');
    return null;
  }
  try {
    const next = await api(`/api/rooms/${roomId}/control`, {
      method: 'POST', body: JSON.stringify({ type, ...extra }),
      headers: hostToken ? { 'X-Room-Host-Token': hostToken } : {},
    });
    applyState(next);
    return next;
  } catch (error) { showToast(error.message); return null; }
}

async function enterRoom(id, createdHostToken = null) {
  events?.close();
  roomId = id;
  hostToken = createdHostToken || readHostToken(id);
  isHost = false;
  state = null;
  stateReceivedAt = 0;
  autoplayBlocked = false;
  autoplayAttempted = false;
  failedVideoIds.clear();
  ui.searchQuery.value = '';
  resetSearchResults();
  ui.searchStatus.textContent = '검색어를 입력해 주세요.';
  ui.landing.classList.add('hidden');
  ui.room.classList.remove('hidden');
  ui.code.textContent = `#${id.toUpperCase()}`;
  setConnection(false);
  history.replaceState({}, '', `/?room=${id}`);
  document.title = `음악방 ${id.toUpperCase()} — music together`;
  try {
    const room = await api(`/api/rooms/${id}`);
    if (hostToken) {
      const verification = await api(`/api/rooms/${id}/host`, {
        headers: { 'X-Room-Host-Token': hostToken },
      });
      isHost = verification.isHost === true;
      if (isHost) saveHostToken(id, hostToken);
      else {
        hostToken = null;
        try { localStorage.removeItem(hostStorageKey(id)); } catch { /* Ignore unavailable storage. */ }
      }
    }
    applyState(room);
    rememberRoom(id);
  } catch (error) {
    showToast(error.message);
    leaveRoom();
    return;
  }
  events = new EventSource(`/api/rooms/${id}/events`);
  events.onopen = () => { setConnection(true); refreshSearchConfig(); };
  events.onerror = () => setConnection(false);
  events.onmessage = (event) => {
    try { applyState(JSON.parse(event.data)); } catch { /* Ignore malformed events. */ }
  };
}

ui.create.addEventListener('click', async () => {
  ui.create.disabled = true;
  try {
    const room = await api('/api/rooms', { method: 'POST' });
    await enterRoom(room.id, room.hostToken);
    showToast('음악방을 만들었어요. 친구에게 초대 링크를 보내세요!');
  } catch (error) { showToast(error.message); }
  finally { ui.create.disabled = false; }
});

ui.leave.addEventListener('click', leaveRoom);
ui.brand.addEventListener('click', (event) => { event.preventDefault(); leaveRoom(); });
ui.recentRoomList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-room-id]');
  if (!button) return;
  const id = button.dataset.roomId;
  if (button.dataset.action === 'forget') {
    recentRooms = recentRooms.filter((item) => item.id !== id);
    saveRecentRooms();
  } else enterRoom(id);
});
ui.role.addEventListener('click', async () => {
  if (!state) return;
  if (state.hostClaimable) {
    ui.role.disabled = true;
    try {
      const claimed = await api(`/api/rooms/${roomId}/claim-host`, { method: 'POST' });
      const { hostToken: claimedToken, ...nextState } = claimed;
      hostToken = claimedToken;
      isHost = true;
      saveHostToken(roomId, claimedToken);
      applyState(nextState);
      showToast('이 브라우저를 방장으로 등록했어요.');
    } catch (error) {
      showToast(error.message);
      try { applyState(await api(`/api/rooms/${roomId}`)); } catch { /* Reconnect will refresh the room. */ }
    } finally { render(); }
    return;
  }
  if (isHost) sendControl('access', { hostOnly: !state.hostOnly });
});
async function copyInviteLink(link) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(link);
    return;
  } catch {
    const input = document.createElement('textarea');
    input.value = link;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    try {
      input.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } finally {
      input.remove();
    }
  }
}

ui.copy.addEventListener('click', async () => {
  if (!roomId) return;
  ui.copy.disabled = true;
  try {
    await copyInviteLink(`${location.origin}/?room=${roomId}`);
    ui.copyLabel.textContent = '복사 완료';
    showToast('초대 링크를 복사했어요.');
    setTimeout(() => { ui.copyLabel.textContent = '초대 링크 복사'; }, 1800);
  } catch {
    showToast('링크를 복사하지 못했어요. 주소창에서 복사해 주세요.');
  } finally {
    ui.copy.disabled = false;
  }
});

ui.openSearch.addEventListener('click', () => {
  ui.searchDialog.showModal();
  document.body.classList.add('search-dialog-open');
  updateSearchPageCapacity();
  ui.searchQuery.focus();
});
ui.closeSearch.addEventListener('click', () => ui.searchDialog.close());
ui.searchDialog.addEventListener('close', () => document.body.classList.remove('search-dialog-open'));
ui.searchDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    ui.searchDialog.close();
  } else if (event.target !== ui.searchQuery && event.key === 'ArrowLeft') {
    event.preventDefault();
    if (!ui.searchPrevious.disabled) ui.searchPrevious.click();
  } else if (event.target !== ui.searchQuery && event.key === 'ArrowRight') {
    event.preventDefault();
    if (!ui.searchNext.disabled) ui.searchNext.click();
  }
}, true);
ui.searchDialog.addEventListener('click', (event) => {
  if (event.target !== ui.searchDialog) return;
  const bounds = ui.searchDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) ui.searchDialog.close();
});

ui.searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = ui.searchQuery.value.trim();
  if (query.length < 2) return showToast('검색어를 2자 이상 입력해 주세요.');
  if (!precheckEnabled) return showToast('YouTube 검색에는 로컬 API 키가 필요해요.');
  resetSearchResults();
  searchedQuery = query;
  const requestId = searchRequestId;
  const id = roomId;
  searchLoading = true;
  ui.searchButton.disabled = true;
  ui.searchButton.textContent = '검색 중…';
  ui.searchStatus.textContent = 'YouTube에서 곡을 찾는 중…';
  try {
    const result = await api(`/api/rooms/${id}/search`, {
      method: 'POST', body: JSON.stringify({ query }),
    });
    if (requestId !== searchRequestId) return;
    searchItems = result.items;
    searchNextPageToken = result.nextPageToken || null;
    searchDurationUnavailable = Boolean(result.durationUnavailable);
    renderSearchPage();
  } catch (error) {
    if (requestId === searchRequestId) ui.searchStatus.textContent = error.message;
  } finally {
    if (requestId === searchRequestId) {
      searchLoading = false;
      ui.searchButton.disabled = !precheckEnabled;
      ui.searchButton.innerHTML = '검색하기 <span aria-hidden="true">⌕</span>';
      if (searchItems.length) renderSearchPage();
    }
  }
});

ui.searchPrevious.addEventListener('click', () => {
  if (searchLoading || searchPage === 0) return;
  searchPage--;
  renderSearchPage();
});

ui.searchNext.addEventListener('click', async () => {
  if (searchLoading) return;
  const nextPage = searchPage + 1;
  const targetStart = nextPage * searchPageSize;
  if (targetStart < searchItems.length) {
    searchPage = nextPage;
    renderSearchPage();
    return;
  }
  if (!searchNextPageToken) return;
  const pageToken = searchNextPageToken;
  const requestId = searchRequestId;
  const id = roomId;
  searchLoading = true;
  renderSearchPage();
  ui.searchStatus.textContent = '다음 검색 결과를 불러오는 중…';
  try {
    const result = await api(`/api/rooms/${id}/search`, {
      method: 'POST', body: JSON.stringify({ query: searchedQuery, pageToken }),
    });
    if (requestId !== searchRequestId) return;
    const seen = new Set(searchItems.map((item) => item.videoId));
    searchItems.push(...result.items.filter((item) => !seen.has(item.videoId)));
    searchNextPageToken = result.nextPageToken && result.nextPageToken !== pageToken ? result.nextPageToken : null;
    searchDurationUnavailable = Boolean(result.durationUnavailable);
    if (targetStart < searchItems.length) searchPage = Math.floor(targetStart / searchPageSize);
    renderSearchPage();
  } catch (error) {
    if (requestId === searchRequestId) ui.searchStatus.textContent = error.message;
  } finally {
    if (requestId === searchRequestId) {
      searchLoading = false;
      ui.searchPrevious.disabled = searchPage === 0;
      ui.searchNext.disabled = (searchPage + 1) * searchPageSize >= searchItems.length && !searchNextPageToken;
    }
  }
});

async function addVideo(videoId, title, button) {
  if (!canEditPlaylist()) return showToast('이 방은 방장만 재생목록을 변경할 수 있어요.');
  if (addingTrack) return;
  addingTrack = true;
  const wasEmpty = !state?.current;
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.textContent = '재생 확인 중…';
  try {
    const probe = await probeEmbeddedPlayback(videoId);
    if (!probe.allowed) return showToast(probe.reason);
    button.textContent = precheckEnabled ? 'YouTube 정보 확인 중…' : '곡 추가 중…';
    const result = await sendControl('add', { videoId, title });
    if (result) {
      showToast(wasEmpty ? '첫 곡을 준비했어요.' : '재생목록 끝에 추가했어요.');
    }
    return result;
  } finally {
    button.disabled = !canEditPlaylist();
    button.innerHTML = originalLabel;
    addingTrack = false;
  }
}

ui.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const videoId = parseVideoId(ui.videoUrl.value);
  if (!videoId) return showToast('올바른 유튜브 영상 링크를 입력해 주세요.');
  if (await addVideo(videoId, ui.videoTitle.value.trim(), ui.addTrack)) {
    ui.videoUrl.value = '';
    ui.videoTitle.value = '';
  }
});

ui.next.addEventListener('click', () => sendControl('next', { playbackEpoch: state?.playbackEpoch }));
ui.repeatButton.addEventListener('click', () => {
  if (state) sendControl('repeat', { enabled: state.repeat === false });
});
ui.repeatOneButton.addEventListener('click', () => {
  if (state) sendControl('repeat-one', { enabled: state.repeatOne !== true });
});
ui.shuffleButton.addEventListener('click', () => {
  if (state) sendControl('shuffle', { enabled: state.shuffle !== true });
});
ui.playlistList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'select') {
    autoplayBlocked = false;
    sendControl('select', { trackId: button.dataset.trackId });
    return;
  }
  if (button.dataset.action === 'remove') sendControl('remove', { trackId: button.dataset.trackId });
});

function stopPlaylistDrag() {
  const drag = playlistDrag;
  if (!drag) return null;
  playlistDrag = null;
  if (drag.frame) cancelAnimationFrame(drag.frame);
  drag.row.classList.remove('is-dragging');
  for (const row of ui.playlistList.children) row.classList.remove('drop-before', 'drop-after');
  if (drag.handle.hasPointerCapture?.(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
  return drag;
}

function updatePlaylistDropTarget(clientY) {
  const drag = playlistDrag;
  if (!drag) return;
  const rows = [...ui.playlistList.children].filter((row) => row !== drag.row);
  for (const row of rows) row.classList.remove('drop-before', 'drop-after');
  let targetIndex = rows.findIndex((row) => clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
  if (targetIndex < 0) targetIndex = rows.length;
  drag.targetIndex = targetIndex;
  if (targetIndex < rows.length) rows[targetIndex].classList.add('drop-before');
  else rows.at(-1)?.classList.add('drop-after');
}

function scrollPlaylistWhileDragging() {
  const drag = playlistDrag;
  if (!drag?.moved) return;
  const edge = 65;
  const speed = drag.lastY < edge ? -Math.ceil((edge - drag.lastY) / 6)
    : drag.lastY > window.innerHeight - edge ? Math.ceil((drag.lastY - window.innerHeight + edge) / 6) : 0;
  if (speed) {
    window.scrollBy(0, speed);
    updatePlaylistDropTarget(drag.lastY);
  }
  drag.frame = requestAnimationFrame(scrollPlaylistWhileDragging);
}

ui.playlistList.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.track-drag-handle');
  if (playlistDrag || !handle || handle.disabled || event.button !== 0 || event.isPrimary === false) return;
  event.preventDefault();
  playlistDrag = {
    handle, row: handle.closest('.playlist-item'), trackId: handle.dataset.trackId,
    pointerId: event.pointerId, startY: event.clientY, lastY: event.clientY,
    targetIndex: null, moved: false, frame: null,
  };
  handle.setPointerCapture(event.pointerId);
});

ui.playlistList.addEventListener('pointermove', (event) => {
  const drag = playlistDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.row.isConnected) return stopPlaylistDrag();
  drag.lastY = event.clientY;
  if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.row.classList.add('is-dragging');
    drag.frame = requestAnimationFrame(scrollPlaylistWhileDragging);
  }
  updatePlaylistDropTarget(event.clientY);
});

ui.playlistList.addEventListener('pointerup', (event) => {
  if (!playlistDrag || event.pointerId !== playlistDrag.pointerId) return;
  const drag = stopPlaylistDrag();
  if (drag.moved && drag.targetIndex !== null) {
    const originalIndex = state?.playlist.findIndex((track) => track.id === drag.trackId);
    if (originalIndex >= 0 && originalIndex !== drag.targetIndex) {
      sendControl('move', { trackId: drag.trackId, targetIndex: drag.targetIndex });
    }
  }
});
ui.playlistList.addEventListener('pointercancel', (event) => {
  if (playlistDrag?.pointerId === event.pointerId) stopPlaylistDrag();
});

ui.playlistList.addEventListener('keydown', async (event) => {
  const handle = event.target.closest('.track-drag-handle');
  if (!handle || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = state?.playlist.findIndex((track) => track.id === handle.dataset.trackId);
  if (index < 0) return;
  const lastIndex = state.playlist.length - 1;
  const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? lastIndex
    : Math.max(0, Math.min(lastIndex, index + (event.key === 'ArrowUp' ? -1 : 1)));
  if (targetIndex === index) return;
  await sendControl('move', { trackId: handle.dataset.trackId, targetIndex });
  [...ui.playlistList.querySelectorAll('.track-drag-handle')]
    .find((button) => button.dataset.trackId === handle.dataset.trackId)?.focus();
});

ui.joinPlay.addEventListener('click', () => {
  if (!playerReady) return showToast('영상을 불러오는 중이에요. 잠시 후 다시 눌러주세요.');
  autoplayBlocked = false;
  autoplayAttempted = true;
  player.seekTo(expectedPosition(), true);
  player.playVideo();
  render();
});

ui.seek.addEventListener('input', () => {
  seeking = true;
  ui.currentTime.textContent = formatTime(ui.seek.value);
});
ui.seek.addEventListener('change', () => {
  if (!playerReady) return;
  const position = Number(ui.seek.value);
  player.seekTo(position, true);
  sendControl('seek', { position });
  seeking = false;
});

ui.volume.addEventListener('input', () => {
  setLocalVolume(Number(ui.volume.value));
});

ui.muteButton.addEventListener('click', () => setLocalVolume(localVolume === 0 ? volumeBeforeMute : 0));

ui.videoSizeButton.addEventListener('click', () => {
  compactVideo = !compactVideo;
  updateVideoSize();
  try { localStorage.setItem(videoSizeStorageKey, String(compactVideo)); } catch { /* Keep this tab's choice. */ }
});

window.addEventListener('resize', () => {
  if (ui.searchDialog.open) updateSearchPageCapacity();
});

window.onYouTubeIframeAPIReady = () => ensurePlayer();
if (window.YT?.Player) ensurePlayer();

setInterval(() => {
  if (!state?.videoId) return;
  const duration = playerReady ? Math.max(0, player.getDuration() || 0) : 0;
  const current = expectedPosition();
  if (!seeking) {
    ui.seek.max = Math.max(1, Math.ceil(duration || current + 1));
    ui.seek.value = Math.min(Number(ui.seek.max), current);
    ui.currentTime.textContent = formatTime(current);
  }
  ui.duration.textContent = formatTime(duration);
  if (playerReady) {
    const videoData = player.getVideoData();
    if (state.current && !state.current.durationSeconds && duration > 0 && duration <= 86_400
      && videoData?.video_id === state.videoId && playerTrackId === state.current.id
      && durationReportedTrackId !== state.current.id) {
      durationReportedTrackId = state.current.id;
      sendControl('duration', { trackId: state.current.id, durationSeconds: Math.ceil(duration) }).then((result) => {
        if (!result) durationReportedTrackId = null;
      });
    }
    if (state.current?.titleSource === 'fallback' && videoData?.video_id === state.videoId && videoData.title) ui.trackTitle.textContent = videoData.title;
    if (canEditPlaylist() && state.current?.titleSource === 'fallback' && videoData?.video_id === state.videoId && videoData.title && metadataReportedTrackId !== state.current.id) {
      metadataReportedTrackId = state.current.id;
      sendControl('metadata', { trackId: state.current.id, title: videoData.title }).then((result) => {
        if (!result) metadataReportedTrackId = null;
      });
    }
    syncPlayer();
  }
}, 1_000);

const initialRoom = new URLSearchParams(location.search).get('room');
renderRecentRooms();
if (initialRoom && /^[a-f0-9]{8}$/.test(initialRoom)) enterRoom(initialRoom);
else if (initialRoom) showToast('올바른 초대 링크가 아니에요.');
