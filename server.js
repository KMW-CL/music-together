import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(root, 'public');
const defaultStoragePath = path.join(root, 'data', 'rooms.json');
const localApiKeyPath = path.join(root, 'data', 'youtube-api-key.txt');
const MAX_BODY_BYTES = 8_192;
const MAX_PLAYLIST_LENGTH = 500;

class VideoCheckError extends Error {}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function currentPosition(room, now = Date.now()) {
  return Math.max(0, room.position + (room.playing ? (now - room.updatedAt) / 1_000 : 0));
}

function currentTrack(room) {
  return room.playlist.find((track) => track.id === room.currentId) || null;
}

function roomState(room) {
  const now = Date.now();
  const current = currentTrack(room);
  return {
    id: room.id,
    current,
    videoId: current?.videoId || null,
    playlist: room.playlist,
    currentId: room.currentId,
    playbackEpoch: room.playbackEpoch,
    playing: room.playing,
    repeat: room.repeat,
    repeatOne: room.repeatOne,
    shuffle: room.shuffle,
    hostOnly: room.hostOnly,
    hostClaimable: !room.hostTokenHash,
    position: currentPosition(room, now),
    serverTime: now,
    version: room.version,
    listeners: room.clients.size,
  };
}

function broadcast(room) {
  const payload = `data: ${JSON.stringify(roomState(room))}\n\n`;
  for (const client of room.clients) client.write(payload);
}

function validateTitle(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.trim().length > 120) throw new Error('곡 이름은 120자 이하로 입력해 주세요.');
  return value.trim();
}

function newTrack(videoId, title = '') {
  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('올바른 유튜브 링크를 입력해 주세요.');
  const trimmed = validateTitle(title);
  return {
    id: randomBytes(6).toString('hex'),
    videoId,
    title: trimmed || `유튜브 영상 · ${videoId}`,
    titleSource: trimmed ? 'manual' : 'fallback',
    addedAt: new Date().toISOString(),
  };
}

