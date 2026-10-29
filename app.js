(() => {
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const URL_RE = /https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/g;
// URL末尾に付いた句読点・閉じ括弧はリンクに含めない
const trimUrl = (u) => {
  for (;;) {
    const c = u.slice(-1);
    if (/[.,;:!?'"\]]/.test(c) || (c === ')' && (u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length)) u = u.slice(0, -1);
    else return u;
  }
};
const linkText = (u) => { const t = u.replace(/^https?:\/\//, ''); return t.length > 32 ? t.slice(0, 31) + '…' : t; };
const richText = (s) => esc(s)
  .replace(/nostr:(npub1[a-z0-9]{58})/g, (m, n) => `<a href="#/profile/${n}">@${n.slice(0, 10)}…</a>`)
  .replace(/(^|\s)@([A-Za-z0-9_]{3,15})/g, '$1<a href="#/profile/$2">@$2</a>')
  .replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, (m, p, t) => `${p}<a href="#/search/${encodeURIComponent('#' + t)}">#${t}</a>`);
const emojify = (html, em) => em && Object.keys(em).length
  ? html.replace(/(<[^>]*>)|:([A-Za-z0-9_]{1,40}):/g, (m, tag, n) => tag ? tag : em[n] ? `<img class="cemoji" src="${esc(em[n])}" alt=":${n}:" title=":${n}:" loading="lazy" referrerpolicy="no-referrer">` : m)
  : html;
const rich = (s, em) => {
  s = String(s); let out = '', i = 0;
  for (const m of s.matchAll(URL_RE)) {
    const u = trimUrl(m[0]);
    out += richText(s.slice(i, m.index)) + `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow ugc">${esc(linkText(u))}</a>`;
    i = m.index + u.length;
  }
  return emojify(out + richText(s.slice(i)), em);
};
const hue = (s) => Math.abs([...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) % 360;
const imgUrl = (f) => f;
const av = (u) => u.avatar ? `<img src="${esc(imgUrl(u.avatar))}" alt="" loading="lazy">` : `<span class="ph" style="background:hsl(${hue(u.handle)} 55% 45%)">${esc([...u.name][0] || '?')}</span>`;
const ago = (ts) => { const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return 'たった今'; if (d < 3600) return Math.floor(d / 60) + '分前';
  if (d < 86400) return Math.floor(d / 3600) + '時間前'; if (d < 604800) return Math.floor(d / 86400) + '日前';
  return new Date(ts * 1000).toLocaleDateString('ja-JP'); };

/* ---------- リンクプレビュー(OGP) ---------- */
const OGP = new Map(), ogpBusy = new Set(); // url -> {title,desc,image,site} | null
const firstUrl = (s) => { const m = String(s || '').match(URL_RE); return m ? trimUrl(m[0]) : ''; };
const ogpCard = (u) => { const o = OGP.get(u); if (!o) return '';
  return `<a class="ogp" href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow ugc">${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="ogp-body"><div class="ogp-site">${esc(o.site)}</div><div class="ogp-title">${esc(o.title)}</div>${o.desc ? `<div class="ogp-desc">${esc(o.desc)}</div>` : ''}</div></a>`; };
const ogpSlot = (body) => { const u = firstUrl(body); return u ? `<div class="ogp-slot" data-url="${esc(u)}">${ogpCard(u)}</div>` : ''; };
async function hydrateOgp() {
  const todo = [...new Set([...document.querySelectorAll('.ogp-slot')].map((s) => s.dataset.url))].filter((u) => !OGP.has(u) && !ogpBusy.has(u));
  todo.forEach((u) => ogpBusy.add(u));
  const worker = async () => {
    for (let u; (u = todo.shift());) {
      try { OGP.set(u, (await api('ogp', { q: { url: u } })).ogp || null); } catch (_) { OGP.set(u, null); }
      ogpBusy.delete(u);
      document.querySelectorAll('.ogp-slot').forEach((s) => { if (s.dataset.url === u && !s.firstChild) s.innerHTML = ogpCard(u); });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/* ---------- 上部プログレスバー ---------- */
const Prog = (() => {
  const wrap = document.getElementById('topbar'), bar = wrap && wrap.firstElementChild;
  let n = 0, v = 0, tick = 0, fin = 0, hide = 0;
  const paint = () => { if (bar) bar.style.transform = `scaleX(${v})`; };
  const start = () => {
    n++; clearTimeout(fin);
    if (!wrap || tick) return;
    clearTimeout(hide);
    wrap.style.transition = bar.style.transition = 'none';   // 0%に即リセット
    v = 0; paint(); wrap.style.opacity = 1;
    void wrap.offsetWidth;
    wrap.style.transition = bar.style.transition = '';
    v = 0.08; paint();
    tick = setInterval(() => { v += (0.92 - v) * 0.04; paint(); }, 200); // 待っている間じわじわ進む
  };
  const finish = () => {
    if (n > 0) return;
    clearInterval(tick); tick = 0;
    v = 1; paint();
    hide = setTimeout(() => { wrap.style.opacity = 0; }, 250);
  };
  const end = () => {
    if (n > 0) n--;
    if (!wrap || !tick) return;
    v += (0.92 - v) * 0.2; paint();                          // 1件完了するごとに前進
    if (n === 0) fin = setTimeout(finish, 150);              // 直列処理の継ぎ目でちらつかないよう少し待つ
  };
  // Promiseの開始〜完了をバーに反映する(結果はそのまま返す)
  const track = (p) => { start(); p.then(end, end); return p; };
  return { track };
})();

/* ===== ℕ : Nostr レイヤー (api.php の代替) ===== */
const NT = window.NostrTools;
//const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'wss://yabu.me'];
const RELAYS = [
  // 元のリスト
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://yabu.me',

  // --- 高高速・高稼働グローバルリレー ---
  'wss://relay.primal.net',      // Primal公式。非常に高速
  'wss://relay.snort.social',     // Snort公式
  'wss://nostr.mom',             // 広く使われているパブリックリレー
  'wss://offchain.pub',          // パブリックリレー

  // --- 国内・日本語コンテンツメイン ---
  'wss://relay.nostr.wirednet.jp', // WiredNetが運営する日本主力リレー
  'wss://nostr.holybea.com',      // 長期稼働している日本の代表的リレー
  'wss://r.koishi.hn',            // 日本語圏でよく使われるリレー
  'wss://nostr.fedibird.com',     // Fedibird運営の安定リレー
  'wss://relay.yozora.world',     // 日本語圏リレー

  // --- プロフィール・検索特化 ---
  'wss://purplepag.es',          // ユーザープロフィール情報(Kind 0)の検索用
  'wss://user.kindpag.es'         // プロフィール・イベント取得用
];
const SEARCH_RELAYS = ['wss://relay.nostr.band'];
const pool = new NT.SimplePool();
const sh = (h) => (h && h.length > 16 ? h.slice(0, 10) + '…' + h.slice(-4) : h || '');
const now = () => Math.floor(Date.now() / 1000);
const h2u = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
const npubOf = (pk) => NT.nip19.npubEncode(pk);
const pkOf = (h) => { h = String(h || ''); if (/^[0-9a-f]{64}$/.test(h)) return h; try { const d = NT.nip19.decode(h); return d.type === 'npub' ? d.data : d.type === 'nprofile' ? d.data.pubkey : ''; } catch (_) { return ''; } };
let SK = null, PK = '', EVC = new Map(), PROF = new Map(), CONTACTS = null, BM = null, LIKES = new Map(), RTS = new Map(), MYR = new Map();
const qf = (f, relays = RELAYS, w = 4000) => Prog.track(pool.querySync(relays, f, { maxWait: w }).catch(() => []));
async function signEv(kind, content, tags = []) {
  const t = { kind, content, tags, created_at: now() };
  return SK ? NT.finalizeEvent(t, SK) : window.nostr.signEvent(t);
}
async function pub(kind, content, tags) { const ev = await signEv(kind, content, tags); await Promise.any(pool.publish(RELAYS, ev)); EVC.set(ev.id, ev); return ev; }
const enc = (pk, t) => SK ? NT.nip04.encrypt(SK, pk, t) : window.nostr.nip04.encrypt(pk, t);
const dec = (pk, t) => (SK ? NT.nip04.decrypt(SK, pk, t) : window.nostr.nip04.decrypt(pk, t)).catch(() => '(復号できません)');

async function profiles(pks) {
  const need = [...new Set(pks)].filter((p) => !PROF.has(p));
  if (need.length) {
    const evs = await qf({ kinds: [0], authors: need });
    for (const e of evs) { const o = PROF.get(e.pubkey); if (o && o._t >= e.created_at) continue; try { PROF.set(e.pubkey, { ...JSON.parse(e.content), _t: e.created_at }); } catch (_) {} }
    need.forEach((p) => { if (!PROF.has(p)) PROF.set(p, { _t: 0 }); });
  }
}
const uJson = (pk) => { const p = PROF.get(pk) || {}; const n = npubOf(pk);
  return { pubkey: pk, handle: n, name: p.display_name || p.name || sh(n), bio: p.about || '', avatar: /^https?:/.test(p.picture || '') ? p.picture : null, banner: /^https?:/.test(p.banner || '') ? p.banner : null }; };
// リアクション(NIP-25): 空・'+'・❤ はいいね、'-' と :custom: は無視、それ以外は絵文字リアクション
const safeUrl = (u) => /^https:\/\/[^\s"'<>]+$/.test(u || '');
const CEMOJI = new Map(); // ':name:' -> 画像URL (NIP-30 カスタム絵文字)
const emojiMap = (tags) => { const o = {}; for (const t of tags) if (t[0] === 'emoji' && /^[A-Za-z0-9_]{1,40}$/.test(t[1] || '') && safeUrl(t[2])) o[t[1]] = t[2]; return o; };
const rxOf = (c) => { c = String(c || '').trim(); if (c === '' || c === '+' || /^[❤♥]\uFE0F?$/u.test(c)) return '+'; if (/^:[A-Za-z0-9_]{1,40}:$/.test(c)) return c; if (c === '-' || c[0] === ':' || c.length > 16) return null; return c; };
// イベントからリアクション種別を得る。カスタム絵文字は画像URLが無ければ無視し、あれば登録する
const rxEv = (s) => { const r = rxOf(s.content); if (!r || r === '+' || r[0] !== ':') return r;
  const u = emojiMap(s.tags)[r.slice(1, -1)]; if (!u) return null; if (!CEMOJI.has(r)) CEMOJI.set(r, u); return r; };
const RX_SET = ['👍', '😂', '😮', '😢', '🔥', '🎉', '🙏', '👀'];
const eTarget = (e) => [...e.tags].reverse().find((t) => t[0] === 'e')?.[1];
const parentOf = (e) => { const t = e.tags.filter((x) => x[0] === 'e'); if (!t.length) return null; return (t.find((x) => x[3] === 'reply') || t[t.length - 1])[1]; };

async function decorate(evs, order = 'desc') {
  evs = [...new Map(evs.map((e) => [e.id, e])).values()].sort((a, b) => order === 'asc' ? a.created_at - b.created_at : b.created_at - a.created_at);
  evs.forEach((e) => EVC.set(e.id, e));
  if (!evs.length) return [];
  const ids = evs.map((e) => e.id);
  const [, st] = await Promise.all([profiles(evs.map((e) => e.pubkey)), qf({ kinds: [1, 6, 7], '#e': ids, limit: 2000 })]);
  const c = {}; const slot = (id) => (c[id] ||= { rep: 0, rt: 0, likes: 0, rx: {} }); const bump = (id, k) => { slot(id)[k]++; };
  const seenRx = new Set();
  for (const s of st) {
    if (s.kind === 7) {
      const id = eTarget(s), r = rxEv(s), key = `${s.pubkey}|${id}|${r}`;
      if (!id || r === null || seenRx.has(key)) continue; // 同じ人の同じリアクションは1回だけ数える
      seenRx.add(key);
      if (r === '+') bump(id, 'likes'); else { const o = slot(id); o.rx[r] = (o.rx[r] || 0) + 1; }
    }
    else if (s.kind === 6) { const id = s.tags.find((t) => t[0] === 'e')?.[1]; if (id) bump(id, 'rt'); }
    else { const id = parentOf(s); if (id) bump(id, 'rep'); }
  }
  return evs.map((e) => ({ ...uJson(e.pubkey), id: e.id, body: e.content, ts: e.created_at, parent_id: parentOf(e),
    rep: c[e.id]?.rep || 0, rt: c[e.id]?.rt || 0, likes: c[e.id]?.likes || 0, emojis: emojiMap(e.tags), rx: c[e.id]?.rx || {}, myrx: [...(MYR.get(e.id)?.keys() || [])],
    liked: LIKES.has(e.id), reposted: RTS.has(e.id), bookmarked: !!BM && BM.tags.some((t) => t[0] === 'e' && t[1] === e.id), mine: e.pubkey === PK }));
}
async function loadMine() {
  const [c, b, l, r] = await Promise.all([qf({ kinds: [3], authors: [PK], limit: 1 }), qf({ kinds: [10003], authors: [PK], limit: 1 }), qf({ kinds: [7], authors: [PK], limit: 500 }), qf({ kinds: [6], authors: [PK], limit: 500 })]);
  const last = (a) => a.sort((x, y) => y.created_at - x.created_at)[0] || null;
  CONTACTS = last(c) || { content: '', tags: [] }; BM = last(b) || { content: '', tags: [] };
  LIKES = new Map(); MYR = new Map();
  for (const e of l.sort((x, y) => x.created_at - y.created_at)) {
    const id = eTarget(e), r = rxEv(e); if (!id || r === null) continue;
    if (r === '+') LIKES.set(id, e.id); else { if (!MYR.has(id)) MYR.set(id, new Map()); MYR.get(id).set(r, e.id); }
  }
  RTS = new Map(r.map((e) => [e.tags.find((t) => t[0] === 'e')?.[1], e.id]).filter((x) => x[0]));
  await profiles([PK]);
}
const following = () => CONTACTS.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
const isTop = (e) => !e.tags.some((t) => t[0] === 'e');
const userRows = async (pks) => { await profiles(pks); const f = new Set(following()); return pks.map((p) => ({ ...uJson(p), following: f.has(p), mine: p === PK })); };
const forget = (kind, id) => pub(5, '', [['e', id], ['k', String(kind)]]);

/* ---------- 閲覧者(ポスト詳細を開いた人) ----------
   Nostrに閲覧記録の仕組みは無いため、詳細を開いた人が kind 30078 (アプリ固有データ/置換可能イベント) を
   「n-view:<ポストID>」として公開し、それを集めて表示する。1人1ポストにつき1イベントのみ保持される。 */
const VIEW_KIND = 30078, viewTag = (id) => 'n-view:' + id;
const noView = () => { try { return localStorage.getItem('n_noview') === '1'; } catch (_) { return false; } };
async function loadViewers(e) {
  const evs = (await qf({ kinds: [VIEW_KIND], '#e': [e.id], limit: 200 })).filter((x) => x.tags.some((t) => t[0] === 'd' && t[1] === viewTag(e.id)));
  const m = new Map();
  for (const x of evs) if (!m.has(x.pubkey) || m.get(x.pubkey) < x.created_at) m.set(x.pubkey, x.created_at);
  // 自分の閲覧を記録(秘密鍵ログイン時のみ。NIP-07だと閲覧のたびに署名確認が出るため記録しない)
  if (SK && PK && e.pubkey !== PK && !noView() && !m.has(PK)) {
    m.set(PK, now());
    pub(VIEW_KIND, '', [['d', viewTag(e.id)], ['e', e.id]]).catch(() => {});
  }
  m.delete(e.pubkey); // 投稿者本人は除く
  const pks = [...m.keys()].sort((a, b) => m.get(b) - m.get(a));
  await profiles(pks);
  return pks.map(uJson);
}

function startSession(sk, nip07) {
  SK = sk; PK = sk ? NT.getPublicKey(sk) : '';
  if (!sk && nip07) localStorage.setItem('n_nip07', '1');
}
async function loginWith(input) {
  input = input.trim();
  if (input === '@nip07') { if (!window.nostr) throw new Error('NIP-07拡張機能(Alby, nos2x等)が見つかりません'); PK = await window.nostr.getPublicKey(); SK = null; localStorage.setItem('n_nip07', '1'); localStorage.removeItem('n_nsec'); }
  else {
    let sk; try { sk = /^[0-9a-f]{64}$/i.test(input) ? h2u(input) : NT.nip19.decode(input).data; } catch (_) {}
    if (!(sk instanceof Uint8Array)) throw new Error('nsec または 64桁の秘密鍵(hex)を入力してください');
    startSession(sk); localStorage.setItem('n_nsec', NT.nip19.nsecEncode(sk)); localStorage.removeItem('n_nip07');
  }
  await loadMine();
}
async function restore() {
  if (PK) return;
  const ns = localStorage.getItem('n_nsec');
  if (ns) { try { SK = NT.nip19.decode(ns).data; PK = NT.getPublicKey(SK); } catch (_) {} }
  else if (localStorage.getItem('n_nip07') && window.nostr) { try { PK = await window.nostr.getPublicKey(); } catch (_) {} }
  if (PK) await loadMine();
}
const meJson = () => { const u = uJson(PK); return { handle: u.handle, name: u.name, bio: u.bio, avatar: u.avatar, banner: u.banner, pubkey: PK }; };

// 通信を伴う操作(ポスト・いいね等)もバーに反映。me/ogpは通信しない/常時走るので除外
function api(a, o) { const r = apiCore(a, o); return (a === 'me' || a === 'ogp') ? r : Prog.track(r); }
async function apiCore(a, { method = 'GET', body = {}, q = {} } = {}) {
  const b = method === 'POST' ? body : q;
  const need = !['me', 'ogp'].includes(a);
  if (need && !PK) throw Object.assign(new Error('ログインが必要です'), {});
  switch (a) {
    case 'me': await restore(); return { csrf: '', user: PK ? meJson() : null, unread: 0 };
    case 'ogp': return { ogp: null }; // 静的サイトのためリンクプレビューは無効
    case 'timeline': {
      const f = { kinds: [1, 6], limit: 150 };
      if (b.scope === 'following') { const a2 = [PK, ...following()]; if (a2.length > 1) f.authors = a2; else return { posts: [] }; }
      const raw = await qf(f);
      // 元ポストID -> { ev: 元ポスト, ts: タイムライン上の並び順の時刻, by: リポストした人 }
      const items = new Map();
      const put = (ev, ts, by) => { const o = items.get(ev.id); if (!o || o.ts < ts) items.set(ev.id, { ev, ts, by }); };
      const okEv = (o) => { try { return !!o && o.kind === 1 && (NT.verifyEvent ? NT.verifyEvent(o) : true); } catch (_) { return false; } };
      const need = [];
      for (const e of raw) {
        if (e.kind === 1) { if (isTop(e)) put(e, e.created_at, ''); continue; }
        if (e.kind !== 6) continue;
        const id = e.tags.find((t) => t[0] === 'e')?.[1]; if (!id) continue;
        let o = null; try { o = JSON.parse(e.content); } catch (_) {}
        if (o && o.id === id && okEv(o)) put(o, e.created_at, e.pubkey); // 本文入りリポストはそのまま使う
        else need.push([id, e]);                                          // 本文が空なら元ポストを取得する
      }
      if (need.length) {
        const m = new Map((await qf({ ids: [...new Set(need.map((n) => n[0]))] })).map((x) => [x.id, x]));
        for (const [id, e] of need) { const o = m.get(id); if (o && o.kind === 1) put(o, e.created_at, e.pubkey); }
      }
      const [posts] = await Promise.all([decorate([...items.values()].map((x) => x.ev)), profiles([...items.values()].map((x) => x.by).filter(Boolean))]);
      return { posts: posts.map((p) => { const m = items.get(p.id); return { ...p, rtBy: m.by ? { ...uJson(m.by), mine: m.by === PK } : null, _s: m.ts }; }).sort((a, b) => b._s - a._s) };
    }
    case 'thread': {
      const [e] = await qf({ ids: [b.id] }); if (!e) throw new Error('ポストが見つかりません');
      const rs = (await qf({ kinds: [1], '#e': [b.id] })).filter((x) => parentOf(x) === b.id);
      const [[post], replies, viewers] = await Promise.all([decorate([e]), decorate(rs, 'asc'), loadViewers(e).catch(() => [])]);
      return { post, replies, viewers, canRecord: !!SK, noview: noView() };
    }
    case 'post': {
      const tags = []; const t = String(b.body);
      if (b.parent_id) { const pe = EVC.get(b.parent_id) || (await qf({ ids: [b.parent_id] }))[0]; tags.push(['e', b.parent_id, '', 'reply']); if (pe) tags.push(['p', pe.pubkey]); }
      for (const m of new Set(t.match(/#[\p{L}\p{N}_]+/gu) || [])) tags.push(['t', m.slice(1).toLowerCase()]);
      for (const m of t.matchAll(/nostr:(npub1[a-z0-9]{58})/g)) { const p = pkOf(m[1]); if (p) tags.push(['p', p]); }
      return { id: (await pub(1, t, tags)).id };
    }
    case 'delete_post': await forget(1, b.id); return { ok: true };
    case 'like': {
      if (LIKES.has(b.id)) { await forget(7, LIKES.get(b.id)); LIKES.delete(b.id); return { on: false }; }
      const pe = EVC.get(b.id) || (await qf({ ids: [b.id] }))[0];
      const ev = await pub(7, '+', [['e', b.id], ...(pe ? [['p', pe.pubkey]] : [])]); LIKES.set(b.id, ev.id); return { on: true };
    }
    case 'react': { // 絵文字リアクションのON/OFF(同じ絵文字をもう一度押すと取り消し)
      const r = rxOf(b.emoji); if (!r || r === '+') throw new Error('このリアクションは使えません');
      const m = MYR.get(b.id) || new Map();
      if (m.has(r)) { await forget(7, m.get(r)); m.delete(r); return { on: false }; }
      const pe = EVC.get(b.id) || (await qf({ ids: [b.id] }))[0];
      const custom = r[0] === ':'; if (custom && !CEMOJI.has(r)) throw new Error('このリアクションは使えません');
      const ev = await pub(7, r, [['e', b.id], ...(pe ? [['p', pe.pubkey]] : []), ['k', '1'], ...(custom ? [['emoji', r.slice(1, -1), CEMOJI.get(r)]] : [])]);
      m.set(r, ev.id); MYR.set(b.id, m); return { on: true };
    }
    case 'repost': {
      if (RTS.has(b.id)) { await forget(6, RTS.get(b.id)); RTS.delete(b.id); return { on: false }; }
      const pe = EVC.get(b.id) || (await qf({ ids: [b.id] }))[0]; if (!pe) throw new Error('ポストが見つかりません');
      const ev = await pub(6, JSON.stringify(pe), [['e', b.id, ''], ['p', pe.pubkey]]); RTS.set(b.id, ev.id); return { on: true };
    }
    case 'bookmark': {
      const has = BM.tags.some((t) => t[0] === 'e' && t[1] === b.id);
      const tags = has ? BM.tags.filter((t) => !(t[0] === 'e' && t[1] === b.id)) : [...BM.tags, ['e', b.id]];
      BM = await pub(10003, BM.content || '', tags); return { on: !has };
    }
    case 'bookmarks': { const ids = BM.tags.filter((t) => t[0] === 'e').map((t) => t[1]).slice(-50); return { posts: ids.length ? await decorate(await qf({ ids })) : [] }; }
    case 'user': {
      const pk = pkOf(b.handle); if (!pk) throw new Error('ユーザーが見つかりません');
      await profiles([pk]);
      const [ct, fl, nt] = await Promise.all([qf({ kinds: [3], authors: [pk], limit: 1 }), qf({ kinds: [3], '#p': [pk], limit: 500 }), qf({ kinds: [1], authors: [pk], limit: 100 })]);
      let evs = nt, tab = b.tab;
      if (tab === 'replies') evs = nt.filter((e) => !isTop(e));
      else if (tab === 'likes') { const ls = pk === PK ? [...LIKES.keys()].slice(-50) : []; evs = ls.length ? await qf({ ids: ls }) : []; }
      else evs = nt.filter(isTop);
      const u = uJson(pk), c0 = ct.sort((x, y) => y.created_at - x.created_at)[0];
      return { user: { ...u, joined: now(), followers: new Set(fl.map((e) => e.pubkey)).size, following: c0 ? c0.tags.filter((t) => t[0] === 'p').length : 0,
        posts: nt.filter(isTop).length, is_following: following().includes(pk), mine: pk === PK }, posts: await decorate(evs) };
    }
    case 'profile': {
      const [old] = (await qf({ kinds: [0], authors: [PK] })).sort((x, y) => y.created_at - x.created_at);
      let o = {}; try { o = JSON.parse(old?.content || '{}'); } catch (_) {}
      o.name = b.name; o.display_name = b.name; o.about = b.bio;
      for (const [k, f] of [['picture', 'avatar'], ['banner', 'banner']]) if (b[f] !== undefined) { if (b[f]) o[k] = b[f]; else delete o[k]; }
      const ev = await pub(0, JSON.stringify(o), []); PROF.set(PK, { ...o, _t: ev.created_at });
      return { name: b.name, bio: b.bio, ...meJson() };
    }
    case 'follows': {
      const pk = pkOf(b.handle); await profiles([pk]); let pks;
      if (b.kind === 'following') { const [c] = (await qf({ kinds: [3], authors: [pk], limit: 1 })); pks = c ? c.tags.filter((t) => t[0] === 'p').map((t) => t[1]) : []; }
      else pks = [...new Set((await qf({ kinds: [3], '#p': [pk], limit: 200 })).map((e) => e.pubkey))];
      return { user: { handle: npubOf(pk), name: uJson(pk).name }, users: await userRows(pks.slice(0, 100)) };
    }
    case 'follow': {
      const pk = pkOf(b.handle), has = following().includes(pk);
      const tags = has ? CONTACTS.tags.filter((t) => !(t[0] === 'p' && t[1] === pk)) : [...CONTACTS.tags, ['p', pk]];
      CONTACTS = await pub(3, CONTACTS.content || '', tags); return { on: !has };
    }
    case 'remove_image': return { ok: true };
    case 'search': {
      const s = String(b.q || '').trim(); if (!s) return { users: [], posts: [] };
      const pk = pkOf(s);
      if (pk) { await profiles([pk]); return { users: await userRows([pk]), posts: [] }; }
      if (s[0] === '#') return { users: [], posts: await decorate(await qf({ kinds: [1], '#t': [s.slice(1).toLowerCase()], limit: 60 })) };
      const [us, ps] = await Promise.all([qf({ kinds: [0], search: s, limit: 10 }, SEARCH_RELAYS, 6000), qf({ kinds: [1], search: s, limit: 30 }, SEARCH_RELAYS, 6000)]);
      us.forEach((e) => { try { PROF.set(e.pubkey, { ...JSON.parse(e.content), _t: e.created_at }); } catch (_) {} });
      return { users: await userRows([...new Set(us.map((e) => e.pubkey))]), posts: await decorate(ps.filter(isTop)) };
    }
    case 'trends': {
      const evs = await qf({ kinds: [1], limit: 300 }), c = {};
      for (const e of evs) for (const t of new Set(e.tags.filter((x) => x[0] === 't').map((x) => x[1].toLowerCase()))) c[t] = (c[t] || 0) + 1;
      return { trends: Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, n]) => ({ tag: '#' + t, count: n })), users: [] };
    }
    case 'notifs': {
      const evs = (await qf({ kinds: [1, 6, 7, 3], '#p': [PK], limit: 60 })).filter((e) => e.pubkey !== PK && (e.kind !== 7 || rxEv(e) !== null)).sort((x, y) => y.created_at - x.created_at).slice(0, 50);
      await profiles(evs.map((e) => e.pubkey));
      const items = evs.map((e) => { const u = uJson(e.pubkey), tgt = [...e.tags].reverse().find((t) => t[0] === 'e')?.[1];
        const type = e.kind === 7 ? (rxEv(e) === '+' ? 'like' : 'react') : e.kind === 6 ? 'repost' : e.kind === 3 ? 'follow' : tgt ? 'reply' : 'mention';
        return { type, post_id: e.kind === 1 ? e.id : tgt, is_read: 1, ts: e.created_at, handle: u.handle, name: u.name, avatar: u.avatar, emoji: e.kind === 7 ? rxEv(e) : '', excerpt: e.kind === 1 ? e.content : '' }; });
      return { items };
    }
    case 'convos': {
      const [a1, a2] = await Promise.all([qf({ kinds: [4], '#p': [PK], limit: 200 }), qf({ kinds: [4], authors: [PK], limit: 200 })]);
      const last = new Map();
      for (const e of [...a1, ...a2].sort((x, y) => x.created_at - y.created_at)) last.set(e.pubkey === PK ? e.tags.find((t) => t[0] === 'p')?.[1] : e.pubkey, e);
      const pks = [...last.keys()].filter(Boolean); await profiles(pks);
      const items = await Promise.all(pks.map(async (p) => { const e = last.get(p), u = uJson(p);
        return { handle: u.handle, name: u.name, avatar: u.avatar, body: await dec(p, e.content), ts: e.created_at, mine: e.pubkey === PK }; }));
      return { items: items.sort((x, y) => y.ts - x.ts) };
    }
    case 'dm': {
      const pk = pkOf(b.handle); if (!pk) throw new Error('ユーザーが見つかりません'); await profiles([pk]);
      const [a1, a2] = await Promise.all([qf({ kinds: [4], authors: [pk], '#p': [PK], limit: 100 }), qf({ kinds: [4], authors: [PK], '#p': [pk], limit: 100 })]);
      const msgs = await Promise.all([...a1, ...a2].sort((x, y) => x.created_at - y.created_at).map(async (e) => ({ body: await dec(pk, e.content), ts: e.created_at, mine: e.pubkey === PK })));
      const u = uJson(pk); return { user: { handle: u.handle, name: u.name, avatar: u.avatar }, msgs };
    }
    case 'dm_send': {
      const pk = pkOf(b.handle); if (!pk || pk === PK) throw new Error('送信できません');
      await pub(4, await enc(pk, b.body), [['p', pk]]); return { ok: true };
    }
    case 'logout': SK = null; PK = ''; localStorage.removeItem('n_nsec'); localStorage.removeItem('n_nip07'); return { ok: true };
  }
  throw new Error('未対応の操作です');
}

let CSRF = '', ME = null, seq = 0, searchTimer;
const S = { q: '', tabs: { home: 'all', search: 'all', notif: 'all', prof: 'posts' }, editing: false, parent: null, pending: '' };
const app = $('#app'), dlg = $('#dlg');

/* ---------- リアクション選択ポップアップ ---------- */
const rxPick = document.createElement('div'); rxPick.id = 'rx-pick'; rxPick.hidden = true; document.body.appendChild(rxPick);
const closePicker = () => { rxPick.hidden = true; rxPick.dataset.id = ''; };
function openPicker(btn, id) {
  const mine = MYR.get(id) || new Map();
  rxPick.innerHTML = RX_SET.map((x) => `<button class="${mine.has(x) ? 'on' : ''}" data-act="react" data-id="${id}" data-emoji="${x}" aria-label="${x}">${x}</button>`).join('');
  rxPick.hidden = false; rxPick.dataset.id = id;
  const r = btn.getBoundingClientRect(), w = rxPick.offsetWidth, h = rxPick.offsetHeight;
  rxPick.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  rxPick.style.top = (r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
}

const post = (a, body) => api(a, { method: 'POST', body });

/* ---------- 部品 ---------- */
const head = (title, sub, back) => `<div class="view-header">${back ? `<a class="back" href="${back}" aria-label="戻る"><i class="fa-solid fa-arrow-left"></i></a>` : ''}<div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
const tabs = (g, items) => `<div class="tabs">${items.map(([k, l]) => `<button data-tabgroup="${g}" data-tab="${k}" class="${S.tabs[g] === k ? 'active' : ''}">${l}</button>`).join('')}</div>`;
const empty = (icon, title, text) => `<div class="empty"><i class="${icon}"></i><h2>${title}</h2><p>${text}</p></div>`;
const list = (ps, e) => ps.length ? ps.map(postHtml).join('') : e;

const rxFace = (x) => CEMOJI.has(x) ? `<img class="cemoji" src="${esc(CEMOJI.get(x))}" alt="${esc(x)}" title="${esc(x)}" loading="lazy" referrerpolicy="no-referrer">` : esc(x);
const rxChips = (p) => { const ks = Object.keys(p.rx || {}).sort((a, b) => p.rx[b] - p.rx[a]); if (!ks.length) return '';
  return `<div class="rx-list">${ks.map((x) => `<button class="rx-chip ${(p.myrx || []).includes(x) ? 'on' : ''}" data-act="react" data-id="${p.id}" data-emoji="${esc(x)}" aria-label="${esc(x)}でリアクション"><span>${rxFace(x)}</span><span class="n">${p.rx[x]}</span></button>`).join('')}</div>`; };
function postHtml(p) {
  return `<article class="post" data-id="${p.id}"><a class="avatar" href="#/profile/${p.handle}">${av(p)}</a>
    <div class="content">
      ${p.rtBy ? `<div class="rt-by"><i class="fa-solid fa-retweet"></i>${p.rtBy.mine ? 'あなた' : `<a href="#/profile/${p.rtBy.handle}">${esc(p.rtBy.name)}</a>さん`}がリポスト</div>` : ''}
      <div class="header"><a class="name" href="#/profile/${p.handle}">${esc(p.name)}</a><span class="username">@${sh(p.handle)}</span><a class="time" href="#/post/${p.id}">· ${ago(p.ts)}</a>
        ${p.mine ? `<button class="btn-del" data-act="del" data-id="${p.id}" aria-label="削除"><i class="fa-regular fa-trash-can"></i></button>` : ''}</div>
      <p class="text">${rich(p.body, p.emojis)}</p>${ogpSlot(p.body)}${rxChips(p)}
      <div class="actions">
        <button class="reply" data-act="reply" data-id="${p.id}" aria-label="返信"><i class="fa-regular fa-comment"></i><span>${p.rep}</span></button>
        <button class="repost ${p.reposted ? 'on' : ''}" data-act="rt" data-id="${p.id}" aria-label="リポスト"><i class="fa-solid fa-retweet"></i><span>${p.rt}</span></button>
        <button class="like ${p.liked ? 'on' : ''}" data-act="like" data-id="${p.id}" aria-label="いいね"><i class="fa-${p.liked ? 'solid' : 'regular'} fa-heart"></i><span>${p.likes}</span></button>
        <button class="react ${(p.myrx || []).length ? 'on' : ''}" data-act="react-open" data-id="${p.id}" aria-label="リアクションを選ぶ"><i class="fa-regular fa-face-smile"></i></button>
        <button class="bookmark ${p.bookmarked ? 'on' : ''}" data-act="bm" data-id="${p.id}" aria-label="ブックマーク"><i class="fa-${p.bookmarked ? 'solid' : 'regular'} fa-bookmark"></i></button>
        <button class="share" data-act="share" data-id="${p.id}" aria-label="共有"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>
      </div></div></article>`;
}
const VIEWERS_MAX = 12;
const viewersHtml = (d) => {
  const vs = d.viewers || [], more = vs.length - VIEWERS_MAX;
  return `<div class="viewers"><span class="vlabel"><i class="fa-regular fa-eye"></i> 閲覧</span>`
    + (vs.length ? `<div class="vlist">${vs.slice(0, VIEWERS_MAX).map((u) => `<a class="vw" href="#/profile/${u.handle}" title="${esc(u.name)}" aria-label="${esc(u.name)}">${av(u)}</a>`).join('')}</div>${more > 0 ? `<span class="vmore">+${more}</span>` : ''}<span class="vcount">${vs.length}人</span>`
      : '<span class="vcount">まだ閲覧者はいません</span>')
    + (d.canRecord ? `<button class="vtoggle" data-act="noview">${d.noview ? '閲覧の記録を再開' : '閲覧を記録しない'}</button>` : '') + '</div>';
};
const followBtn = (u) => u.mine ? '' : `<button class="btn ${u.following || u.is_following ? '' : 'dark'}" data-act="follow" data-handle="${u.handle}">${u.following || u.is_following ? 'フォロー中' : 'フォロー'}</button>`;
const userRow = (u) => `<div class="row"><a class="avatar lg" href="#/profile/${u.handle}">${av(u)}</a>
  <div class="grow"><a href="#/profile/${u.handle}"><div class="nm">${esc(u.name)}</div><div class="hd">@${sh(u.handle)}</div></a><div class="bio">${rich(u.bio || '')}</div></div>${followBtn(u)}</div>`;

/* ---------- 認証画面 ---------- */
function authView(mode) {
  const err = '<div id="auth-err" class="note bad" hidden></div>';
  if (mode === 'login') return `<div class="auth"><h1>ℕ</h1><h2>ログイン</h2><form id="auth-form" data-mode="login"><input name="key" type="password" placeholder="nsec1… または秘密鍵(hex)" autocomplete="off" required>${err}<button class="btn blue">ログイン</button></form>
    <p><button class="btn" data-act="nip07">拡張機能(NIP-07)でログイン</button></p><p>鍵をお持ちでない方は <a href="#/signup">鍵を作成</a></p></div>`;
  return `<div class="auth"><h1>ℕ</h1><h2>新しい鍵を作成</h2><p>秘密鍵(nsec)はあなただけが持つパスワードです。失くすと復元できません。</p>
    <form id="auth-form" data-mode="signup"><input name="name" placeholder="表示名" maxlength="30" required>${err}<button class="btn blue">鍵を作成して始める</button></form><p><a href="#/login">ログインへ戻る</a></p></div>`;
}

/* ---------- 各ページ ---------- */
const searchTabs = () => S.q.trim() ? tabs('search', [['all', 'すべて'], ['users', 'ユーザー'], ['posts', 'ポスト']]) : '';
async function searchResults() {
  const q = S.q.trim(), t = S.tabs.search;
  if (!q) {
    const d = await api('trends');
    return '<h2 class="section-title">トレンド</h2>' + (d.trends.length ? d.trends.map((x) => `<a class="row" href="#/search/${encodeURIComponent(x.tag)}"><div class="grow"><div class="trend-topic">${esc(x.tag)}</div><div class="trend-meta">${x.count}件のポスト</div></div></a>`).join('') : '<div class="row trend-meta">まだトレンドはありません</div>')
      + (d.users.length ? '<h2 class="section-title">おすすめユーザー</h2>' + d.users.map(userRow).join('') : '');
  }
  const d = await api('search', { q: { q } });
  let out = '';
  if (t !== 'posts') out += d.users.slice(0, t === 'all' ? 3 : 99).map(userRow).join('');
  if (t !== 'users') out += d.posts.map(postHtml).join('');
  return out || empty('fa-solid fa-magnifying-glass', `「${esc(q)}」の結果はありません`, '別のキーワードで検索してみてください');
}
const loadSearch = async () => { const r = $('#sr'); if (r) { const h = await searchResults(); if ($('#sr')) { $('#sr').innerHTML = h; hydrateOgp(); } } };

const V = {
  login: (a) => ({ title: 'ログイン', html: authView('login', a) }),
  signup: (a) => ({ title: '新規登録', html: authView('signup', a) }),

  async home() {
    const d = await api('timeline', { q: { scope: S.tabs.home } });
    return { title: 'ホーム', html: head('ホーム') + tabs('home', [['all', 'おすすめ'], ['following', 'フォロー中']])
      + list(d.posts, empty('fa-regular fa-comments', 'ポストがありません', S.tabs.home === 'following' ? 'ユーザーをフォローするとここに表示されます' : '最初のポストをしてみましょう')) };
  },
  search() {
    return { title: '検索', html: `<div class="view-header"><label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input id="sv-input" type="search" placeholder="検索" value="${esc(S.q)}" aria-label="検索" autocomplete="off"></label></div><div id="st">${searchTabs()}</div><div id="sr"></div>`, after: loadSearch };
  },
  async post(id) {
    const d = await api('thread', { q: { id } });
    const p = d.post;
    const parentLink = p.parent_id ? `<a class="reply-to" href="#/post/${p.parent_id}"><i class="fa-solid fa-turn-up"></i> 返信元のポストを見る</a>` : '';
    const box = `<div class="reply-box"><span class="avatar">${av(ME)}</span><div class="grow">
      <textarea id="rep-text" maxlength="280" placeholder="@${sh(p.handle)} さんに返信" aria-label="返信"></textarea>
      <div class="foot"><span id="rep-count">280</span><button class="btn blue" data-act="rep-send" data-id="${p.id}">返信</button></div></div></div>`;
    return { title: 'ポスト', html: head('ポスト', '', p.parent_id ? `#/post/${p.parent_id}` : '#/home') + parentLink + postHtml(p) + viewersHtml(d) + box
      + (d.replies.length ? d.replies.map(postHtml).join('') : '<div class="row trend-meta">まだ返信はありません</div>') };
  },
  async followers(h) { return followList(h, 'followers'); },
  async following(h) { return followList(h, 'following'); },
  async notifications() {
    const d = await api('notifs');
    const icon = { react: 'fa-regular fa-face-smile', like: 'fa-solid fa-heart', repost: 'fa-solid fa-retweet', follow: 'fa-solid fa-user-plus', reply: 'fa-regular fa-comment', mention: 'fa-solid fa-at' };
    const verb = { like: 'があなたのポストにいいねしました', repost: 'があなたのポストをリポストしました', follow: 'さんにフォローされました', reply: 'さんが返信しました', mention: 'さんがあなたをメンションしました' };
    const items = d.items.filter((n) => S.tabs.notif === 'all' || n.type === 'reply' || n.type === 'mention').map((n) =>
      `<div class="row notif ${n.is_read ? '' : 'unread'}"><div class="ico ${n.type === 'mention' ? 'reply' : n.type}"><i class="${icon[n.type]}"></i></div>
       <div class="grow"><div class="who"><a class="avatar" href="#/profile/${n.handle}">${av(n)}</a></div>
       <div><a href="#/profile/${n.handle}"><b>${esc(n.name)}</b></a>${n.type === 'react' ? `があなたのポストに${rxFace(n.emoji)}でリアクションしました` : verb[n.type]}　<span class="when">${ago(n.ts)}</span></div>
       ${n.excerpt ? `<a class="excerpt" href="#/post/${n.post_id}">${esc(n.excerpt)}</a>` : ''}</div></div>`).join('');
    return { title: '通知', html: head('通知') + tabs('notif', [['all', 'すべて'], ['mentions', 'メンション']]) + (items || empty('fa-regular fa-bell', '通知はありません', 'いいねや返信がここに表示されます')), after: () => setBadge(0) };
  },
  async messages(h) {
    if (!h) {
      const d = await api('convos');
      const rows = d.items.map((c) => `<a class="row convo" href="#/messages/${c.handle}"><span class="avatar lg">${av(c)}</span><div class="grow"><div><span class="nm">${esc(c.name)}</span> <span class="hd">@${sh(c.handle)}</span></div><div class="last">${c.mine ? 'あなた: ' : ''}${esc(c.body)}</div></div><span class="t">${ago(c.ts)}</span></a>`).join('');
      return { title: 'メッセージ', html: head('メッセージ') + (rows || empty('fa-regular fa-envelope', 'メッセージはありません', 'プロフィールからメッセージを送れます')) };
    }
    const d = await api('dm', { q: { handle: h } });
    const msgs = d.msgs.map((m) => `<div class="bubble ${m.mine ? 'me' : 'them'}">${esc(m.body)}</div><div class="bubble-time ${m.mine ? 'me' : ''}">${ago(m.ts)}</div>`).join('');
    return { title: d.user.name + ' とのメッセージ', html: head(esc(d.user.name), '@' + sh(d.user.handle), '#/messages') + `<div class="chat">${msgs}</div>
      <div class="compose"><input id="dm-in" data-handle="${d.user.handle}" maxlength="1000" placeholder="メッセージを入力" autocomplete="off" aria-label="メッセージ"><button data-act="dm-send" aria-label="送信"><i class="fa-solid fa-paper-plane"></i></button></div>`,
      after() { window.scrollTo(0, document.body.scrollHeight); const i = $('#dm-in'); if (i) i.focus(); } };
  },
  async bookmarks() {
    const d = await api('bookmarks');
    return { title: 'ブックマーク', html: head('ブックマーク', '@' + sh(ME.handle)) + list(d.posts, empty('fa-regular fa-bookmark', 'ブックマークはまだありません', 'ポストを保存すると、ここに表示されます')) };
  },
  async profile(arg) {
    const h = arg || ME.handle;
    const d = await api('user', { q: { handle: h, tab: S.tabs.prof } });
    const u = d.user;
    const btn = u.mine ? '<button class="btn" data-act="edit">プロフィールを編集</button>' : `<span class="btns"><a class="btn" href="#/messages/${u.handle}" aria-label="メッセージ"><i class="fa-regular fa-envelope"></i></a> ${followBtn(u)}</span>`;
    const form = u.mine && S.editing ? `<div class="edit-form">${imgEdit(u)}<label>名前<input id="ed-name" maxlength="30" value="${esc(u.name)}"></label><label>自己紹介<textarea id="ed-bio" rows="3" maxlength="160">${esc(u.bio)}</textarea></label><div class="btns"><button class="btn" data-act="edit-cancel">キャンセル</button><button class="btn blue" data-act="edit-save">保存</button></div></div>` : '';
    return { title: u.name, html: head(esc(u.name), u.posts + '件のポスト', '#/home')
      + `<div class="banner" id="prof-banner" data-handle="${u.handle}"${u.banner ? ` style="background-image:url(${esc(imgUrl(u.banner))})"` : ''}></div><div class="prof"><div class="prof-top"><span class="avatar xl" id="prof-av" data-handle="${u.handle}">${av(u)}</span>${btn}</div>
        <h2>${esc(u.name)}</h2><div class="hd">@${sh(u.handle)}</div><div class="bio">${rich(u.bio)}</div>
        <div class="meta"><a class="meta-link" href="#/following/${u.handle}"><b>${u.following}</b> フォロー中</a><a class="meta-link" href="#/followers/${u.handle}"><b>${u.followers}</b> フォロワー</a></div></div>`
      + form + tabs('prof', [['posts', 'ポスト'], ['replies', '返信']].concat(u.mine ? [['likes', 'いいね']] : []))
      + list(d.posts, empty('fa-regular fa-face-smile', 'まだ何もありません', 'ここに表示できるポストはありません')) };
  },
};

/* ---------- フォロワー / フォロー中 一覧 ---------- */
async function followList(h, kind) {
  if (!h) h = ME.handle;
  const d = await api('follows', { q: { handle: h, kind } });
  const t = (k, l) => `<button data-go="#/${k}/${d.user.handle}" class="${kind === k ? 'active' : ''}">${l}</button>`;
  return { title: d.user.name + (kind === 'followers' ? ' のフォロワー' : ' のフォロー中'),
    html: head(esc(d.user.name), '@' + sh(d.user.handle), '#/profile/' + d.user.handle)
      + `<div class="tabs">${t('followers', 'フォロワー')}${t('following', 'フォロー中')}</div>`
      + (d.users.length ? d.users.map(userRow).join('')
        : empty('fa-regular fa-user', kind === 'followers' ? 'フォロワーはまだいません' : 'フォロー中のユーザーはいません', '')) };
}

/* ---------- ルーター ---------- */
function render(fresh) { return Prog.track(renderCore(fresh)); }
async function renderCore(fresh) {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  let name = parts[0] || 'home';
  const arg = decodeURIComponent(parts.slice(1).join('/'));
  const guest = ['login', 'signup'].includes(name);
  if (!ME && !guest) { location.hash = '#/login'; return; }
  if (ME && guest) { location.hash = '#/home'; return; }
  if (!V[name]) name = ME ? 'home' : 'login';
  document.body.classList.toggle('guest', !ME);
  document.body.dataset.route = name;
  if (fresh) { S.editing = false; window.scrollTo(0, 0); if (name === 'search') S.q = arg; }
  const my = ++seq;
  let v;
  try { v = await V[name](arg); }
  catch (e) { v = { title: 'エラー', html: head('エラー', '', '#/home') + empty('fa-regular fa-face-frown', '表示できません', esc(e.message)) }; }
  if (my !== seq) return;
  closePicker();
  app.innerHTML = v.html;
  document.title = v.title + ' / ℕ';
  document.querySelectorAll('.sidebar .nav-item[data-route]').forEach((a) =>
    a.classList.toggle('active', a.dataset.route === name && (name !== 'profile' || !arg || (ME && arg === ME.handle))));
  if (v.after) v.after();
  hydrateOgp();
}
const rerender = async () => { const y = window.scrollY; await render(false); window.scrollTo(0, y); };

function toast(msg) {
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}
/* ---------- アイコン・バナー ---------- */
function imgEdit(u) {
  return `<div class="img-edit"><label>アイコン画像のURL<input id="ed-avatar" type="url" placeholder="https://…" value="${esc(u.avatar || '')}"></label><label>バナー画像のURL<input id="ed-banner" type="url" placeholder="https://…" value="${esc(u.banner || '')}"></label><small>画像はNostrにアップロードされません。公開URL(https)を指定してください</small></div>`;
}
async function cropToBlob(file, w, h) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('この画像は読み込めません'); }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  const s = Math.max(w / bmp.width, h / bmp.height), dw = bmp.width * s, dh = bmp.height * s;
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error('画像の変換に失敗しました')), 'image/jpeg', 0.88));
}
async function uploadImg(kind, file) {
  const blob = await cropToBlob(file, ...(kind === 'avatar' ? [400, 400] : [1500, 500]));
  const fd = new FormData(); fd.append('kind', kind); fd.append('file', blob, kind + '.jpg');
  const r = await fetch('api.php?a=upload_image', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF }, body: fd });
  const d = await r.json().catch(() => ({ error: 'サーバーエラーが発生しました' }));
  if (!r.ok) throw new Error(d.error || 'エラー');
  return d;
}
// 画面を作り直さず(編集中の入力を保ったまま)表示中のアイコン・バナーを更新する
function applyImages() {
  if (!ME) return;
  fillMe();
  document.querySelectorAll(`a.avatar[href="#/profile/${ME.handle}"]`).forEach((a) => { a.innerHTML = av(ME); });
  const pa = $('#prof-av'), pb = $('#prof-banner');
  if (pa && pa.dataset.handle === ME.handle) pa.innerHTML = av(ME);
  if (pb && pb.dataset.handle === ME.handle) pb.style.backgroundImage = ME.banner ? `url(${imgUrl(ME.banner)})` : '';
  ['avatar', 'banner'].forEach((k) => { const d = $('#del-' + k); if (d) d.hidden = !ME[k]; });
}

