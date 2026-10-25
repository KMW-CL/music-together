import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('./public/lyrics.js', import.meta.url), 'utf8');

function lyricsContext(fetch) {
  const elements = new Map();
  function element() {
    const classes = new Set();
    return {
      children: [], listeners: {}, classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
        contains: (name) => classes.has(name),
      },
      addEventListener(name, handler) { this.listeners[name] = handler; },
      replaceChildren(...children) {
        this.children = children;
        children.forEach((child, index) => { child.offsetTop = index * 32; });
      },
      setAttribute(name, value) { this[name] = value; },
      removeAttribute(name) { delete this[name]; },
      scrollTo({ top }) { this.scrollTop = top; },
      offsetTop: 0, clientHeight: 120,
    };
  }
  const context = vm.createContext({
    document: { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element },
    window: { matchMedia: () => ({ matches: true }) },
    fetch, AbortController, URLSearchParams, Date, Set,
    setTimeout(callback, delay) { if (delay < 10_000) queueMicrotask(callback); return 1; },
    clearTimeout() {},
  });
  vm.runInContext(source, context);
  return { context, elements };
}

test('lyrics matching rejects a different artist and ambiguous title', () => {
  const { context } = lyricsContext(async () => {});
  const signature = vm.runInContext("lyricsSignature('Rick Astley - Never Gonna Give You Up (Official Video)')", context);
  assert.equal(signature.artist, 'Rick Astley');
  assert.equal(signature.track, 'Never Gonna Give You Up');
  const martini = vm.runInContext("lyricsSignature('DPR LIVE - Martini Blue OFFICIAL M/V - [HER] EP')", context);
  assert.equal(martini.artist, 'DPR LIVE');
  assert.equal(martini.track, 'Martini Blue');
  const rescene = vm.runInContext("lyricsSignature('RESCENE (리센느) - Runaway MV')", context);
  assert.equal(rescene.artist, 'RESCENE (리센느)');
  assert.equal(rescene.track, 'Runaway');
  const official = vm.runInContext("lyricsSignature(\"RESCENE (리센느) 'Runaway' Official MV\")", context);
  assert.equal(official.artist, 'RESCENE (리센느)');
  assert.equal(official.track, 'Runaway');
  const translated = vm.runInContext("lyricsSignature('다시 듣고 싶어, 너의 노래가🌻: Vaundy - 괴수의 꽃노래 [가사/발음/해석]')", context);
  assert.equal(translated.artist, 'Vaundy');
  assert.equal(translated.track, '괴수의 꽃노래');
  context.videoTitleVariants = vm.runInContext("lyricsTitleVariants('괴수의 꽃노래 (怪獣の花唄)')", context);
  assert.equal(context.videoTitleVariants[2], '怪獣の花唄');
  const records = [
    { trackName: 'Never Gonna Give You Up', artistName: 'Cover Band', duration: 213, plainLyrics: 'Wrong' },
    { trackName: 'Never Gonna Give You Up', artistName: 'Rick Astley', duration: 212, syncedLyrics: '[00:01.00]Right' },
  ];
  context.records = records;
  assert.equal(vm.runInContext('bestLyricsRecord(records, lyricsSignature("Rick Astley - Never Gonna Give You Up"), 212).artistName', context), 'Rick Astley');
  assert.equal(vm.runInContext('bestLyricsRecord(records, lyricsSignature("Never Gonna Give You Up"), 212)', context), null);
  context.martiniRecords = [
    { trackName: 'Martini Blue', artistName: 'DPR LIVE - Topic', duration: 196, syncedLyrics: '[00:01.00]Line' },
    { trackName: 'Martini Blue', artistName: 'DPR LIVE', duration: 195, syncedLyrics: '[00:01.00]Line' },
  ];
  assert.equal(vm.runInContext('bestLyricsRecord(martiniRecords, lyricsSignature("Martini Blue"), 195).artistName', context), 'DPR LIVE');
});

