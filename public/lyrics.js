const lyricsStatus = document.getElementById('lyricsStatus');
const lyricsContainer = document.getElementById('lyricsLines');
const lyricsRetry = document.getElementById('lyricsRetry');
const lyricsCredit = document.getElementById('lyricsCredit');
const lyricsCache = new Map();
const lyricsClient = 'SudeemiMusic/0.1.0 (https://github.com/KMW-CL/music-together)';
let lyricsKey = null;
let lyricsTitle = '';
let lyricsTrackId = null;
let lyricsDuration = 0;
let lyricsRequestId = 0;
let lyricsController = null;
let lyricsTimedLines = [];
let lyricsActiveIndex = -1;
let lyricsPosition = 0;
let lyricsNextRequestAt = 0;
let lyricsRateLimitedUntil = 0;

function cleanLyricsTitle(title) {
  return String(title || '')
    .replace(/\s*[([][^\])]*(?:official|music video|mv|lyric|audio|뮤직비디오|가사|공식 영상|4k|hd)[^\])]*[)\]]/gi, '')
    .replace(/\s+(?:official\s*)?(?:m\/?v|music\s*video|video|lyrics?\s*video|audio)(?:\s*[-–—].*)?\s*$/gi, '')
    .replace(/\s+[-–—]\s*\[[^\]]+\]\s*(?:ep|album|single)?\s*$/gi, '')
    .trim();
}

function lyricsSignature(title) {
  const cleaned = cleanLyricsTitle(title);
  const pair = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (pair) return { artist: pair[1].trim(), track: pair[2].trim() };
  const quoted = cleaned.match(/^(.+?)\s+['"“‘]([^'"”’]+)['"”’]$/);
  return quoted ? { artist: quoted[1].trim(), track: quoted[2].trim() } : { artist: '', track: cleaned };
}

