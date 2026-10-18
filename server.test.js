import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppServer } from './server.js';

const server = createAppServer({ youtubeApiKey: '' });
let base;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
}

test('room creation, shared controls, and late join state', async () => {
  const created = await request('/api/rooms', { method: 'POST' });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.match(id, /^[a-f0-9]{8}$/);
  assert.match(created.body.hostToken, /^[a-f0-9]{64}$/);
  assert.equal(created.body.videoId, null);

  const control = (body) => request(`/api/rooms/${id}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const invalid = await control({ type: 'load', videoId: 'bad' });
  assert.equal(invalid.status, 400);

  const loaded = await control({ type: 'load', videoId: 'dQw4w9WgXcQ' });
  assert.equal(loaded.body.playing, true, '첫 곡을 추가하면 방이 바로 재생 상태가 된다');
  assert.equal(loaded.body.videoId, 'dQw4w9WgXcQ');
  const playing = await control({ type: 'play', position: 42 });
  assert.equal(playing.body.playing, true);

  const joined = await request(`/api/rooms/${id}`);
  assert.equal('hostToken' in joined.body, false);
  assert.equal(joined.body.videoId, 'dQw4w9WgXcQ');
  assert.equal(joined.body.playing, true);
  assert.ok(joined.body.position >= 42);

  const paused = await control({ type: 'pause', position: 45 });
  assert.equal(paused.body.playing, false);
  assert.equal(paused.body.position, 45);
  const stillPaused = await request(`/api/rooms/${id}`);
  assert.equal(stillPaused.body.position, 45);

  await control({ type: 'add', videoId: 'ABCDEFGHIJK' });
  await control({ type: 'play', position: 45 });
  const advanced = await control({ type: 'next' });
  assert.equal(advanced.body.current.videoId, 'ABCDEFGHIJK');
  assert.equal(advanced.body.playlist.length, 2);
  const finished = await control({ type: 'next' });
  assert.equal(finished.body.current.videoId, 'dQw4w9WgXcQ');
  assert.deepEqual(finished.body.playlist.map((track) => track.videoId), ['dQw4w9WgXcQ', 'ABCDEFGHIJK']);
});

test('serves the application', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /music together/);
});

test('live stream reports connected listeners and removes them on disconnect', async () => {
  const created = await request('/api/rooms', { method: 'POST' });
  const id = created.body.id;
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/rooms/${id}/events`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  const firstEvent = await stream.body.getReader().read();
  assert.match(new TextDecoder().decode(firstEvent.value), /"listeners":1/);
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const room = await request(`/api/rooms/${id}`);
  assert.equal(room.body.listeners, 0);
});

test('the host can restrict shared playlist controls while playback stays synchronized', async () => {
  const created = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (body, token = null) => request(`/api/rooms/${created.id}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Room-Host-Token': token } : {}) },
    body: JSON.stringify(body),
  });
  let result = await control({ type: 'add', videoId: 'AAAAAAAAAAA', title: '첫 곡' });
  assert.equal(result.status, 200, 'everyone can edit a new room by default');
  const trackId = result.body.currentId;
  assert.equal((await control({ type: 'access', hostOnly: true })).status, 403);
  assert.equal((await control({ type: 'access', hostOnly: true }, '0'.repeat(64))).status, 403);
  result = await control({ type: 'access', hostOnly: true }, created.hostToken);
  assert.equal(result.body.hostOnly, true);
  assert.equal('hostToken' in result.body, false);
  assert.equal((await request(`/api/rooms/${created.id}/host`, {
    headers: { 'X-Room-Host-Token': created.hostToken },
  })).body.isHost, true);
  assert.equal((await request(`/api/rooms/${created.id}/host`)).body.isHost, false);

  const restricted = [
    { type: 'add', videoId: 'BBBBBBBBBBB' },
    { type: 'select', trackId },
    { type: 'move', trackId, targetIndex: 0 },
    { type: 'remove', trackId },
    { type: 'repeat', enabled: false },
    { type: 'repeat-one', enabled: true },
    { type: 'shuffle', enabled: true },
    { type: 'metadata', trackId, title: '바꾼 제목' },
  ];
  for (const body of restricted) assert.equal((await control(body)).status, 403, body.type);
  assert.equal((await control({ type: 'play', position: 0 })).status, 200);
  assert.equal((await control({ type: 'next' })).status, 200);
  assert.equal((await control({ type: 'add', videoId: 'BBBBBBBBBBB' }, created.hostToken)).status, 200);
  assert.equal((await control({ type: 'access', hostOnly: false }, created.hostToken)).body.hostOnly, false);
  assert.equal((await control({ type: 'add', videoId: 'CCCCCCCCCCC' })).status, 200);
});

test('a legacy room can claim a host and keeps the role after restart', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-together-host-test-'));
  const storagePath = path.join(directory, 'rooms.json');
  const id = '1234abcd';
  await writeFile(storagePath, JSON.stringify([{ id, playlist: [], currentId: null, position: 0, version: 0 }]));
  let localServer = createAppServer({ storagePath, youtubeApiKey: '' });
  const listen = async () => {
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${localServer.address().port}`;
  };
  let origin = await listen();
  try {
    let response = await fetch(`${origin}/api/rooms/${id}`);
    assert.equal((await response.json()).hostClaimable, true);
    response = await fetch(`${origin}/api/rooms/${id}/claim-host`, { method: 'POST' });
    const claimed = await response.json();
    assert.equal(response.status, 200);
    assert.match(claimed.hostToken, /^[a-f0-9]{64}$/);
    assert.equal(claimed.hostClaimable, false);
    assert.equal((await fetch(`${origin}/api/rooms/${id}/claim-host`, { method: 'POST' })).status, 409);
    await new Promise((resolve) => localServer.close(resolve));
    localServer = createAppServer({ storagePath, youtubeApiKey: '' });
    origin = await listen();
    response = await fetch(`${origin}/api/rooms/${id}/host`, {
      headers: { 'X-Room-Host-Token': claimed.hostToken },
    });
    assert.equal((await response.json()).isHost, true);
    response = await fetch(`${origin}/api/rooms/${id}`);
    assert.equal('hostToken' in await response.json(), false);
  } finally {
    if (localServer.listening) await new Promise((resolve) => localServer.close(resolve));
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    await rm(directory, { recursive: true, force: true });
  }
});

test('playlist order, selection, looping, and disk persistence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-together-test-'));
  const storagePath = path.join(directory, 'rooms.json');
  let localServer = createAppServer({ storagePath, youtubeApiKey: '' });
  const listen = async () => {
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${localServer.address().port}`;
  };
  let origin = await listen();
  const call = async (url, body) => {
    const response = await fetch(`${origin}${url}`, body && {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await call('/api/rooms', {});
    const { id } = created.body;
    const control = (type, extra = {}) => call(`/api/rooms/${id}/control`, { type, ...extra });
    await control('add', { videoId: 'dQw4w9WgXcQ', title: '첫 곡' });
    await control('add', { videoId: 'n5Ps-iGFifk', title: '둘째 곡' });
    let result = await control('add', { videoId: 'bGyOYEZMRsc', title: '셋째 곡' });
    assert.deepEqual(result.body.playlist.map((item) => item.title), ['첫 곡', '둘째 곡', '셋째 곡']);
    const thirdId = result.body.playlist[2].id;
    result = await control('move', { trackId: thirdId, direction: -1 });
    assert.deepEqual(result.body.playlist.map((item) => item.title), ['첫 곡', '셋째 곡', '둘째 곡']);
    result = await control('remove', { trackId: result.body.playlist[2].id });
    assert.equal(result.body.playlist.length, 2);

    const staleAdvance = await control('next', { trackId: 'already-moved' });
    assert.equal(staleAdvance.body.current.title, '첫 곡');
    assert.equal(staleAdvance.body.playlist.length, 2);

    result = await control('next');
    assert.equal(result.body.current.title, '셋째 곡');
    await control('play', { position: 4 });
    result = await control('next');
    assert.equal(result.body.current.title, '첫 곡');
    result = await control('select', { trackId: thirdId });
    assert.equal(result.body.current.title, '셋째 곡');
    assert.equal(result.body.playing, true);
    await control('add', { videoId: 'dQw4w9WgXcQ', title: '다음 곡' });
    await control('repeat', { enabled: false });
    await control('shuffle', { enabled: true });

    await new Promise((resolve) => localServer.close(resolve));
    localServer = createAppServer({ storagePath, youtubeApiKey: '' });
    origin = await listen();
    result = await call(`/api/rooms/${id}`);
    assert.equal(result.body.current.title, '셋째 곡');
    assert.deepEqual(result.body.playlist.map((item) => item.title), ['첫 곡', '셋째 곡', '다음 곡']);
    assert.equal(result.body.playing, true, '서버를 다시 켜도 저장된 방은 재생을 재개한다');
    assert.equal(result.body.repeat, false);
    assert.equal(result.body.shuffle, true);
    const afterRestart = new Set();
    afterRestart.add((await control('next')).body.current.title);
    afterRestart.add((await control('next')).body.current.title);
    assert.deepEqual(afterRestart, new Set(['첫 곡', '다음 곡']));
    assert.equal((await control('next')).body.playing, false);
    await new Promise((resolve) => localServer.close(resolve));
    localServer = createAppServer({ storagePath, youtubeApiKey: '' });
    origin = await listen();
    assert.equal((await call(`/api/rooms/${id}`)).body.playing, false, '반복을 끄고 목록이 끝난 방은 다시 켜지지 않는다');
  } finally {
    if (localServer.listening) await new Promise((resolve) => localServer.close(resolve));
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.ok(path.basename(directory).startsWith('music-together-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('repeat and shuffle can be selected independently for the shared room', async () => {
  const room = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (type, extra = {}) => request(`/api/rooms/${room.id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }),
  });
  assert.equal(room.repeat, true);
  assert.equal(room.shuffle, false);
  assert.equal((await control('repeat', { enabled: 'yes' })).status, 400);
  let result = await control('add', { videoId: 'AAAAAAAAAAA', title: '첫 곡' });
  const firstId = result.body.currentId;
  await control('add', { videoId: 'BBBBBBBBBBB', title: '둘째 곡' });
  await control('add', { videoId: 'CCCCCCCCCCC', title: '셋째 곡' });
  await control('play', { position: 0 });
  result = await control('repeat', { enabled: false });
  assert.equal(result.body.repeat, false);
  assert.equal(result.body.playing, true);
  assert.equal((await control('next')).body.current.title, '둘째 곡');
  assert.equal((await control('next')).body.current.title, '셋째 곡');
  result = await control('next');
  assert.equal(result.body.current.title, '셋째 곡');
  assert.equal(result.body.playing, false);
  assert.equal(result.body.position, 0);

  await control('select', { trackId: firstId });
  result = await control('shuffle', { enabled: true });
  assert.equal(result.body.shuffle, true);
  const seen = new Set([result.body.currentId]);
  for (let index = 0; index < 2; index += 1) {
    result = await control('next');
    assert.equal(seen.has(result.body.currentId), false);
    seen.add(result.body.currentId);
  }
  assert.equal(seen.size, 3);
  const lastId = result.body.currentId;
  result = await control('next');
  assert.equal(result.body.currentId, lastId);
  assert.equal(result.body.playing, false);

  await control('repeat', { enabled: true });
  result = await control('next');
  assert.notEqual(result.body.currentId, lastId, 'a new shuffle cycle should not immediately repeat the same song');
  const stale = await control('next', { trackId: result.body.currentId, playbackEpoch: result.body.playbackEpoch - 1 });
  assert.equal(stale.body.currentId, result.body.currentId);
  assert.equal(stale.body.playbackEpoch, result.body.playbackEpoch);
  result = await control('shuffle', { enabled: false });
  assert.equal(result.body.shuffle, false);
  assert.equal((await request(`/api/rooms/${room.id}`)).body.repeat, true);

  result = await control('repeat-one', { enabled: true });
  assert.equal(result.body.repeat, false);
  assert.equal(result.body.repeatOne, true);
  await control('play', { position: 12 });
  const beforeRepeat = (await request(`/api/rooms/${room.id}`)).body;
  result = await control('next', {
    trackId: beforeRepeat.currentId,
    playbackEpoch: beforeRepeat.playbackEpoch,
    fromEnd: true,
  });
  assert.equal(result.body.currentId, beforeRepeat.currentId);
  assert.equal(result.body.playing, true);
  assert.equal(result.body.position, 0);
  assert.equal(result.body.playbackEpoch, beforeRepeat.playbackEpoch + 1);
  result = await control('next', { playbackEpoch: result.body.playbackEpoch });
  assert.notEqual(result.body.currentId, beforeRepeat.currentId, 'manual next should leave one-song repeat');
  result = await control('repeat-one', { enabled: false });
  assert.equal(result.body.repeat, false);
  assert.equal(result.body.repeatOne, false);
  result = await control('repeat', { enabled: true });
  assert.equal(result.body.repeat, true);
  assert.equal(result.body.repeatOne, false);
  result = await control('shuffle', { enabled: true });
  assert.equal(result.body.repeat, true);
  assert.equal(result.body.shuffle, true, '전체 반복과 랜덤 재생은 함께 사용할 수 있어야 한다');
  result = await control('repeat-one', { enabled: true });
  assert.equal(result.body.repeatOne, true);
  assert.equal(result.body.shuffle, false, '한 곡 반복을 켜면 랜덤 재생이 꺼져야 한다');
  result = await control('shuffle', { enabled: true });
  assert.equal(result.body.shuffle, true);
  assert.equal(result.body.repeatOne, false, '랜덤 재생을 켜면 한 곡 반복이 꺼져야 한다');
});