test('varied YouTube title examples produce usable artist and track names', () => {
  const { context } = lyricsContext(async () => {});
  const examples = [
    ['박재정 - 계절의 끝 / Lyrics / 가사', '박재정', '계절의 끝'],
    ['박재정 - 계절의 끝 / Kpop / Lyrics / 가사', '박재정', '계절의 끝'],
    ['Vaundy - 괴수의 꽃노래(怪獣の花唄) [가사/발음/해석]', 'Vaundy', '괴수의 꽃노래(怪獣の花唄)'],
    ["RESCENE (리센느) 'Runaway' Official MV", 'RESCENE (리센느)', 'Runaway'],
    ['뉴진스 (NEWJEANS)－「OMG」 [LYRICS] 가사 한국어', '뉴진스 (NEWJEANS)', 'OMG'],
    ['YOASOBI - 밤을 달리다 [가사/해석]', 'YOASOBI', '밤을 달리다'],
    ['AC/DC - Back in Black (Official Audio)', 'AC/DC', 'Back in Black'],
    ['Artist - Love / Hate', 'Artist', 'Love / Hate'],
    ['Hogu (호구) (Prod.by Fisherman of wybh) (feat.BrotherSu) (브라더수)', '', 'Hogu (호구)'],
  ];
  for (const [title, artist, track] of examples) {
    context.title = title;
    const signature = vm.runInContext('lyricsSignature(title)', context);
    assert.equal(signature.artist, artist, title);
    assert.equal(signature.track, track, title);
  }
  context.records = [
    { trackName: 'OMG', artistName: 'NewJeans', duration: 212, plainLyrics: 'Right' },
    { trackName: 'OMG', artistName: 'Cover Band', duration: 212, plainLyrics: 'Wrong' },
  ];
  assert.equal(vm.runInContext('bestLyricsRecord(records, lyricsSignature("뉴진스 (NEWJEANS)－「OMG」 [LYRICS] 가사 한국어"), 212).artistName', context), 'NewJeans');
  assert.equal(vm.runInContext('searchLyricsArtist("뉴진스 (NEWJEANS)")', context), 'NEWJEANS');
  context.hoguRecords = [
    { trackName: 'Hogu (Prod.by Fisherman of wybh) (feat.BrotherSu)', artistName: 'GIRIBOY', duration: 230, plainLyrics: 'Right' },
    { trackName: 'Hogu', artistName: 'Other Artist', duration: 230, plainLyrics: 'Wrong' },
  ];
  assert.equal(vm.runInContext('bestLyricsRecord(hoguRecords, { artist: "GIRIBOY(기리보이)", track: "Hogu (호구)" }, 230).artistName', context), 'GIRIBOY');
});

test('an artist hint finds a song whose YouTube title omits the artist', async () => {
  const requests = [];
  const { context, elements } = lyricsContext(async (url) => {
    requests.push(url);
    if (url.startsWith('https://api.lrcmux.dev/')) return { ok: true, json: async () => [] };
    if (url.startsWith('/api/lyrics/titles?')) return { ok: true, json: async () => ({ titles: [] }) };
    const query = new URL(url).searchParams;
    return { ok: true, status: 200, json: async () =>
      query.get('track_name') === 'Hogu' && query.get('artist_name') === 'GIRIBOY'
        ? [{ trackName: 'Hogu (Prod.by Fisherman of wybh) (feat.BrotherSu)',
          artistName: '기리보이', duration: 230, plainLyrics: '아무것도 필요 없어 다시 너를 생각해' }]
        : [] };
  });
  await context.window.musicLyrics.setTrack('track-1',
    'Hogu (호구) (Prod.by Fisherman of wybh) (feat.BrotherSu) (브라더수)', 230, 'GIRIBOY(기리보이)');
  assert.ok(requests.some((url) => url.includes('track_name=Hogu&artist_name=GIRIBOY')));
  assert.equal(elements.get('lyricsLines').children[0].textContent, '아무것도 필요 없어 다시 너를 생각해');
});