function normalizedLyricsName(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/\b(?:feat\.?|ft\.?|featuring)\b.*$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function normalizedLyricsArtist(value) {
  return normalizedLyricsName(String(value || '').replace(/\s*[-–—]\s*Topic\s*$/i, ''));
}

function koreanLyricsPreference(record) {
  const displayedLyrics = String(record.syncedLyrics || record.plainLyrics || '');
  const hangul = (displayedLyrics.match(/[가-힣]/g) || []).length;
  if (hangul < 8) return 0;
  const latin = (displayedLyrics.match(/[A-Za-z]/g) || []).length;
  return 10 + 4 * hangul / (hangul + latin);
}

function lyricsMatchScore(record, signature, duration) {
  const expectedTitle = normalizedLyricsName(signature.track);
  const actualTitle = normalizedLyricsName(record.trackName || record.name);
  if (!expectedTitle || !actualTitle) return -1;
  if (expectedTitle !== actualTitle) return -1;
  const expectedArtist = normalizedLyricsArtist(signature.artist);
  const actualArtist = normalizedLyricsArtist(record.artistName);
  if (expectedArtist && actualArtist !== expectedArtist
    && !actualArtist.startsWith(`${expectedArtist} `)
    && !expectedArtist.startsWith(`${actualArtist} `)) return -1;
  const difference = Number.isFinite(record.duration) && duration > 0 ? Math.abs(record.duration - duration) : 0;
  if (difference > 60) return -1;
  return (actualTitle === expectedTitle ? 12 : 5) + (expectedArtist ? 8 : 0)
    + (difference <= 8 ? 2 : 0) + (record.syncedLyrics ? 2 : 0)
    + (record.plainLyrics ? 1 : 0) + koreanLyricsPreference(record) - Math.min(5, difference / 10);
}

function bestLyricsRecord(records, signature, duration) {
  if (!Array.isArray(records)) return null;
  const matches = records.map((record) => ({ record, score: lyricsMatchScore(record, signature, duration) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);
  if (!signature.artist && new Set(matches.map(({ record }) => normalizedLyricsArtist(record.artistName))).size > 1) return null;
  return matches[0]?.record || null;
}

async function lyricsSearch(parameters, signal) {
  if (Date.now() < lyricsRateLimitedUntil) throw new Error('가사 요청이 많아요. 잠시 후 다시 찾아 주세요.');
  const delay = Math.max(0, lyricsNextRequestAt - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (signal.aborted) return [];
  if (Date.now() < lyricsRateLimitedUntil) throw new Error('가사 요청이 많아요. 잠시 후 다시 찾아 주세요.');
  const query = new URLSearchParams(parameters);
  lyricsNextRequestAt = Date.now() + 350;
  const response = await fetch(`https://lrclib.net/api/search?${query}`, {
    signal,
    headers: { 'Lrclib-Client': lyricsClient },
  });
  lyricsNextRequestAt = Date.now() + 350;
  if (response.status === 429) {
    const value = response.headers.get('Retry-After');
    const seconds = Number(value);
    const wait = Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(value) - Date.now());
    lyricsRateLimitedUntil = Date.now() + Math.max(1_000, wait || 60_000);
    lyricsNextRequestAt = lyricsRateLimitedUntil;
    throw new Error('가사 요청이 많아요. 잠시 후 다시 찾아 주세요.');
  }
  if (!response.ok) throw new Error('가사 서비스에 연결하지 못했어요.');
  const records = await response.json();
  if (!Array.isArray(records)) throw new Error('가사 응답을 읽지 못했어요.');
  return records;
}

async function findLyrics(title, duration, signal) {
  const signature = lyricsSignature(title);
  if (!signature.track || /^유튜브 영상\s*[·-]/.test(signature.track)) return null;
  const search = signature.artist
    ? { track_name: signature.track, artist_name: signature.artist }
    : { q: signature.track };
  let match = null;
  let searchError = null;
  try {
    match = bestLyricsRecord(await lyricsSearch(search, signal), signature, duration);
    if (!match && signature.artist && !signal.aborted) {
      match = bestLyricsRecord(await lyricsSearch({ q: signature.track }, signal), signature, duration);
    }
  } catch (error) {
    if (signal.aborted) throw error;
    searchError = error;
  }
  if (signature.artist && !koreanLyricsPreference(match || {}) && !signal.aborted) {
    try {
      const query = new URLSearchParams({ track_name: signature.track, artist_name: signature.artist });
      const response = await fetch(`https://api.lrcmux.dev/compat/lrclib/api/search?${query}`, { signal });
      if (response.ok) {
        const koreanMatch = bestLyricsRecord(await response.json(), signature, duration);
        if (koreanMatch && (koreanLyricsPreference(koreanMatch) || !match)) {
          return { ...koreanMatch, _lyricsSource: 'lrcmux' };
        }
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  if (match) return { ...match, _lyricsSource: 'lrclib' };
  if (searchError) throw searchError;
  return null;
}

function parseTimedLyrics(value) {
  const lines = [];
  for (const row of String(value || '').split(/\r?\n/)) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = row.replace(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g, '').trim() || '♪';
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) / 1000 : 0;
      lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function showLyricsMessage(message, retry = false) {
  lyricsStatus.textContent = message;
  lyricsContainer.replaceChildren();
  lyricsTimedLines = [];
  lyricsActiveIndex = -1;
  lyricsRetry.classList.toggle('hidden', !retry);
  lyricsCredit.classList.add('hidden');
}

function displayLyrics(record) {
  if (!record) return showLyricsMessage('이 곡과 일치하는 가사를 찾지 못했어요.', true);
  if (record.instrumental) return showLyricsMessage('가사가 없는 연주곡으로 등록되어 있어요.');
  const timed = parseTimedLyrics(record.syncedLyrics);
  const plain = String(record.plainLyrics || '').trim();
  if (!timed.length && !plain) return showLyricsMessage('표시할 가사가 없어요.', true);
  lyricsRetry.classList.add('hidden');
  lyricsCredit.classList.remove('hidden');
  const alternateSource = record._lyricsSource === 'lrcmux';
  lyricsCredit.href = alternateSource ? 'https://lrcmux.dev/' : 'https://lrclib.net/';
  lyricsCredit.textContent = alternateSource ? '가사 제공: lrc mux ↗' : '가사 제공: LRCLIB ↗';
  lyricsTimedLines = timed;
  lyricsActiveIndex = -1;
  lyricsStatus.textContent = timed.length ? '재생 시간에 맞춰 가사를 표시해요.' : '시간 정보가 없는 가사예요.';
  const textLines = timed.length ? timed.map(({ text }) => text) : plain.split(/\r?\n/);
  lyricsContainer.replaceChildren(...textLines.map((text) => {
    const line = document.createElement('p');
    line.className = 'lyrics-line';
    line.textContent = text || '\u00a0';
    return line;
  }));
  updateLyricsPosition(lyricsPosition);
}

function updateLyricsPosition(seconds) {
  lyricsPosition = Math.max(0, Number(seconds) || 0);
  if (!lyricsTimedLines.length) return;
  let low = 0;
  let high = lyricsTimedLines.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (lyricsTimedLines[middle].time <= lyricsPosition) low = middle + 1;
    else high = middle;
  }
  const next = low - 1;
  if (next === lyricsActiveIndex) return;
  const previous = lyricsContainer.children[lyricsActiveIndex];
  previous?.classList.remove('is-active');
  previous?.removeAttribute('aria-current');
  lyricsActiveIndex = next;
  const active = lyricsContainer.children[next];
  if (!active) return;
  active.classList.add('is-active');
  active.setAttribute('aria-current', 'true');
  lyricsContainer.scrollTo?.({
    top: Math.max(0, active.offsetTop - lyricsContainer.offsetTop - lyricsContainer.clientHeight / 2),
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'instant' : 'smooth',
  });
}

function clearLyrics() {
  lyricsRequestId++;
  lyricsController?.abort();
  lyricsController = null;
  lyricsKey = null;
  lyricsTitle = '';
  lyricsTrackId = null;
  lyricsPosition = 0;
  showLyricsMessage('곡을 재생하면 가사를 자동으로 찾아요.');
}

async function setLyricsTrack(trackId, title, duration = 0) {
  if (!trackId) {
    if (lyricsKey !== null) clearLyrics();
    return;
  }
  const key = `${trackId}:${title}`;
  if (key === lyricsKey) return;
  lyricsRequestId++;
  lyricsController?.abort();
  lyricsTrackId = trackId;
  lyricsTitle = title;
  lyricsDuration = duration;
  lyricsKey = key;
  const requestId = lyricsRequestId;
  if (/^유튜브 영상\s*[·-]/.test(title)) {
    showLyricsMessage('곡 제목을 확인하는 중이에요.');
    return;
  }
  if (lyricsCache.has(title)) {
    displayLyrics(lyricsCache.get(title));
    return;
  }
  showLyricsMessage('가사를 찾는 중…');
  const controller = new AbortController();
  lyricsController = controller;
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const record = await findLyrics(title, duration, controller.signal);
    if (requestId !== lyricsRequestId) return;
    lyricsCache.set(title, record);
    displayLyrics(record);
  } catch (error) {
    if (requestId !== lyricsRequestId) return;
    showLyricsMessage(error.name === 'AbortError' ? '가사 검색 시간이 초과됐어요.' : error.message || '가사를 가져오지 못했어요.', true);
  } finally {
    clearTimeout(timeout);
    if (lyricsController === controller) lyricsController = null;
  }
}

lyricsRetry.addEventListener('click', () => {
  const trackId = lyricsTrackId;
  const title = lyricsTitle;
  const duration = lyricsDuration;
  lyricsCache.delete(title);
  lyricsKey = null;
  setLyricsTrack(trackId, title, duration);
});

window.musicLyrics = { setTrack: setLyricsTrack, setTime: updateLyricsPosition, clear: clearLyrics };