function setBadge(n) { const b = $('#badge'); if (b) { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; } }
function fillMe() { $('#me-name').textContent = ME.name; $('#me-handle').textContent = '@' + sh(ME.handle); $('#me-av').innerHTML = av(ME); }
async function boot() {
  const d = await api('me'); CSRF = d.csrf; ME = d.user;
  if (ME) { fillMe(); setBadge(d.unread); loadTrends(); }
}
async function loadTrends() {
  try {
    const d = await api('trends');
    $('#trend-list').innerHTML = d.trends.length ? d.trends.map((x) => `<a href="#/search/${encodeURIComponent(x.tag)}" class="card-item"><div><div class="meta">トレンド</div><div class="topic">${esc(x.tag)}</div><div class="count">${x.count}件のポスト</div></div></a>`).join('')
      : '<div class="card-item"><div class="meta">ハッシュタグ付きのポストがまだありません</div></div>';
  } catch (_) {}
}
function openCompose(parent) {
  S.parent = parent || null;
  $('#dlg-title').textContent = parent ? '返信する' : 'ポストする';
  $('#dlg-text').value = ''; $('#dlg-count').textContent = 280;
  dlg.showModal(); $('#dlg-text').focus();
}
async function sendDm() {
  const i = $('#dm-in'); if (!i || !i.value.trim()) return;
  await post('dm_send', { handle: i.dataset.handle, body: i.value.trim() });
  await render(false);
}