test('a late artist hint retries a title that was previously unmatched', async () => {
  const { context, elements } = lyricsContext(async (url) => {
    if (url.startsWith('https://api.lrcmux.dev/')) return { ok: true, json: async () => [] };
    if (url.startsWith('/api/lyrics/titles?')) return { ok: true, json: async () => ({ titles: [] }) };
    const query = new URL(url).searchParams;
    return { ok: true, status: 200, json: async () =>
      query.get('artist_name') === 'GIRIBOY'
        ? [{ trackName: 'Hogu', artistName: 'GIRIBOY', duration: 230, plainLyrics: '다시 만난 우리의 이야기' }]
        : [] };
  });
  await context.window.musicLyrics.setTrack('track-1', 'Hogu', 230);
  assert.equal(elements.get('lyricsLines').children.length, 0);
  await context.window.musicLyrics.setTrack('track-1', 'Hogu', 230, 'GIRIBOY');
  assert.equal(elements.get('lyricsLines').children[0].textContent, '다시 만난 우리의 이야기');
});

test('a slash-tagged video searches the clean song name', async () => {
  const requests = [];
  const { context, elements } = lyricsContext(async (url) => {
    requests.push(url);
    if (url.startsWith('https://api.lrcmux.dev/')) return { ok: true, json: async () => [] };
    const query = new URL(url).searchParams;
    return { ok: true, status: 200, json: async () =>
      query.get('track_name') === '계절의 끝' && query.get('artist_name') === '박재정'
        ? [{ trackName: '계절의 끝', artistName: '박재정', duration: 326, plainLyrics: '계절의 끝에서 다시 만난 우리 이야기' }]
        : [] };
  });
  await context.window.musicLyrics.setTrack('track-1', '박재정 - 계절의 끝 / Lyrics / 가사', 326);
  assert.equal(requests.length, 1);
  assert.equal(elements.get('lyricsLines').children[0].textContent, '계절의 끝에서 다시 만난 우리 이야기');
});

test('timed lyrics follow the current playback position', async () => {
  const requests = [];
  const { context, elements } = lyricsContext(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true, status: 200,
      json: async () => [{
        trackName: 'Song', artistName: 'Artist', duration: 100,
        syncedLyrics: '[00:01.00]First\n[00:12.50]Second', plainLyrics: 'First\nSecond',
      }],
    };
  });
  await context.window.musicLyrics.setTrack('track-1', 'Artist - Song (Official MV)', 100);
  assert.match(requests[0].url, /track_name=Song&artist_name=Artist/);
  assert.equal(requests[0].options.headers['Lrclib-Client'].includes('SudeemiMusic'), true);
  const lines = elements.get('lyricsLines').children;
  assert.equal(lines.length, 2);
  context.window.musicLyrics.setTime(13);
  assert.equal(lines[1].classList.contains('is-active'), true);
  context.window.musicLyrics.setTime(2);
  assert.equal(lines[0].classList.contains('is-active'), true);
  assert.equal(lines[1].classList.contains('is-active'), false);
});

test('Korean lyrics win over a closer romanized version of the same song', () => {
  const { context } = lyricsContext(async () => {});
  context.variants = [
    { trackName: 'Runaway', artistName: 'RESCENE (리센느)', duration: 196,
      syncedLyrics: '[00:01.00]geu gil-eul ttaragayo\n[00:12.00]run away with me' },
    { trackName: 'Runaway', artistName: 'RESCENE (리센느)', duration: 182,
      syncedLyrics: '[00:01.00]그 길을 따라가요\n[00:12.00]함께 달려가요' },
  ];
  const chosen = vm.runInContext('bestLyricsRecord(variants, lyricsSignature("RESCENE (리센느) - Runaway MV"), 196)', context);
  assert.equal(chosen.duration, 182);
});