async function inspectYouTubeVideo(videoId, apiKey, fetchVideo) {
  if (!apiKey) return { configured: false };
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,status,contentDetails');
  url.searchParams.set('id', videoId);
  url.searchParams.set('fields', 'items(id,snippet(title),status(embeddable,privacyStatus,uploadStatus),contentDetails(duration,contentRating(ytRating)))');
  let response;
  try {
    response = await fetchVideo(url, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new VideoCheckError('YouTube 사전 검사에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    throw new VideoCheckError(response.status === 403
      ? 'YouTube API 키, API 사용 설정 또는 할당량을 확인해 주세요.'
      : 'YouTube 사전 검사를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new VideoCheckError('YouTube 사전 검사 결과를 읽지 못했어요.'); }
  if (!Array.isArray(data.items)) throw new VideoCheckError('YouTube 사전 검사 결과가 올바르지 않아요.');
  const video = data.items?.find((item) => item.id === videoId);
  const restriction = videoPlaybackRestriction(video);
  if (restriction?.unknown) throw new VideoCheckError(restriction.reason);
  if (restriction) return { configured: true, allowed: false, reason: restriction.reason };
  return { configured: true, allowed: true, title: video.snippet?.title?.trim().slice(0, 120) || '', durationSeconds: durationSeconds(video.contentDetails?.duration) };
}

function videoPlaybackRestriction(video) {
  if (!video) return { reason: '영상을 찾을 수 없거나 비공개 상태예요.' };
  if (video.status?.privacyStatus === 'private') return { reason: '비공개 영상은 방에서 재생할 수 없어요.' };
  if (video.status?.embeddable === false) return { reason: '이 영상은 외부 사이트 재생이 허용되지 않아요.' };
  if (video.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') {
    return { reason: '연령 제한 영상은 방 안에서 재생할 수 없어요.' };
  }
  if (video.status?.uploadStatus && video.status.uploadStatus !== 'processed') {
    return { reason: '아직 재생할 수 있는 상태의 영상이 아니에요.' };
  }
  if (video.status?.embeddable !== true) return { reason: '영상의 삽입 재생 가능 여부를 확인하지 못했어요.', unknown: true };
  return null;
}

function durationSeconds(value) {
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const seconds = Number(match[1] || 0) * 86_400 + Number(match[2] || 0) * 3_600
    + Number(match[3] || 0) * 60 + Number(match[4] || 0);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

async function searchPlayableVideos(items, apiKey, fetchVideo) {
  if (!items.length) return [];
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'status,contentDetails');
  url.searchParams.set('id', [...new Set(items.map((item) => item.videoId))].join(','));
  url.searchParams.set('fields', 'items(id,status(embeddable,privacyStatus,uploadStatus),contentDetails(duration,contentRating(ytRating)))');
  let response;
  try {
    response = await fetchVideo(url, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new VideoCheckError('검색 결과의 재생 가능 여부를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) throw new VideoCheckError('검색 결과의 재생 가능 여부를 확인하지 못했어요. API 키나 할당량을 확인해 주세요.');
  let data;
  try { data = await response.json(); }
  catch { throw new VideoCheckError('검색 결과의 재생 가능 여부를 읽지 못했어요.'); }
  if (!Array.isArray(data.items)) throw new VideoCheckError('검색 결과의 재생 가능 여부가 올바르지 않아요.');
  const videos = new Map(data.items.filter((video) => typeof video.id === 'string').map((video) => [video.id, video]));
  return items.filter((item) => !videoPlaybackRestriction(videos.get(item.videoId))).map((item) => {
    const seconds = durationSeconds(videos.get(item.videoId).contentDetails?.duration);
    return seconds === null ? item : { ...item, durationSeconds: seconds };
  });
}

async function searchYouTubeVideos(query, pageToken, apiKey, fetchVideo) {
  if (!apiKey) throw new VideoCheckError('YouTube 검색을 사용하려면 로컬 API 키를 설정해 주세요.');
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('videoSyndicated', 'true');
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('safeSearch', 'moderate');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  url.searchParams.set('fields', 'nextPageToken,items(id(videoId),snippet(title,channelTitle))');
  let response;
  try {
    response = await fetchVideo(url, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new VideoCheckError('YouTube 검색에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    throw new VideoCheckError(response.status === 403
      ? 'YouTube 검색 한도 또는 API 키 설정을 확인해 주세요.'
      : 'YouTube 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new VideoCheckError('YouTube 검색 결과를 읽지 못했어요.'); }
  if (!Array.isArray(data.items)) throw new VideoCheckError('YouTube 검색 결과가 올바르지 않아요.');
  const candidates = data.items.filter((item) => /^[A-Za-z0-9_-]{11}$/.test(item.id?.videoId || ''))
    .map((item) => ({
      videoId: item.id.videoId,
      title: String(item.snippet?.title || `유튜브 영상 · ${item.id.videoId}`).slice(0, 120),
      channel: String(item.snippet?.channelTitle || '').slice(0, 100),
    }))
    .map((item, index) => ({ item, index, score: musicResultScore(item, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ item }) => item);
  const items = await searchPlayableVideos(candidates, apiKey, fetchVideo);
  return { items, nextPageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null };
}

function musicResultScore(item, query) {
  const title = item.title.toLocaleLowerCase();
  const channel = item.channel.toLocaleLowerCase();
  const terms = query.toLocaleLowerCase().split(/\s+/).filter((term) => term.length >= 2);
  let score = 0;
  if (terms.some((term) => channel.includes(term))) score += 5;
  if (/\b(?:official\s*(?:music\s*)?(?:video|mv)|music\s*video|mv)\b|공식\s*(?:뮤직비디오|영상)/i.test(title)) score += 6;
  if (/\b(?:official\s*audio|lyric(?:s)?\s*video|audio)\b|가사\s*영상/i.test(title)) score += 3;
  if (/\s-\s*topic$/i.test(channel)) score += 5;
  if (/\b(?:reaction|review|interview|teaser|behind|fancam|shorts?)\b|리액션|리뷰|인터뷰|티저|비하인드|직캠|쇼츠|예고|뉴스|논란/i.test(title)) score -= 8;
  return score;
}

function newRoom(rooms) {
  let id;
  do { id = randomBytes(4).toString('hex'); } while (rooms.has(id));
  const room = {
    id, playlist: [], currentId: null, playbackEpoch: 0,
    playing: false, repeat: true, repeatOne: false, shuffle: false, shuffleRemaining: [],
    hostOnly: false, hostTokenHash: null,
    position: 0, updatedAt: Date.now(), version: 0,
    clients: new Set(),
  };
  rooms.set(id, room);
  return room;
}

function saveRecord(room) {
  return {
    id: room.id, playlist: room.playlist, currentId: room.currentId,
    playbackEpoch: room.playbackEpoch, playing: room.playing, continuousPlayback: true,
    repeat: room.repeat, repeatOne: room.repeatOne,
    shuffle: room.shuffle, shuffleRemaining: room.shuffleRemaining,
    hostOnly: room.hostOnly, hostTokenHash: room.hostTokenHash,
    position: currentPosition(room), updatedAt: Date.now(), version: room.version,
  };
}

function migrateLegacyRoom(record) {
  const playlist = (Array.isArray(record.history) ? [...record.history].reverse() : [])
    .map(({ playedAt, replayOf, ...track }) => track);
  const current = record.current;
  let currentId = null;
  if (current?.replayOf) {
    currentId = playlist.find((track) => track.id === current.replayOf)?.id || null;
  }
  if (current && !currentId) {
    const { replayOf, playedAt, ...track } = current;
    playlist.push(track);
    currentId = current.id;
  }
  const queue = Array.isArray(record.queue) ? record.queue : [];
  if (currentId && current?.replayOf && queue.length) {
    const index = playlist.findIndex((track) => track.id === currentId);
    playlist.splice(index + 1, 0, ...queue);
  } else {
    playlist.push(...queue);
  }
  return { playlist, currentId: currentId || playlist[0]?.id || null };
}

function shuffledTrackIds(room, includeCurrent = false) {
  const ids = room.playlist.map((track) => track.id)
    .filter((id) => includeCurrent || id !== room.currentId);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[other]] = [ids[other], ids[index]];
  }
  if (includeCurrent && ids.length > 1 && ids.at(-1) === room.currentId) {
    [ids[0], ids[ids.length - 1]] = [ids[ids.length - 1], ids[0]];
  }
  return ids;
}

function advanceTrack(room, fromEnd = false) {
  let nextId = null;
  if (fromEnd && room.repeatOne) {
    nextId = room.currentId;
  } else if (room.shuffle) {
    if (!room.shuffleRemaining.length && (room.repeat || room.repeatOne)) room.shuffleRemaining = shuffledTrackIds(room, true);
    nextId = room.shuffleRemaining.pop() || null;
  } else {
    const index = room.playlist.findIndex((track) => track.id === room.currentId);
    nextId = room.playlist[index + 1]?.id || ((room.repeat || room.repeatOne) ? room.playlist[0]?.id : null);
  }
  if (nextId) room.currentId = nextId;
  else room.playing = false;
  room.position = 0;
  room.playbackEpoch += 1;
}

function advanceDueTracks(room, now = Date.now()) {
  let changed = false;
  let elapsed = currentPosition(room, now);
  let transitions = 0;
  while (room.playing && transitions < 1_000) {
    const duration = currentTrack(room)?.durationSeconds;
    if (!Number.isFinite(duration) || duration <= 0 || elapsed < duration) break;
    elapsed -= duration;
    advanceTrack(room, true);
    room.version += 1;
    changed = true;
    transitions += 1;
  }
  if (changed) {
    room.position = room.playing && transitions < 1_000 ? elapsed : 0;
    room.updatedAt = now;
  }
  return changed;
}

function loadRooms(storagePath) {
  const rooms = new Map();
  if (!storagePath) return rooms;
  let records;
  try { records = JSON.parse(readFileSync(storagePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return rooms;
    throw new Error(`저장된 방 파일을 읽지 못했습니다: ${error.message}`);
  }
  if (!Array.isArray(records)) throw new Error('저장된 방 파일 형식이 올바르지 않습니다.');
  for (const record of records) {
    if (!/^[a-f0-9]{8}$/.test(record.id)) continue;
    const legacy = Array.isArray(record.playlist) ? null : migrateLegacyRoom(record);
    const playlist = legacy ? legacy.playlist : record.playlist;
    const room = {
      id: record.id,
      playlist,
      currentId: playlist.some((track) => track.id === record.currentId) ? record.currentId : legacy?.currentId || playlist[0]?.id || null,
      playbackEpoch: Number.isInteger(record.playbackEpoch) ? record.playbackEpoch : 0,
      playing: Boolean(playlist.length && (record.continuousPlayback !== true || record.playing !== false)),
      repeat: record.repeatOne === true ? false : record.repeat !== false,
      repeatOne: record.repeatOne === true,
      shuffle: record.shuffle === true && record.repeatOne !== true,
      shuffleRemaining: [],
      hostTokenHash: /^[a-f0-9]{64}$/.test(record.hostTokenHash || '') ? record.hostTokenHash : null,
      hostOnly: record.hostOnly === true && /^[a-f0-9]{64}$/.test(record.hostTokenHash || ''),
      position: Number.isFinite(record.position) ? record.position : 0,
      updatedAt: record.continuousPlayback === true && Number.isFinite(record.updatedAt)
        ? Math.min(record.updatedAt, Date.now()) : Date.now(),
      version: Number.isInteger(record.version) ? record.version : 0,
      clients: new Set(),
    };
    if (room.shuffle) {
      const valid = new Set(playlist.map((track) => track.id));
      room.shuffleRemaining = Array.isArray(record.shuffleRemaining)
        ? [...new Set(record.shuffleRemaining.filter((id) => valid.has(id) && id !== room.currentId))]
        : shuffledTrackIds(room);
    }
    if (!record.current && legacy) room.position = 0;
    rooms.set(record.id, room);
  }
  return rooms;
}

function createSaver(rooms, storagePath) {
  let writes = Promise.resolve();
  return () => {
    if (!storagePath) return Promise.resolve();
    const contents = JSON.stringify([...rooms.values()].map(saveRecord), null, 2);
    writes = writes.catch(() => {}).then(async () => {
      await mkdir(path.dirname(storagePath), { recursive: true });
      const temporaryPath = `${storagePath}.tmp`;
      await writeFile(temporaryPath, contents);
      await rename(temporaryPath, storagePath);
    });
    return writes;
  };
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error('요청이 너무 큽니다.');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new Error('올바른 JSON을 보내주세요.'); }
}

function createHostToken(room) {
  const token = randomBytes(32).toString('hex');
  room.hostTokenHash = createHash('sha256').update(token).digest('hex');
  return token;
}

function isRoomHost(room, request) {
  const token = request.headers['x-room-host-token'];
  if (!room.hostTokenHash || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(room.hostTokenHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

const playlistActions = new Set(['add', 'load', 'select', 'move', 'remove', 'repeat', 'repeat-one', 'shuffle', 'metadata']);

async function handleControl(room, body, response, save, inspectVideo, isHost) {
  if (body.type === 'access' && !isHost) return json(response, 403, { error: '방장만 조작 권한을 변경할 수 있어요.' });
  if (room.hostOnly && playlistActions.has(body.type) && !isHost) {
    return json(response, 403, { error: '이 방은 방장만 재생목록을 변경할 수 있어요.' });
  }
  const position = Number(body.position);
  const previousPosition = currentPosition(room);
  const previousTrackId = room.currentId;
  const previousEpoch = room.playbackEpoch;

  try {
    switch (body.type) {
      case 'access': {
        if (typeof body.hostOnly !== 'boolean') return json(response, 400, { error: '조작 권한 설정을 확인해 주세요.' });
        room.hostOnly = body.hostOnly;
        break;
      }
      case 'add':
      case 'load': {
        const track = newTrack(body.videoId, body.title);
        const inspection = await inspectVideo(track.videoId);
        if (inspection.allowed === false) return json(response, 422, { error: inspection.reason });
        if (inspection.title && track.titleSource === 'fallback') {
          track.title = inspection.title;
          track.titleSource = 'auto';
        }
        if (inspection.durationSeconds) track.durationSeconds = inspection.durationSeconds;
        if (room.playlist.length >= MAX_PLAYLIST_LENGTH) return json(response, 400, { error: '재생목록에는 최대 500곡까지 담을 수 있어요.' });
        room.playlist.push(track);
        if (!room.currentId || body.type === 'load') {
          room.currentId = track.id;
          room.playing = true;
          room.position = 0;
          room.playbackEpoch += 1;
          if (room.shuffle) room.shuffleRemaining = shuffledTrackIds(room);
        } else if (room.shuffle) {
          const index = Math.floor(Math.random() * (room.shuffleRemaining.length + 1));
          room.shuffleRemaining.splice(index, 0, track.id);
        }
        break;
      }
      case 'play':
      case 'pause':
      case 'seek': {
        if (!currentTrack(room) || !Number.isFinite(position) || position < 0 || position > 86_400) {
          return json(response, 400, { error: '재생 위치를 확인해 주세요.' });
        }
        room.position = position;
        if (body.type === 'play') room.playing = true;
        if (body.type === 'pause') room.playing = false;
        break;
      }
      case 'next': {
        if (!currentTrack(room)) return json(response, 400, { error: '현재 재생 중인 곡이 없어요.' });
        if (body.trackId && body.trackId !== room.currentId) return json(response, 200, roomState(room));
        if (Number.isInteger(body.playbackEpoch) && body.playbackEpoch !== room.playbackEpoch) {
          return json(response, 200, roomState(room));
        }
        advanceTrack(room, body.fromEnd === true);
        break;
      }
      case 'duration': {
        const current = currentTrack(room);
        if (!current || current.id !== body.trackId) return json(response, 200, roomState(room));
        const seconds = Number(body.durationSeconds);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) {
          return json(response, 400, { error: '영상 길이를 확인해 주세요.' });
        }
        if (current.durationSeconds) return json(response, 200, roomState(room));
        current.durationSeconds = seconds;
        break;
      }
      case 'repeat':
      case 'repeat-one':
      case 'shuffle': {
        if (typeof body.enabled !== 'boolean') return json(response, 400, { error: '재생 설정을 확인해 주세요.' });
        if (body.type === 'repeat') {
          room.repeat = body.enabled;
          if (body.enabled) room.repeatOne = false;
        } else if (body.type === 'repeat-one') {
          room.repeatOne = body.enabled;
          if (body.enabled) {
            room.repeat = false;
            room.shuffle = false;
            room.shuffleRemaining = [];
          }
        } else {
          room.shuffle = body.enabled;
          if (body.enabled) room.repeatOne = false;
          room.shuffleRemaining = body.enabled ? shuffledTrackIds(room) : [];
        }
        break;
      }
      case 'select': {
        const track = room.playlist.find((item) => item.id === body.trackId);
        if (!track) return json(response, 400, { error: '재생목록에서 곡을 찾을 수 없어요.' });
        room.currentId = track.id;
        room.playing = true;
        room.position = 0;
        room.playbackEpoch += 1;
        if (room.shuffle) room.shuffleRemaining = shuffledTrackIds(room);
        break;
      }
      case 'move': {
        const index = room.playlist.findIndex((track) => track.id === body.trackId);
        if (index < 0) return json(response, 400, { error: '재생목록에서 곡을 찾을 수 없어요.' });
        const targetIndex = body.targetIndex === undefined
          ? index + Number(body.direction)
          : body.targetIndex;
        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= room.playlist.length) {
          return json(response, 400, { error: '이동할 위치를 확인해 주세요.' });
        }
        if (targetIndex === index) return json(response, 200, roomState(room));
        const [track] = room.playlist.splice(index, 1);
        room.playlist.splice(targetIndex, 0, track);
        break;
      }
      case 'remove': {
        const index = room.playlist.findIndex((track) => track.id === body.trackId);
        if (index < 0) return json(response, 400, { error: '재생목록에서 곡을 찾을 수 없어요.' });
        const removingCurrent = body.trackId === room.currentId;
        room.playlist.splice(index, 1);
        if (removingCurrent) {
          room.currentId = room.shuffle
            ? shuffledTrackIds(room, true).pop() || null
            : room.playlist[index]?.id || room.playlist[0]?.id || null;
          room.playing = Boolean(room.currentId && room.playing);
          room.position = 0;
          room.playbackEpoch += 1;
          if (room.shuffle) room.shuffleRemaining = shuffledTrackIds(room);
        } else if (room.shuffle) {
          room.shuffleRemaining = room.shuffleRemaining.filter((id) => id !== body.trackId);
        }
        break;
      }
      case 'metadata': {
        const current = currentTrack(room);
        if (!current || current.id !== body.trackId) {
          return json(response, 400, { error: '곡 정보를 변경할 수 없어요.' });
        }
        if (current.titleSource !== 'fallback') return json(response, 200, roomState(room));
        const title = validateTitle(body.title);
        if (!title) return json(response, 400, { error: '곡 이름을 입력해 주세요.' });
        current.title = title;
        current.titleSource = 'auto';
        break;
      }
      default:
        return json(response, 400, { error: '지원하지 않는 조작입니다.' });
    }
  } catch (error) {
    return json(response, error instanceof VideoCheckError ? 503 : 400, { error: error.message });
  }

  if (room.currentId === previousTrackId && room.playbackEpoch === previousEpoch && !['play', 'pause', 'seek'].includes(body.type)) {
    room.position = previousPosition;
  }
  room.updatedAt = Date.now();
  room.version += 1;
  await save();
  broadcast(room);
  return json(response, 200, roomState(room));
}

async function serveFile(url, response) {
  const files = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/design.css': ['design.css', 'text/css; charset=utf-8'],
    '/workspace.css': ['workspace.css', 'text/css; charset=utf-8'],
    '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
    '/lyrics.js': ['lyrics.js', 'text/javascript; charset=utf-8'],
  };
  const entry = files[url.pathname];
  if (!entry) return json(response, 404, { error: '페이지를 찾을 수 없어요.' });
  const file = await readFile(path.join(publicDirectory, entry[0]));
  response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  response.end(file);
}

function normalizedSongLabel(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function originalTitlesFromSuggestions(suggestions, artist, translatedTitle) {
  const artistKeys = new Set([
    normalizedSongLabel(artist),
    normalizedSongLabel(artist.replace(/[（(][^）)]*[）)]/gu, '')),
    ...[...artist.matchAll(/[（(]([^）)]+)[）)]/gu)].map((match) => normalizedSongLabel(match[1])),
  ].filter(Boolean));
  const titleKey = normalizedSongLabel(translatedTitle);
  const titles = new Set();
  for (const suggestion of suggestions) {
    if (typeof suggestion !== 'string') continue;
    const pair = suggestion.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
    if (!pair || !artistKeys.has(normalizedSongLabel(pair[1]))) continue;
    const titlesPair = pair[2].match(/^(.+?)\s*[([（【]\s*([^\])）】]+)\s*[)\]）】]\s*$/u);
    if (!titlesPair) continue;
    const first = titlesPair[1].trim();
    const second = titlesPair[2].trim();
    const firstKey = normalizedSongLabel(first);
    const secondKey = normalizedSongLabel(second);
    if (firstKey === titleKey && secondKey && secondKey !== titleKey) titles.add(second);
    if (secondKey === titleKey && firstKey && firstKey !== titleKey) titles.add(first);
    if (titles.size >= 3) break;
  }
  return [...titles];
}

export function createAppServer({ storagePath = null, youtubeApiKey = null, fetchVideo = fetch, fetchSuggestions = fetch } = {}) {
  const rooms = loadRooms(storagePath);
  const save = createSaver(rooms, storagePath);
  const searchCache = new Map();
  const lyricTitleCache = new Map();
  const getApiKey = () => {
    if (youtubeApiKey !== null) return youtubeApiKey.trim();
    if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY.trim();
    try { return readFileSync(localApiKeyPath, 'utf8').trim(); }
    catch (error) {
      if (error.code === 'ENOENT') return '';
      throw error;
    }
  };
  const inspectVideo = (videoId) => inspectYouTubeVideo(videoId, getApiKey(), fetchVideo);
  const catchUpRoom = async (room) => {
    if (!advanceDueTracks(room)) return;
    broadcast(room);
    await save();
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (request.method === 'GET' && url.pathname === '/api/config') {
        return json(response, 200, { precheckEnabled: Boolean(getApiKey()) });
      }
      if (request.method === 'GET' && url.pathname === '/api/lyrics/titles') {
        const artist = (url.searchParams.get('artist') || '').trim();
        const track = (url.searchParams.get('track') || '').trim();
        if (!artist || !track || artist.length > 100 || track.length > 100) {
          return json(response, 400, { error: '가수와 곡 제목을 확인해 주세요.' });
        }
        const key = JSON.stringify([artist.toLocaleLowerCase(), track.toLocaleLowerCase()]);
        const cached = lyricTitleCache.get(key);
        if (cached && Date.now() - cached.at < 24 * 60 * 60_000) return json(response, 200, { titles: cached.titles });
        let titles = [];
        try {
          const query = new URLSearchParams({ client: 'firefox', q: `${artist} ${track}` });
          const result = await fetchSuggestions(`https://suggestqueries.google.com/complete/search?${query}`, {
            headers: { 'User-Agent': 'SudeemiMusic/0.1.0 (https://github.com/KMW-CL/music-together)' },
            signal: AbortSignal.timeout(4_000),
          });
          if (result.ok) {
            const data = await result.json();
            titles = originalTitlesFromSuggestions(Array.isArray(data?.[1]) ? data[1] : [], artist, track);
          }
        } catch { /* Suggestions are optional. */ }
        if (lyricTitleCache.size >= 200) lyricTitleCache.delete(lyricTitleCache.keys().next().value);
        lyricTitleCache.set(key, { at: Date.now(), titles });
        return json(response, 200, { titles });
      }
      if (request.method === 'POST' && url.pathname === '/api/rooms') {
        const room = newRoom(rooms);
        const hostToken = createHostToken(room);
        await save();
        return json(response, 201, { ...roomState(room), hostToken });
      }

      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{8})(?:\/(events|control|search|host|claim-host))?$/);
      if (match) {
        const room = rooms.get(match[1]);
        if (!room) return json(response, 404, { error: '방을 찾을 수 없어요. 새 방을 만들어주세요.' });
        await catchUpRoom(room);
        if (request.method === 'GET' && !match[2]) return json(response, 200, roomState(room));
        if (request.method === 'GET' && match[2] === 'host') return json(response, 200, { isHost: isRoomHost(room, request) });
        if (request.method === 'POST' && match[2] === 'claim-host') {
          if (room.hostTokenHash) return json(response, 409, { error: '이미 방장이 등록된 방이에요.' });
          const hostToken = createHostToken(room);
          room.version += 1;
          await save();
          broadcast(room);
          return json(response, 200, { ...roomState(room), hostToken });
        }
        if (request.method === 'POST' && match[2] === 'control') {
          return handleControl(room, await readJson(request), response, save, inspectVideo, isRoomHost(room, request));
        }
        if (request.method === 'POST' && match[2] === 'search') {
          const body = await readJson(request);
          if (typeof body.query !== 'string' || body.query.trim().length < 2 || body.query.trim().length > 100) {
            return json(response, 400, { error: '검색어를 2~100자로 입력해 주세요.' });
          }
          if (body.pageToken !== undefined && (typeof body.pageToken !== 'string' || !body.pageToken || body.pageToken.length > 512)) {
            return json(response, 400, { error: '검색 페이지를 확인해 주세요.' });
          }
          const query = body.query.trim().replace(/\s+/g, ' ');
          const pageToken = body.pageToken || '';
          const apiKey = getApiKey();
          if (!apiKey) return json(response, 503, { error: 'YouTube 검색을 사용하려면 로컬 API 키를 설정해 주세요.' });
          const cacheKey = JSON.stringify([query.toLocaleLowerCase(), pageToken]);
          const cached = searchCache.get(cacheKey);
          if (cached && Date.now() - cached.at < 30 * 60_000) {
            return json(response, 200, cached.result);
          }
          try {
            const result = await searchYouTubeVideos(query, pageToken, apiKey, fetchVideo);
            if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
            searchCache.set(cacheKey, { at: Date.now(), result });
            return json(response, 200, result);
          } catch (error) {
            return json(response, error instanceof VideoCheckError ? 503 : 500, { error: error.message });
          }
        }
        if (request.method === 'GET' && match[2] === 'events') {
          response.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
          });
          room.clients.add(response);
          broadcast(room);
          const heartbeat = setInterval(() => response.write(': ping\n\n'), 25_000);
          response.on('close', () => {
            clearInterval(heartbeat);
            room.clients.delete(response);
            broadcast(room);
          });
          return;
        }
      }

      if (request.method === 'GET' && !url.pathname.startsWith('/api/')) return serveFile(url, response);
      return json(response, 404, { error: '요청을 찾을 수 없어요.' });
    } catch (error) {
      return json(response, 500, { error: error.message || '요청을 처리하지 못했어요.' });
    }
  });
  server.saveRooms = save;
  server.advanceRooms = async () => {
    for (const room of rooms.values()) await catchUpRoom(room);
  };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer({ storagePath: process.env.MUSIC_TOGETHER_DATA || defaultStoragePath });
  server.listen(port, () => {
    console.log(`Music Together: http://localhost:${port}`);
    const addresses = Object.values(networkInterfaces()).flat().filter((address) => address?.family === 'IPv4' && !address.internal);
    for (const address of addresses) console.log(`같은 네트워크에서 접속: http://${address.address}:${port}`);
  });
  setInterval(() => server.saveRooms().catch((error) => console.error('방 저장 실패:', error)), 15_000).unref();
  setInterval(() => server.advanceRooms().catch((error) => console.error('자동 재생 진행 실패:', error)), 1_000).unref();
}