/* ---------- イベント ---------- */
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#rx-pick, [data-act="react-open"]')) closePicker();
  const tb = e.target.closest('[data-tab]');
  if (tb) { S.tabs[tb.dataset.tabgroup] = tb.dataset.tab; rerender(); return; }
  if (e.target.closest('[data-go]')) { location.hash = e.target.closest('[data-go]').dataset.go; return; }
  // ポストの余白・本文など、リンクやボタン以外をクリックしたら詳細(返信欄)を開く
  const art = e.target.closest('article.post[data-id]');
  if (art && !e.target.closest('a, button, input, textarea, label') && !String(window.getSelection()).trim()) {
    const h = '#/post/' + art.dataset.id;
    if (location.hash !== h) location.hash = h;
    return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.tagName === 'A') e.preventDefault();
  const { act, id, handle } = b.dataset;
  try {
    switch (act) {
      case 'like': await post('like', { id }); rerender(); break;
      case 'react-open': if (!rxPick.hidden && rxPick.dataset.id === id) closePicker(); else openPicker(b, id); break;
      case 'react': closePicker(); await post('react', { id, emoji: b.dataset.emoji }); rerender(); break;
      case 'noview': try { localStorage.setItem('n_noview', noView() ? '0' : '1'); } catch (_) {} rerender(); break;
      case 'rt': await post('repost', { id }); rerender(); break;
      case 'bm': { const d = await post('bookmark', { id }); toast(d.on ? 'ブックマークに追加しました' : 'ブックマークを解除しました'); rerender(); break; }
      case 'follow': await post('follow', { handle }); rerender(); loadTrends(); break;
      case 'del': if (confirm('このポストを削除しますか？')) { await post('delete_post', { id }); rerender(); } break;
      case 'compose': openCompose(); break;
      case 'reply': openCompose(id); break;
      case 'rep-send': {
        const body = $('#rep-text').value.trim(); if (!body) return;
        await post('post', { body, parent_id: id });
        toast('返信しました'); rerender(); loadTrends(); break;
      }
      case 'dlg-close': dlg.close(); break;
      case 'dlg-send': {
        const body = $('#dlg-text').value.trim(); if (!body) return;
        await post('post', { body, parent_id: S.parent });
        dlg.close(); toast('ポストしました'); rerender(); loadTrends(); break;
      }
      case 'share':
        navigator.clipboard.writeText(location.origin + location.pathname + '#/post/' + id).then(() => toast('リンクをコピーしました'), () => toast('コピーできませんでした')); break;
      case 'dm-send': await sendDm(); break;
      case 'edit': S.editing = true; rerender(); break;
      case 'edit-cancel': S.editing = false; rerender(); break;
      case 'pick': { const i = $('#file-' + b.dataset.kind); if (i) i.click(); break; }
      case 'img-del': {
        const kind = b.dataset.kind;
        if (!confirm(kind === 'avatar' ? 'アイコンを削除しますか？' : 'バナーを削除しますか？')) break;
        await post('remove_image', { kind }); ME[kind] = null; applyImages(); toast('削除しました'); break;
      }
      case 'edit-save': {
        const d = await post('profile', { name: $('#ed-name').value, bio: $('#ed-bio').value, avatar: $('#ed-avatar').value.trim(), banner: $('#ed-banner').value.trim() });
        Object.assign(ME, { name: d.name, bio: d.bio, avatar: d.avatar, banner: d.banner }); fillMe(); S.editing = false; rerender(); toast('プロフィールを更新しました'); break;
      }
      case 'nip07': await loginWith('@nip07'); await boot(); location.hash = '#/home'; render(true); break;
      case 'logout': await post('logout'); ME = null; await boot(); location.hash = '#/login'; render(true); break;
    }
  } catch (x) { toast(x.message); }
});