test('saved rooms do not restore one-song repeat and shuffle together', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-together-test-'));
  const storagePath = path.join(directory, 'rooms.json');
  await writeFile(storagePath, JSON.stringify([{
    id: '1234abcd', playlist: [], currentId: null, repeat: false,
    repeatOne: true, shuffle: true, shuffleRemaining: [], position: 0, version: 1,
  }]));
  const restoredServer = createAppServer({ storagePath, youtubeApiKey: '' });
  try {
    await new Promise((resolve) => restoredServer.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${restoredServer.address().port}/api/rooms/1234abcd`);
    const room = await response.json();
    assert.equal(room.repeatOne, true);
    assert.equal(room.shuffle, false);
  } finally {
    if (restoredServer.listening) await new Promise((resolve) => restoredServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('playlist advances in order and loops without adding duplicate rows', async () => {
  const room = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (type, extra = {}) => request(`/api/rooms/${room.id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }),
  });
  await control('add', { videoId: 'AAAAAAAAAAA', title: '첫 곡' });
  await control('add', { videoId: 'BBBBBBBBBBB', title: '둘째 곡' });
  await control('add', { videoId: 'CCCCCCCCCCC', title: '셋째 곡' });
  await control('play', { position: 0 });
  const initial = (await request(`/api/rooms/${room.id}`)).body;
  assert.equal((await control('next')).body.current.title, '둘째 곡');
  assert.equal((await control('next')).body.current.title, '셋째 곡');

  let result = await control('next');
  assert.equal(result.body.current.title, '첫 곡');
  assert.equal(result.body.playing, true);
  assert.equal(result.body.current.id, initial.current.id);
  assert.ok(result.body.playbackEpoch > initial.playbackEpoch);
  assert.deepEqual(result.body.playlist.map((track) => track.title), ['첫 곡', '둘째 곡', '셋째 곡']);

  await control('pause', { position: 0 });
  result = await control('next');
  assert.equal(result.body.current.title, '둘째 곡');
  assert.equal(result.body.playing, false);
  await control('add', { videoId: 'DDDDDDDDDDD', title: '새 곡' });
  assert.equal((await control('next')).body.current.title, '셋째 곡');
  result = await control('next');
  assert.equal(result.body.current.title, '새 곡');
  result = await control('next');
  assert.equal(result.body.current.title, '첫 곡');
  assert.equal(result.body.playlist.length, 4);
});

