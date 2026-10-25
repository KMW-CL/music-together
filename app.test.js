import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

test('the next song uses the activated YouTube player while the tab is hidden', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        listeners: {}, dataset: {}, classList: {
          states: new Map(),
          toggle(name, active) { this.states.set(name, active); },
          add(name) { this.states.set(name, true); },
          remove(name) { this.states.set(name, false); },
        },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        setAttribute() {}, replaceChildren() {}, append() {}, before() {}, remove() {},
      });
    }
    return elements.get(id);
  };
  const players = [];
  const lyricsCalls = [];
  const playerStates = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, CUED: 5 };
  const savedSettings = new Map();

  class FakePlayer {
    constructor(_mount, options) {
      this.options = options;
      this.videoId = options.videoId;
      this.position = 0;
      this.playerState = playerStates.CUED;
      this.loads = [];
      this.cues = [];
      this.destroyed = false;
      players.push(this);
    }
    ready() { this.options.events.onReady({ target: this }); }
    playVideo() {
      this.playerState = playerStates.PLAYING;
      this.options.events.onStateChange({ target: this, data: this.playerState });
    }
    pauseVideo() { this.playerState = playerStates.PAUSED; }
    loadVideoById(video) {
      this.loads.push(video);
      this.videoId = video.videoId;
      this.position = video.startSeconds;
      this.playerState = playerStates.PLAYING;
    }
    cueVideoById(video) {
      this.cues.push(video);
      this.videoId = video.videoId;
      this.position = video.startSeconds;
      this.playerState = playerStates.CUED;
    }
    getPlayerState() { return this.playerState; }
    getCurrentTime() { return this.position; }
    getVideoData() { return { video_id: this.videoId, title: 'Test song' }; }
    setVolume(volume) { this.volume = volume; }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    seekTo(position) { this.position = position; }
    destroy() { this.destroyed = true; }
  }

  const context = vm.createContext({
    document: { hidden: true, body: { classList: { add() {}, remove() {} } }, getElementById: element, createElement: () => element(Symbol()) },
    window: { YT: { Player: FakePlayer }, addEventListener() {},
      musicLyrics: { setTrack(...args) { lyricsCalls.push(args); } } },
    YT: { Player: FakePlayer, PlayerState: playerStates },
    localStorage: { getItem: (key) => savedSettings.get(key) ?? null, setItem: (key, value) => savedSettings.set(key, value) },
    location: { origin: 'http://localhost:3000', search: '' },
    URLSearchParams, URL, Date, Math, Number, String, Boolean, Set,
    setInterval() {}, clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(await readFile(new URL('./public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext("roomId = '1234abcd'", context);

  const room = (id, videoId, version) => ({
    id: '1234abcd', current: { id, videoId, title: id, artistHint: id === 'first' ? 'GIRIBOY(기리보이)' : '' }, videoId,
    playlist: [{ id, videoId, title: id }], currentId: id, playbackEpoch: version,
    playing: true, position: 0, version, listeners: 1,
  });
  const firstRoom = room('first', 'AAAAAAAAAAA', 1);
  firstRoom.upNext = { track: { id: 'queued', videoId: 'CCCCCCCCCCC', title: '대기한 곡' }, source: 'queue' };
  firstRoom.playNext = ['queued'];
  context.applyState(firstRoom);
  assert.equal(elements.get('upNextTitle').textContent, '대기한 곡');
  assert.match(elements.get('upNextDetail').textContent, /다음 재생 대기열/);
  assert.equal(lyricsCalls.at(-1)[3], 'GIRIBOY(기리보이)');
  assert.equal(players.length, 1);
  players[0].ready();
  assert.equal(players[0].getPlayerState(), playerStates.PLAYING, '입장하면 재생을 자동으로 시도한다');
  assert.equal(elements.get('volumeControl').value, '30');
  assert.equal(elements.get('volumeValue').textContent, '30%');
  assert.equal(players[0].volume, 30);
  assert.equal(elements.get('joinPlayButton').classList.states.get('hidden'), true);
  elements.get('volumeControl').value = '35';
  elements.get('volumeControl').listeners.input();
  assert.equal(players[0].volume, 35);
  elements.get('volumeMuteButton').listeners.click();
  assert.equal(players[0].muted, true);
  assert.equal(elements.get('volumeControl').value, '0');
  assert.equal(savedSettings.get('music-together-volume'), '0');
  assert.equal(savedSettings.get('music-together-volume-before-mute'), '35');
  elements.get('volumeMuteButton').listeners.click();
  assert.equal(players[0].muted, false);
  assert.equal(players[0].volume, 35);
  assert.equal(savedSettings.get('music-together-volume-before-mute'), '35');
  players[0].playerState = playerStates.CUED;
  players[0].options.events.onAutoplayBlocked({ target: players[0] });
  assert.equal(vm.runInContext('autoplayBlocked', context), true);
  assert.equal(elements.get('joinPlayButton').classList.states.get('hidden'), false);
  elements.get('joinPlayButton').listeners.click();
  assert.equal(players[0].getPlayerState(), playerStates.PLAYING, '자동 재생 차단 시 사용자가 소리를 켤 수 있다');
  assert.equal(elements.get('joinPlayButton').classList.states.get('hidden'), true);

  context.applyState(room('second', 'BBBBBBBBBBB', 2));
  assert.equal(players.length, 1);
  assert.equal(players[0].destroyed, false);
  assert.equal(players[0].loads.length, 1);
  assert.equal(players[0].loads[0].videoId, 'BBBBBBBBBBB');

  context.applyState(room('second', 'BBBBBBBBBBB', 3));
  assert.equal(players[0].loads.length, 2, 'replaying the same video must restart it');
  assert.ok(players[0].loads[1].startSeconds < 0.1, 'replay should restart near the beginning');
});

test('playlist search jumps between matching rows without changing the playing track', async () => {
  const elements = new Map();
  const scrolled = [];
  const makeElement = () => ({
    listeners: {}, dataset: {}, children: [], value: '',
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setAttribute() {},
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    before() {}, remove() {},
    scrollIntoView() { scrolled.push(this.dataset.trackId); },
  });
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { body: { classList: { add() {}, remove() {} } }, getElementById: element, createElement: makeElement },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: () => null },
    location: { origin: 'http://localhost:3000', search: '' },
    URLSearchParams, URL, Date, Math, Number, String, Boolean, Set,
    setInterval() {}, clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(await readFile(new URL('./public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext(`state = ${JSON.stringify({
    currentId: 'a', repeat: true, playlist: [
      { id: 'a', videoId: 'AAAAAAAAAAA', title: '첫 곡' },
      { id: 'b', videoId: 'BBBBBBBBBBB', title: 'Moonlight' },
      { id: 'c', videoId: 'CCCCCCCCCCC', title: 'Blue Moon' },
    ],
  })}; renderPlaylist()`, context);
  const query = elements.get('playlistSearchQuery');
  query.value = 'moon';
  query.listeners.input();
  assert.match(elements.get('playlistSearchStatus').textContent, /2곡 찾음/);
  elements.get('playlistSearchForm').listeners.submit({ preventDefault() {} });
  assert.deepEqual(scrolled, ['b']);
  elements.get('playlistSearchNext').listeners.click();
  assert.deepEqual(scrolled, ['b', 'c']);
  elements.get('playlistSearchPrevious').listeners.click();
  assert.deepEqual(scrolled, ['b', 'c', 'b']);
  query.value = '3';
  query.listeners.input();
  elements.get('playlistSearchForm').listeners.submit({ preventDefault() {} });
  assert.equal(scrolled.at(-1), 'c');
  assert.equal(vm.runInContext('state.currentId', context), 'a');
  query.value = '없는 곡';
  query.listeners.input();
  assert.equal(elements.get('playlistSearchNext').disabled, true);
  assert.match(elements.get('playlistSearchStatus').textContent, /일치하는 곡이 없어요/);
});

test('search cards paginate without scrolling and fetch more after the loaded results', async () => {
  const elements = new Map();
  const makeElement = () => ({
    listeners: {}, dataset: {}, children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); },
    focus() { this.focused = true; },
    click() { return this.listeners.click?.(); },
    setAttribute() {},
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
  });
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  };
  const calls = [];
  const savedSettings = new Map();
  const viewport = {
    innerWidth: 900, innerHeight: 700, listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
  const items = (count, prefix) => Array.from({ length: count }, (_, index) => ({
    videoId: `${prefix}${String(index).padStart(10, '0')}`,
    title: `Song ${index}`, channel: 'Artist', durationSeconds: index === 0 ? 222 : undefined,
  }));
  const context = vm.createContext({
    document: { body: { classList: { add() {}, remove() {} } }, getElementById: element, createElement: makeElement },
    window: viewport,
    localStorage: { getItem: (key) => savedSettings.get(key) ?? null, setItem: (key, value) => savedSettings.set(key, value) },
    location: { origin: 'http://localhost:3000', search: '' },
    DOMParser: class { parseFromString(value) { return { body: { textContent: value } }; } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return { ok: true, json: async () => body.pageToken
        ? { items: items(25, 'B'), nextPageToken: null }
        : { items: [...items(10, 'A'), { videoId: 'Ocq3Y6DH4D0', title: 'Blocked song', channel: 'Artist' }], nextPageToken: 'PAGE_TWO' } };
    },
    URLSearchParams, URL, Date, Math, Number, String, Boolean, Set,
    setInterval() {}, clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(await readFile(new URL('./public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext("probeCalls = 0; probeEmbeddedPlayback = async () => { probeCalls++; throw new Error('Search must not open an embedded player'); }", context);
  vm.runInContext("roomId = '1234abcd'; precheckEnabled = true", context);
  elements.get('openSearchButton').listeners.click();
  assert.equal(elements.get('searchDialog').open, true);
  assert.equal(elements.get('searchQuery').focused, true);
  elements.get('searchQuery').value = 'jazz piano';
  await elements.get('searchForm').listeners.submit({ preventDefault() {} });
  assert.equal(elements.get('searchResults').children.length, 4);
  assert.equal(vm.runInContext('probeCalls', context), 0, 'searching must not open an embedded player');
  assert.equal(vm.runInContext("searchItems.some((item) => item.videoId === 'Ocq3Y6DH4D0')", context), false);
  assert.equal(elements.get('searchResults').children[0].children[0].children[1].textContent, '3:42');
  assert.equal(elements.get('searchResults').children[1].children[0].children[1].textContent, '--:--');
  assert.equal(context.formatVideoDuration(3_723), '1:02:03');
  assert.equal(elements.get('searchPageLabel').textContent, '1페이지');
  assert.equal(calls.length, 1);

  await elements.get('searchNext').listeners.click();
  assert.equal(elements.get('searchResults').children.length, 4);
  assert.equal(calls.length, 1, 'loaded results should not trigger another API request');

  await elements.get('searchNext').listeners.click();
  assert.equal(elements.get('searchResults').children.length, 2);
  assert.equal(calls.length, 1);

  await elements.get('searchNext').listeners.click();
  assert.equal(calls[1].pageToken, 'PAGE_TWO');
  assert.equal(elements.get('searchResults').children.length, 4);
  assert.equal(elements.get('searchPageLabel').textContent, '4페이지');
  assert.equal(vm.runInContext('probeCalls', context), 0, 'pagination must not open an embedded player');
  assert.equal(vm.runInContext("searchItems.some((item) => item.videoId === 'B0000000000')", context), true);
  assert.equal(savedSettings.has('music-together-blocked-search-videos'), false);

  elements.get('searchPrevious').listeners.click();
  assert.equal(elements.get('searchResults').children.length, 4);
  assert.equal(elements.get('searchPageLabel').textContent, '3페이지');

  viewport.innerWidth = 400;
  viewport.listeners.resize();
  assert.equal(elements.get('searchResults').children.length, 2);
  assert.equal(elements.get('searchPageLabel').textContent, '5페이지');
  viewport.innerHeight = 600;
  viewport.listeners.resize();
  assert.equal(elements.get('searchResults').children.length, 1, 'short mobile dialogs show one card without scrolling');
  viewport.innerHeight = 700;
  viewport.listeners.resize();
  assert.equal(elements.get('searchResults').children.length, 2);
  elements.get('searchDialog').listeners.keydown({ key: 'ArrowRight', target: elements.get('searchNext'), preventDefault() {} });
  assert.equal(elements.get('searchPageLabel').textContent, '6페이지');
  viewport.innerHeight = 430;
  viewport.listeners.resize();
  assert.equal(elements.get('searchResults').children.length, 1);

  elements.get('closeSearchButton').listeners.click();
  assert.equal(elements.get('searchDialog').open, false);
  elements.get('openSearchButton').listeners.click();
  elements.get('searchDialog').listeners.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(elements.get('searchDialog').open, false);

  context.rememberEmbedBlockedVideo('A0000000000');
  assert.equal(vm.runInContext("isBlockedSearchVideo('A0000000000')", context), true);
  assert.match(savedSettings.get('music-together-blocked-search-videos'), /A0000000000/);
  elements.get('openSearchButton').listeners.click();
  await elements.get('searchForm').listeners.submit({ preventDefault() {} });
  assert.equal(vm.runInContext("searchItems.some((item) => item.videoId === 'A0000000000')", context), false);

  viewport.innerWidth = 900;
  viewport.innerHeight = 700;
  viewport.listeners.resize();
  await elements.get('searchForm').listeners.submit({ preventDefault() {} });
  assert.equal(elements.get('searchResults').children.length, 4);
  assert.match(elements.get('searchStatus').textContent, /추가할 때 재생 가능 여부를 확인/);
});
