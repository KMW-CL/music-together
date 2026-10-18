import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

test('the next song uses the activated YouTube player while the tab is hidden', async () => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        listeners: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        setAttribute() {}, replaceChildren() {}, append() {}, before() {}, remove() {},
      });
    }
    return elements.get(id);
  };
  const players = [];
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
    window: { YT: { Player: FakePlayer }, addEventListener() {} },
    YT: { Player: FakePlayer, PlayerState: playerStates },
    localStorage: { getItem: (key) => savedSettings.get(key) ?? null, setItem: (key, value) => savedSettings.set(key, value) },
    location: { origin: 'http://localhost:3000', search: '' },
    URLSearchParams, URL, Date, Math, Number, String, Boolean, Set,
    setInterval() {}, clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(await readFile(new URL('./public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext("roomId = '1234abcd'", context);

  const room = (id, videoId, version) => ({
    id: '1234abcd', current: { id, videoId, title: id }, videoId,
    playlist: [{ id, videoId, title: id }], currentId: id, playbackEpoch: version,
    playing: true, position: 0, version, listeners: 1,
  });
  context.applyState(room('first', 'AAAAAAAAAAA', 1));
  assert.equal(players.length, 1);
  players[0].ready();
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
  elements.get('joinPlayButton').listeners.click();

  context.applyState(room('second', 'BBBBBBBBBBB', 2));
  assert.equal(players.length, 1);
  assert.equal(players[0].destroyed, false);
  assert.equal(players[0].loads.length, 1);
  assert.equal(players[0].loads[0].videoId, 'BBBBBBBBBBB');

  context.applyState(room('second', 'BBBBBBBBBBB', 3));
  assert.equal(players[0].loads.length, 2, 'replaying the same video must restart it');
  assert.ok(players[0].loads[1].startSeconds < 0.1, 'replay should restart near the beginning');
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
    localStorage: { getItem: () => null },
    location: { origin: 'http://localhost:3000', search: '' },
    DOMParser: class { parseFromString(value) { return { body: { textContent: value } }; } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return { ok: true, json: async () => body.pageToken
        ? { items: items(25, 'B'), nextPageToken: null }
        : { items: items(10, 'A'), nextPageToken: 'PAGE_TWO' } };
    },
    URLSearchParams, URL, Date, Math, Number, String, Boolean, Set,
    setInterval() {}, clearTimeout() {}, setTimeout() {},
  });
  vm.runInContext(await readFile(new URL('./public/app.js', import.meta.url), 'utf8'), context);
  vm.runInContext("roomId = '1234abcd'; precheckEnabled = true", context);
  elements.get('openSearchButton').listeners.click();
  assert.equal(elements.get('searchDialog').open, true);
  assert.equal(elements.get('searchQuery').focused, true);
  elements.get('searchQuery').value = 'jazz piano';
  await elements.get('searchForm').listeners.submit({ preventDefault() {} });
  assert.equal(elements.get('searchResults').children.length, 4);
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
});