test('editing the shared playlist keeps the current position and selects the next remaining song', async () => {
  const room = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (type, extra = {}) => request(`/api/rooms/${room.id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }),
  });
  let result = await control('add', { videoId: 'AAAAAAAAAAA', title: '첫 곡' });
  const firstId = result.body.currentId;
  await control('add', { videoId: 'BBBBBBBBBBB', title: '둘째 곡' });
  await control('add', { videoId: 'CCCCCCCCCCC', title: '셋째 곡' });
  await control('play', { position: 20 });
  result = await control('move', { trackId: firstId, direction: 1 });
  assert.deepEqual(result.body.playlist.map((track) => track.title), ['둘째 곡', '첫 곡', '셋째 곡']);
  assert.equal(result.body.currentId, firstId);
  assert.ok(result.body.position >= 20);

  result = await control('remove', { trackId: firstId });
  assert.equal(result.body.current.title, '셋째 곡');
  assert.equal(result.body.playing, true);
  assert.equal(result.body.position, 0);
  const secondId = result.body.playlist[0].id;
  result = await control('select', { trackId: secondId });
  assert.equal(result.body.current.title, '둘째 곡');
  assert.equal(result.body.position, 0);
  result = await control('remove', { trackId: secondId });
  assert.equal(result.body.current.title, '셋째 곡');
  result = await control('remove', { trackId: result.body.currentId });
  assert.equal(result.body.current, null);
  assert.equal(result.body.playing, false);
  assert.equal(result.body.playlist.length, 0);
});

test('moving a track directly to another position preserves the current playback', async () => {
  const room = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (type, extra = {}) => request(`/api/rooms/${room.id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }),
  });
  await control('add', { videoId: 'AAAAAAAAAAA', title: '첫 곡' });
  await control('add', { videoId: 'BBBBBBBBBBB', title: '둘째 곡' });
  let result = await control('add', { videoId: 'CCCCCCCCCCC', title: '셋째 곡' });
  const thirdId = result.body.playlist[2].id;
  const firstId = result.body.currentId;
  await control('play', { position: 25 });
  result = await control('move', { trackId: thirdId, targetIndex: 0 });
  assert.deepEqual(result.body.playlist.map((track) => track.title), ['셋째 곡', '첫 곡', '둘째 곡']);
  assert.equal(result.body.currentId, firstId);
  assert.equal(result.body.playing, true);
  assert.ok(result.body.position >= 25);
  const epoch = result.body.playbackEpoch;
  result = await control('move', { trackId: thirdId, targetIndex: 2 });
  assert.deepEqual(result.body.playlist.map((track) => track.title), ['첫 곡', '둘째 곡', '셋째 곡']);
  assert.equal(result.body.playbackEpoch, epoch);
  const invalid = await control('move', { trackId: thirdId, targetIndex: 3 });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await request(`/api/rooms/${room.id}`)).body.playlist.map((track) => track.title), ['첫 곡', '둘째 곡', '셋째 곡']);
});