test('Japanese lyrics win over romanization for a Japanese song', () => {
  const { context } = lyricsContext(async () => {});
  context.variants = [
    { trackName: '怪獣の花唄', artistName: 'Vaundy', duration: 226,
      syncedLyrics: '[00:01.00]Romanized first line\n[00:12.00]Romanized second line' },
    { trackName: '怪獣の花唄', artistName: 'Vaundy', duration: 232,
      syncedLyrics: '[00:01.00]日本語の歌詞です\n[00:12.00]次の日本語の歌詞です' },
  ];
  const chosen = vm.runInContext('bestLyricsRecord(variants, lyricsSignature("Vaundy - 怪獣の花唄"), 226)', context);
  assert.equal(chosen.duration, 232);
});

test('translated titles resolve to matching originals across artists', async () => {
  for (const sample of [
    { video: '다시 듣고 싶어, 너의 노래가🌻: Vaundy - 괴수의 꽃노래 [가사/발음/해석]',
      artist: 'Vaundy', translated: '괴수의 꽃노래', original: '怪獣の花唄' },
    { video: 'YOASOBI - 밤을 달리다 [가사/해석]',
      artist: 'YOASOBI', translated: '밤을 달리다', original: '夜に駆ける' },
  ]) {
    const requests = [];
    const { context, elements } = lyricsContext(async (url) => {
      requests.push(url);
      if (url.startsWith('/api/lyrics/titles?')) return {
        ok: true, json: async () => ({ titles: [sample.original] }),
      };
      if (url.startsWith('https://api.lrcmux.dev/')) return { ok: true, json: async () => [] };
      const found = new URL(url).searchParams.get('track_name') === sample.original;
      return { ok: true, json: async () => found ? [{
        trackName: sample.original, artistName: sample.artist, duration: 220,
        syncedLyrics: '[00:01.00]日本語の歌詞です',
      }] : [] };
    });
    await context.window.musicLyrics.setTrack('track-1', sample.video, 220);
    assert.ok(requests.some((url) => url.startsWith('/api/lyrics/titles?')));
    assert.ok(requests.some((url) => url.includes(`track_name=${encodeURIComponent(sample.original)}`)));
    assert.equal(elements.get('lyricsLines').children[0].textContent, '日本語の歌詞です');
  }
});

test('Korean lyrics from the fallback source replace romanized synced lyrics', async () => {
  const requests = [];
  const { context, elements } = lyricsContext(async (url) => {
    requests.push(url);
    const korean = url.startsWith('https://api.lrcmux.dev/');
    return { ok: true, status: 200, json: async () => [
      { trackName: 'I Spy', artistName: 'NCT WISH', duration: 185,
        syncedLyrics: korean ? '[00:01.00]한글 가사 첫 줄\n[00:12.00]한글 가사 다음 줄'
          : '[00:01.00]Romanized first line\n[00:12.00]Romanized next line' },
    ] };
  });
  await context.window.musicLyrics.setTrack('track-1', 'NCT WISH - I Spy', 185);
  assert.equal(requests.length, 2);
  assert.equal(elements.get('lyricsLines').children[0].textContent, '한글 가사 첫 줄');
  assert.equal(elements.get('lyricsCredit').href, 'https://lrcmux.dev/');
  context.window.musicLyrics.setTime(13);
  assert.equal(elements.get('lyricsLines').children[1].classList.contains('is-active'), true);
});

test('a late lyrics response cannot replace the next song', async () => {
  let finishFirst;
  const { context, elements } = lyricsContext((url) => {
    if (url.includes('artist_name=First')) return new Promise((resolve) => { finishFirst = resolve; });
    return Promise.resolve({ ok: true, status: 200, json: async () => [
      { trackName: 'Song', artistName: 'Second', duration: 100, plainLyrics: 'Next song' },
    ] });
  });
  const first = context.window.musicLyrics.setTrack('one', 'First - Song', 100);
  const second = context.window.musicLyrics.setTrack('two', 'Second - Song', 100);
  await second;
  finishFirst({ ok: true, status: 200, json: async () => [
    { trackName: 'Song', artistName: 'First', duration: 100, plainLyrics: 'Old song' },
  ] });
  await first;
  assert.equal(elements.get('lyricsLines').children[0].textContent, 'Next song');
});