document.addEventListener('change', async (e) => {
  const i = e.target.closest('input[type=file][data-kind]'); if (!i || !i.files[0]) return;
  const kind = i.dataset.kind, file = i.files[0]; i.value = '';
  try { toast('アップロード中…'); const d = await uploadImg(kind, file); ME[kind] = d[kind]; applyImages(); toast(kind === 'avatar' ? 'アイコンを更新しました' : 'バナーを更新しました'); }
  catch (x) { toast(x.message); }
});

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('#auth-form'); if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f)), err = $('#auth-err'), btn = f.querySelector('button');
  btn.disabled = true; err.hidden = true;
  try {
    if (f.dataset.mode === 'signup') {
      const sk = NT.generateSecretKey(), nsec = NT.nip19.nsecEncode(sk);
      await loginWith(nsec);
      const o = { name: d.name.trim(), display_name: d.name.trim() };
      const ev = await pub(0, JSON.stringify(o), []); PROF.set(PK, { ...o, _t: ev.created_at });
      await boot();
      app.innerHTML = `<div class="auth"><h1>ℕ</h1><h2>鍵を保存してください</h2><p>この秘密鍵は二度と表示されません。パスワードマネージャー等に保管してください。</p><p style="word-break:break-all;user-select:all"><code>${nsec}</code></p><button class="btn" onclick="navigator.clipboard.writeText('${nsec}')">コピー</button> <button class="btn blue" data-go="#/home">保存した、始める</button></div>`;
    } else { await loginWith(d.key); await boot(); location.hash = '#/home'; render(true); }
  } catch (x) { err.hidden = false; err.textContent = x.message; }
  btn.disabled = false;
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'dlg-text') $('#dlg-count').textContent = 280 - e.target.value.length;
  if (e.target.id === 'rep-text') $('#rep-count').textContent = 280 - e.target.value.length;
  if (e.target.id === 'sv-input') {
    S.q = e.target.value;
    history.replaceState(null, '', '#/search' + (S.q ? '/' + encodeURIComponent(S.q) : ''));
    $('#st').innerHTML = searchTabs();
    clearTimeout(searchTimer); searchTimer = setTimeout(loadSearch, 250);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'rep-text' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const b = $('[data-act="rep-send"]'); if (b) b.click(); return; }
  if (e.target.id === 'dm-in') { e.preventDefault(); sendDm().catch((x) => toast(x.message)); }
  if (e.target.id === 'side-search') {
    const v = e.target.value.trim();
    location.hash = '#/search' + (v ? '/' + encodeURIComponent(v) : ''); e.target.value = '';
  }
});

// OGP画像の読み込み失敗時は画像だけ取り除く
document.addEventListener('error', (e) => { const i = e.target; if (i.tagName === 'IMG' && i.classList.contains('cemoji')) { i.replaceWith(document.createTextNode(i.alt)); return; }
   if (i.tagName === 'IMG' && i.closest('.ogp')) i.remove(); }, true);

window.addEventListener('hashchange', () => { closePicker(); render(true); });
window.addEventListener('scroll', closePicker, { passive: true });
window.addEventListener('resize', closePicker);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
setInterval(() => { if (ME) api('me').then((d) => setBadge(d.unread)).catch(() => {}); }, 60000);
boot().catch(() => {}).then(() => render(true));
})();