test('a one-song playlist restarts the same track on next', async () => {
  const room = (await request('/api/rooms', { method: 'POST' })).body;
  const control = (type, extra = {}) => request(`/api/rooms/${room.id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, ...extra }),
  });
  const added = (await control('add', { videoId: 'AAAAAAAAAAA', title: '한 곡' })).body;
  await control('play', { position: 35 });
  const next = (await control('next')).body;
  assert.equal(next.currentId, added.currentId);
  assert.equal(next.playlist.length, 1);
  assert.equal(next.position, 0);
  assert.equal(next.playing, true);
  assert.ok(next.playbackEpoch > added.playbackEpoch);
});

test('legacy rooms migrate current, queue, and history into one playlist', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-together-test-'));
  const storagePath = path.join(directory, 'rooms.json');
  const history = [
    { id: 'newest-track', videoId: 'BBBBBBBBBBB', title: '둘째 곡', titleSource: 'manual' },
    { id: 'oldest-track', videoId: 'AAAAAAAAAAA', title: '첫 곡', titleSource: 'manual' },
  ];
  await writeFile(storagePath, JSON.stringify([
    { id: '1234abcd', current: null, queue: [], history, playing: false, position: 0, version: 1 },
    {
      id: '5678abcd',
      current: { id: 'replay-copy', videoId: 'BBBBBBBBBBB', title: '둘째 곡', replayOf: 'newest-track' },
      queue: [{ id: 'queued-track', videoId: 'CCCCCCCCCCC', title: '다음 곡' }],
      history, playing: true, position: 42, version: 2,
    },
  ]));
  const restoredServer = createAppServer({ storagePath, youtubeApiKey: '' });
  try {
    await new Promise((resolve) => restoredServer.listen(0, '127.0.0.1', resolve));
    const response = await fetch(`http://127.0.0.1:${restoredServer.address().port}/api/rooms/1234abcd`);
    const room = await response.json();
    assert.equal(room.current.title, '첫 곡');
    assert.equal(room.currentId, 'oldest-track');
    assert.deepEqual(room.playlist.map((track) => track.title), ['첫 곡', '둘째 곡']);
    assert.equal(room.playing, true);
    const replayResponse = await fetch(`http://127.0.0.1:${restoredServer.address().port}/api/rooms/5678abcd`);
    const replayRoom = await replayResponse.json();
    assert.deepEqual(replayRoom.playlist.map((track) => track.title), ['첫 곡', '둘째 곡', '다음 곡']);
    assert.equal(replayRoom.currentId, 'newest-track');
    assert.equal(replayRoom.playing, true);
  } finally {
    if (restoredServer.listening) await new Promise((resolve) => restoredServer.close(resolve));
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.ok(path.basename(directory).startsWith('music-together-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('configured YouTube precheck rejects blocked videos and adds an allowed title', async () => {
  const inspected = [];
  const checkedServer = createAppServer({
    youtubeApiKey: 'test-key',
    fetchVideo: async (url, options) => {
      const request = new URL(url);
      assert.equal(request.hostname, 'www.googleapis.com');
      assert.equal(request.searchParams.has('key'), false);
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      const id = request.searchParams.get('id');
      inspected.push(id);
      if (id === 'ABCDEFGHIJK') return { ok: false, status: 403 };
      const items = id === 'n5Ps-iGFifk' ? [] : [{
        id,
        snippet: { title: 'API에서 확인한 제목' },
        status: { embeddable: id !== 'bGyOYEZMRsc', privacyStatus: 'public', uploadStatus: 'processed' },
        contentDetails: { duration: 'PT3M33S', contentRating: {} },
      }];
      return { ok: true, json: async () => ({ items }) };
    },
  });
  await new Promise((resolve) => checkedServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${checkedServer.address().port}`;
  const call = async (url, body) => {
    const response = await fetch(`${origin}${url}`, body && {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.deepEqual((await call('/api/config')).body, { precheckEnabled: true });
    const created = await call('/api/rooms', {});
    const { id } = created.body;
    const add = (videoId) => call(`/api/rooms/${id}/control`, { type: 'add', videoId });
    const blocked = await add('bGyOYEZMRsc');
    assert.equal(blocked.status, 422);
    assert.match(blocked.body.error, /외부 사이트 재생/);
    const missing = await add('n5Ps-iGFifk');
    assert.equal(missing.status, 422);
    const unavailable = await add('ABCDEFGHIJK');
    assert.equal(unavailable.status, 503);
    assert.equal((await call(`/api/rooms/${id}`)).body.current, null);
    const allowed = await add('dQw4w9WgXcQ');
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.current.title, 'API에서 확인한 제목');
    assert.equal(allowed.body.current.titleSource, 'auto');
    assert.equal(allowed.body.current.durationSeconds, 213);
    assert.deepEqual(inspected, ['bGyOYEZMRsc', 'n5Ps-iGFifk', 'ABCDEFGHIJK', 'dQw4w9WgXcQ']);
    assert.equal(JSON.stringify(allowed.body).includes('test-key'), false);
  } finally {
    await new Promise((resolve) => checkedServer.close(resolve));
  }
});

test('a room advances through known durations without a connected player', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'music-together-test-'));
  const storagePath = path.join(directory, 'rooms.json');
  const playlist = [
    { id: 'first', videoId: 'AAAAAAAAAAA', title: '첫 곡', durationSeconds: 10 },
    { id: 'second', videoId: 'BBBBBBBBBBB', title: '두 번째 곡', durationSeconds: 20 },
  ];
  await writeFile(storagePath, JSON.stringify([
    { id: '1234abcd', playlist, currentId: 'first', playing: true, continuousPlayback: true,
      repeat: true, position: 0, updatedAt: Date.now() - 25_000, version: 1 },
    { id: '5678abcd', playlist, currentId: 'first', playing: true, continuousPlayback: true,
      repeat: false, position: 0, updatedAt: Date.now() - 35_000, version: 1 },
  ]));
  const localServer = createAppServer({ storagePath, youtubeApiKey: '' });
  try {
    await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    await localServer.advanceRooms();
    const origin = `http://127.0.0.1:${localServer.address().port}`;
    const midway = await (await fetch(`${origin}/api/rooms/1234abcd`)).json();
    assert.equal(midway.currentId, 'second');
    assert.ok(midway.position >= 14 && midway.position < 17);
    assert.equal(midway.playing, true);
    const ended = await (await fetch(`${origin}/api/rooms/5678abcd`)).json();
    assert.equal(ended.playing, false);
    assert.equal(ended.position, 0);
    assert.equal(ended.playbackEpoch, 2);
  } finally {
    if (localServer.listening) await new Promise((resolve) => localServer.close(resolve));
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.ok(path.basename(directory).startsWith('music-together-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('a player can report duration so the server advances a room without an API key', async () => {
  const created = await request('/api/rooms', { method: 'POST' });
  const id = created.body.id;
  const control = async (body) => request(`/api/rooms/${id}/control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const added = await control({ type: 'add', videoId: 'AAAAAAAAAAA' });
  const trackId = added.body.current.id;
  const reported = await control({ type: 'duration', trackId, durationSeconds: 10 });
  assert.equal(reported.body.current.durationSeconds, 10);
  await control({ type: 'seek', position: 11 });
  const advanced = await request(`/api/rooms/${id}`);
  assert.equal(advanced.body.playbackEpoch, added.body.playbackEpoch + 1);
  assert.equal(advanced.body.currentId, trackId);
  assert.ok(advanced.body.position >= 1 && advanced.body.position < 3);
});

test('any room member can search embeddable videos without exposing the API key', async () => {
  let searches = 0;
  let durationRequests = 0;
  const searchServer = createAppServer({
    youtubeApiKey: 'test-key',
    fetchVideo: async (url, options) => {
      const request = new URL(url);
      if (request.pathname === '/youtube/v3/videos') {
        assert.equal(request.searchParams.get('part'), 'contentDetails');
        assert.equal(request.searchParams.has('key'), false);
        assert.equal(options.headers['x-goog-api-key'], 'test-key');
        const ids = request.searchParams.get('id').split(',');
        durationRequests++;
        return { ok: true, json: async () => ({ items: ids.map((id, index) => ({
          id, contentDetails: { duration: index === 0 ? 'PT3M42S' : index === 1 ? 'PT1H2M3S' : 'PT0S' },
        })) }) };
      }
      assert.equal(request.pathname, '/youtube/v3/search');
      assert.equal(request.searchParams.get('q'), 'jazz piano');
      assert.equal(request.searchParams.get('type'), 'video');
      assert.equal(request.searchParams.get('videoCategoryId'), '10');
      assert.equal(request.searchParams.get('maxResults'), '25');
      assert.equal(request.searchParams.get('videoEmbeddable'), 'true');
      assert.equal(request.searchParams.get('videoSyndicated'), 'true');
      assert.equal(request.searchParams.has('key'), false);
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      searches++;
      if (request.searchParams.get('pageToken') === 'PAGE_TWO') {
        return { ok: true, json: async () => ({ items: [
          { id: { videoId: 'ZZZZZZZZZZZ' }, snippet: { title: 'Next song', channelTitle: 'Test channel' } },
        ] }) };
      }
      assert.equal(request.searchParams.has('pageToken'), false);
      return { ok: true, json: async () => ({
        nextPageToken: 'PAGE_TWO',
        items: [
          ...Array.from({ length: 10 }, (_, index) => ({
            id: { videoId: String(index).padStart(11, 'A') },
            snippet: { title: `Test song ${index}`, channelTitle: 'Test channel' },
          })),
          { id: { videoId: 'invalid' }, snippet: { title: 'Bad result' } },
        ],
      }) };
    },
  });
  await new Promise((resolve) => searchServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${searchServer.address().port}`;
  const post = async (url, body) => {
    const response = await fetch(`${origin}${url}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const room = (await post('/api/rooms', {})).body;
    const endpoint = `/api/rooms/${room.id}/search`;
    assert.equal((await post(endpoint, { query: 'a' })).status, 400);
    assert.equal((await post(endpoint, { query: 'jazz piano', pageToken: 2 })).status, 400);
    const result = await post(endpoint, { query: ' jazz   piano ' });
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 10);
    assert.equal(result.body.items[0].durationSeconds, 222);
    assert.equal(result.body.items[1].durationSeconds, 3_723);
    assert.equal('durationSeconds' in result.body.items[2], false);
    assert.equal(result.body.nextPageToken, 'PAGE_TWO');
    assert.equal(JSON.stringify(result.body).includes('test-key'), false);
    await post(endpoint, { query: 'jazz piano' });
    assert.equal(searches, 1);
    assert.equal(durationRequests, 1, 'cached search results should reuse duration metadata');
    const secondPage = await post(endpoint, { query: 'jazz piano', pageToken: 'PAGE_TWO' });
    assert.deepEqual(secondPage.body.items, [{ videoId: 'ZZZZZZZZZZZ', title: 'Next song', channel: 'Test channel', durationSeconds: 222 }]);
    assert.equal(secondPage.body.nextPageToken, null);
    await post(endpoint, { query: 'jazz piano', pageToken: 'PAGE_TWO' });
    assert.equal(searches, 2);
    assert.equal(durationRequests, 2);
  } finally {
    await new Promise((resolve) => searchServer.close(resolve));
  }
});

test('cached search results retry duration metadata after a temporary failure', async () => {
  let searches = 0;
  let durationRequests = 0;
  const searchServer = createAppServer({
    youtubeApiKey: 'test-key',
    fetchVideo: async (url) => {
      if (new URL(url).pathname === '/youtube/v3/search') {
        searches++;
        return { ok: true, json: async () => ({ items: [
          { id: { videoId: 'AAAAAAAAAAA' }, snippet: { title: 'Song', channelTitle: 'Artist' } },
        ] }) };
      }
      durationRequests++;
      if (durationRequests === 1) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ items: [
        { id: 'AAAAAAAAAAA', contentDetails: { duration: 'PT4M5S' } },
      ] }) };
    },
  });
  await new Promise((resolve) => searchServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${searchServer.address().port}`;
  try {
    const room = await fetch(`${origin}/api/rooms`, { method: 'POST' }).then((response) => response.json());
    const search = async () => fetch(`${origin}/api/rooms/${room.id}/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'artist song' }),
    }).then((response) => response.json());
    const first = await search();
    assert.equal(first.durationUnavailable, true);
    assert.equal('durationSeconds' in first.items[0], false);
    const second = await search();
    assert.equal(second.durationUnavailable, false);
    assert.equal(second.items[0].durationSeconds, 245);
    assert.equal(searches, 1);
    assert.equal(durationRequests, 2);
  } finally {
    await new Promise((resolve) => searchServer.close(resolve));
  }
});

test('music search puts an artist official MV ahead of unrelated coverage', async () => {
  const searchServer = createAppServer({
    youtubeApiKey: 'test-key',
    fetchVideo: async () => ({ ok: true, json: async () => ({ items: [
      { id: { videoId: 'AAAAAAAAAAA' }, snippet: { title: 'RESCENE 레센느 LOVE ATTACK 현장 소식', channelTitle: '방송국' } },
      { id: { videoId: 'BBBBBBBBBBB' }, snippet: { title: '레센느 인터뷰와 티저', channelTitle: '방송국' } },
      { id: { videoId: 'CCCCCCCCCCC' }, snippet: { title: 'RESCENE (레센느) - LOVE ATTACK Official MV', channelTitle: 'RESCENE' } },
    ] }) }),
  });
  await new Promise((resolve) => searchServer.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${searchServer.address().port}`;
  try {
    const room = await fetch(`${origin}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((response) => response.json());
    const response = await fetch(`${origin}/api/rooms/${room.id}/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '레센느' }),
    });
    assert.equal(response.status, 200);
    const { items } = await response.json();
    assert.deepEqual(items.map((item) => item.videoId), ['CCCCCCCCCCC', 'AAAAAAAAAAA', 'BBBBBBBBBBB']);
  } finally {
    await new Promise((resolve) => searchServer.close(resolve));
  }
});
