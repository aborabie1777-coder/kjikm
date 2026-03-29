// ================================================================
//  PANDA BAMBOO FACTORY — SECURED SERVER v4.0
//  Security hardened — all CVEs from audit patched
//  Uses Firebase Admin SDK (no API key in URLs)
// ================================================================
//
//  Required env vars:
//    FIREBASE_DATABASE_URL   e.g. https://YOUR-DB.firebaseio.com
//    GOOGLE_APPLICATION_CREDENTIALS  path to serviceAccountKey.json
//      OR set FIREBASE_SERVICE_ACCOUNT_JSON with the JSON content
//    BOT_TOKEN               Telegram Bot Token (REQUIRED, no fallback)
//    ADMIN_IDS               comma-separated Telegram IDs
//    PORT                    (optional)
//
// ================================================================


import express        from 'express';
import { webcrypto }  from 'crypto';
import admin          from 'firebase-admin';

const crypto = webcrypto;
const app    = express();
const PORT   = process.env.PORT || 3000;

// ── Validate required env at startup ────────────────────────────
const REQUIRED_ENV = ['FIREBASE_DATABASE_URL', 'BOT_TOKEN'];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`FATAL: Missing required env variable: ${k}`);
    process.exit(1);
  }
}

// ── Firebase Admin SDK init (no API key in URLs) ─────────────────
let firebaseApp;
try {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(sa);
  } else {
    // uses GOOGLE_APPLICATION_CREDENTIALS env path
    credential = admin.credential.applicationDefault();
  }
  firebaseApp = admin.initializeApp({
    credential,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
  console.log('Firebase Admin SDK initialised');
} catch (e) {
  console.error('FATAL: Firebase init failed:', e.message);
  process.exit(1);
}

const db = admin.database();

// ── Game config ──────────────────────────────────────────────────
const G = {
  BAMBOO_PER_COIN : 20,
  TON_PER_COIN    : 0.00005,
  TON_TO_BAMBOO   : 50000,
  MIN_WITHDRAW    : 200,
  MIN_DEPOSIT_TON : 1,
  REF_BONUS_PCT   : 20,
  WELCOME_BAMBOO  : 0,
  WELCOME_COINS   : 195,
  WELCOME_RATE    : 4.167,
  MAX_TANK_LVL    : 27,
  ITEMS: {
    bamboo_stick : { price: 7500,    power: 50     },
    panda_paw    : { price: 25000,   power: 200    },
    leaf_fan     : { price: 125000,  power: 1200   },
    bamboo_energy: { price: 625000,  power: 7500   },
    panda_den    : { price: 3130000, power: 45000  },
    bamboo_forest: { price: 6500000, power: 110000 },
  },
  TANK: {
    1 :{ cap:5000,      upgCost:1000      },
    2 :{ cap:10000,     upgCost:3000      },
    3 :{ cap:20000,     upgCost:8000      },
    4 :{ cap:40000,     upgCost:20000     },
    5 :{ cap:80000,     upgCost:50000     },
    6 :{ cap:150000,    upgCost:120000    },
    7 :{ cap:250000,    upgCost:250000    },
    8 :{ cap:400000,    upgCost:450000    },
    9 :{ cap:600000,    upgCost:750000    },
    10:{ cap:900000,    upgCost:1200000   },
    11:{ cap:1300000,   upgCost:1800000   },
    12:{ cap:1800000,   upgCost:2700000   },
    13:{ cap:2500000,   upgCost:4000000   },
    14:{ cap:3300000,   upgCost:5500000   },
    15:{ cap:4300000,   upgCost:8000000   },
    16:{ cap:5500000,   upgCost:11000000  },
    17:{ cap:7000000,   upgCost:15000000  },
    18:{ cap:8800000,   upgCost:20000000  },
    19:{ cap:11000000,  upgCost:27000000  },
    20:{ cap:14000000,  upgCost:35000000  },
    21:{ cap:17500000,  upgCost:45000000  },
    22:{ cap:22000000,  upgCost:58000000  },
    23:{ cap:28000000,  upgCost:75000000  },
    24:{ cap:35000000,  upgCost:95000000  },
    25:{ cap:44000000,  upgCost:120000000 },
    26:{ cap:55000000,  upgCost:150000000 },
    27:{ cap:70000000,  upgCost:200000000 },
  },
  REF_TASKS: {
    r1  :{ n:1,   bam:50,     coins:2    },
    r5  :{ n:5,   bam:250,    coins:10   },
    r10 :{ n:10,  bam:600,    coins:25   },
    r20 :{ n:20,  bam:1500,   coins:60   },
    r50 :{ n:50,  bam:4000,   coins:150  },
    r70 :{ n:70,  bam:6000,   coins:220  },
    r100:{ n:100, bam:10000,  coins:400  },
    r200:{ n:200, bam:20000,  coins:800  },
    r500:{ n:500, bam:50000,  coins:2000 },
  },
  REF_ACTIVE_TASKS: {
    ra1  :{ n:1,   bam:10000,   coins:40    },
    ra5  :{ n:5,   bam:50000,   coins:200   },
    ra10 :{ n:10,  bam:120000,  coins:500   },
    ra20 :{ n:20,  bam:300000,  coins:1200  },
    ra50 :{ n:50,  bam:800000,  coins:3000  },
    ra70 :{ n:70,  bam:1200000, coins:4400  },
    ra100:{ n:100, bam:2000000, coins:8000  },
    ra200:{ n:200, bam:4000000, coins:16000 },
    ra500:{ n:500, bam:10000000,coins:40000 },
  },
  SOC_TASKS: {
    tg_payouts: 1000,
    tg_news   : 500,
    tg_ch     : 1000,
    tg_grp    : 500,
    tg_bot    : 300,
  },
  BOT_USERNAME: 'PandaBamboBot',
};

const DEFAULT_PARTNER_TASKS = [
  { id:'partner_payouts', name:'Join Payouts Channel',      type:'channel', link:'https://t.me/PandaBambooPayouts', bambooReward:100, targetUsers:null, status:'active', isDefault:true },
  { id:'partner_news',    name:'Join Mining News Channel',  type:'channel', link:'https://t.me/PandaMiningNews',    bambooReward:100, targetUsers:null, status:'active', isDefault:true },
];

// ================================================================
//  FIREBASE HELPERS — using Admin SDK (no API key exposure)
// ================================================================

async function dbGet(path) {
  const snap = await db.ref(sanitisePath(path)).once('value');
  return { success: true, data: snap.val() };
}

async function dbSet(path, data) {
  await db.ref(sanitisePath(path)).set(data);
  return { success: true };
}

async function dbUpdate(path, updates) {
  await db.ref(sanitisePath(path)).update(updates);
  return { success: true };
}

async function dbPush(path, data) {
  const ref = await db.ref(sanitisePath(path)).push(data);
  return { success: true, data: { id: ref.key } };
}

async function dbDelete(path) {
  await db.ref(sanitisePath(path)).remove();
  return { success: true };
}

/**
 * ATOMIC transaction — prevents race conditions (C4 fix).
 * Callback receives current value, returns new value.
 * Returns { committed, snapshot }.
 */
async function dbTransaction(path, updateFn) {
  const result = await db.ref(sanitisePath(path)).transaction(updateFn);
  return result;
}

// ── Path sanitiser — prevent path traversal ──────────────────────
function sanitisePath(path) {
  // Remove any attempt to break out of the path with ../ or null bytes
  const cleaned = String(path)
    .replace(/\0/g, '')
    .replace(/\.\.+/g, '')
    .replace(/\/\/+/g, '/');
  if (!/^[a-zA-Z0-9/_\-.:]+$/.test(cleaned)) {
    throw new Error(`Invalid Firebase path: ${cleaned.slice(0, 80)}`);
  }
  return cleaned;
}

// ================================================================
//  INPUT VALIDATORS
// ================================================================

function isValidUid(uid)     { return typeof uid === 'string' && /^\d{5,15}$/.test(uid); }
function isValidAddress(a)   { return typeof a === 'string' && /^[UE]Q[A-Za-z0-9_-]{46}$/.test(a); }
function isValidAmount(n)    { return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e9; }

// Strict text sanitiser — strips HTML tags and dangerous chars
function sanitiseText(str, maxLen = 256) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/<[^>]*>/g, '')           // strip all HTML tags
    .replace(/[<>"'`]/g, '')           // strip remaining dangerous chars
    .trim();
}

// Safe HTML-escape for use in innerHTML contexts
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Parse JSON body BEFORE sanitising individual fields (H3 fix)
function parseBody(raw) {
  if (!raw || raw.length > 10240) throw new Error('Payload too large');
  return JSON.parse(raw);   // parse first, sanitise fields later individually
}

// ================================================================
//  RATE LIMITER — with automatic cleanup (H5 fix)
// ================================================================

const _rl          = new Map();
const _userActionTs = new Map();
let _rlCleanupTs    = Date.now();

function rateOk(ip) {
  const now = Date.now();
  // Cleanup every 5 minutes to prevent memory leak
  if (now - _rlCleanupTs > 300_000) {
    for (const [k, v] of _rl) {
      if (now > v.r) _rl.delete(k);
    }
    for (const [k, v] of _userActionTs) {
      if (now - v > 60_000) _userActionTs.delete(k);
    }
    _rlCleanupTs = now;
  }
  const d = _rl.get(ip) || { c: 0, r: now + 60_000 };
  if (now > d.r) { d.c = 0; d.r = now + 60_000; }
  d.c++;
  _rl.set(ip, d);
  return d.c <= 60;
}

const ACTION_COOLDOWNS = {
  collect    : 2500,
  buyItem    : 2500,
  upgradeTank: 2500,
  exchange   : 2500,
  withdraw   : 5000,
  claimTask  : 2500,
  verifyTask : 2500,
  createTask : 5000,
};

function userActionOk(uid, action) {
  const cd = ACTION_COOLDOWNS[action];
  if (!cd) return true;
  const key  = `${uid}:${action}`;
  const now  = Date.now();
  const last = _userActionTs.get(key) || 0;
  if (now - last < cd) return false;
  _userActionTs.set(key, now);
  return true;
}

// ================================================================
//  LOGGING
// ================================================================

const BALANCE_CHANGE_EVENTS = new Set([
  'collect', 'buy_item', 'upgrade_tank', 'exchange',
  'withdraw_request', 'deposit_completed', 'claim_task',
  'verify_task', 'create_task', 'admin_set_balance',
  'admin_confirm_deposit', 'referral_commission',
]);

function log(uid, type, details = {}, meta = {}) {
  if (!BALANCE_CHANGE_EVENTS.has(type)) return;
  const entry = { ts: Date.now(), date: new Date().toISOString(), type, ...details };
  dbPush(`users/${uid}/log`, entry).catch(e => console.error('LOG ERROR:', e.message));
}

// ================================================================
//  TELEGRAM VALIDATION — no fallback when BOT_TOKEN missing (C2 fix)
// ================================================================

async function validateTg(initData, botToken) {
  try {
    // FIXED C2: No fallback — BOT_TOKEN is required (checked at startup)
    if (!botToken) return { valid: false, error: 'BOT_TOKEN not configured' };
    if (!initData)  return { valid: false, error: 'No init data' };

    const p          = new URLSearchParams(initData);
    const startParam = (p.get('start_param') || '').replace(/\D/g, '');
    const hash       = p.get('hash');
    if (!hash) return { valid: false, error: 'No hash' };

    p.delete('hash');
    const authDate = parseInt(p.get('auth_date') || '0', 10);
    // Reject tokens older than 15 minutes
    if (Date.now() / 1000 - authDate > 900) return { valid: false, error: 'Expired' };

    const enc = new TextEncoder();
    const sec = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const kb  = await crypto.subtle.sign('HMAC', sec, enc.encode(botToken));
    const key = await crypto.subtle.importKey('raw', kb, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

    const dc  = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(dc));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(hex, hash)) return { valid: false, error: 'Bad hash' };

    const u = p.get('user');
    if (!u) return { valid: false, error: 'No user' };
    return { valid: true, user: JSON.parse(decodeURIComponent(u)), startParam };
  } catch (e) {
    return { valid: false, error: 'Validation error' }; // don't leak internal error
  }
}

// Constant-time string comparison — prevents timing attacks
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ================================================================
//  HELPERS
// ================================================================

function syncTank(user) {
  const now = Date.now();
  const sec = (now - (user.lastSeen || now)) / 1000;
  if (sec <= 0 || !user.miningRate) { user.lastSeen = now; return; }
  const cfg = G.TANK[user.tankLevel || 1] || G.TANK[1];
  user.tankAccrued = Math.min(cfg.cap, (user.tankAccrued || 0) + (user.miningRate / 3600) * sec);
  user.lastSeen = now;
}

function recalcRate(m) {
  return Object.entries(m || {}).reduce((s, [id, c]) => s + (G.ITEMS[id]?.power || 0) * c, 0);
}

async function sendTgNotification(userId, message) {
  try {
    if (!process.env.BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: userId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) { console.error('sendTgNotification:', e.message); }
}

async function checkMembership(userId, channelLink) {
  try {
    if (!process.env.BOT_TOKEN) return true;
    let username = channelLink;
    if (channelLink.includes('t.me/')) username = channelLink.split('t.me/')[1].split('?')[0].split('/')[0];
    if (username.startsWith('@')) username = username.slice(1);
    const res = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: `@${username}`, user_id: parseInt(userId, 10) }),
    });
    const j = await res.json();
    if (!j.ok) { console.error('TG API:', j.description); return false; }
    return ['member', 'administrator', 'creator'].includes(j.result?.status);
  } catch (e) { console.error('checkMembership:', e.message); return false; }
}

function makeUser(uid, tg = {}, ref = null) {
  return {
    userId  : uid,
    firstName: sanitiseText(tg.first_name || '', 64),
    lastName : sanitiseText(tg.last_name  || '', 64),
    username : sanitiseText(tg.username   || '', 64),
    photoUrl : sanitiseUrl(tg.photo_url   || ''),
    bamboo   : G.WELCOME_BAMBOO,
    coins    : G.WELCOME_COINS,
    miningRate: G.WELCOME_RATE,
    totalEarned: 0, machines: {}, tankLevel: 1, tankAccrued: 0,
    lastSeen : Date.now(), createdAt: Date.now(),
    welcomeBonusGiven: true, hasDeposited: false, tonBalance: 0,
    referralCode: String(uid), referredBy: ref || null, completedTasks: [],
  };
}

// Only allow https:// photo URLs from known CDNs
function sanitiseUrl(url) {
  if (typeof url !== 'string') return '';
  const clean = url.slice(0, 512).trim();
  if (!/^https:\/\/(cdn\.|t\.me|telegra\.ph|api\.telegram\.org)/.test(clean)) return '';
  return clean;
}

function extractStartParam(initDataStr) {
  try {
    const p  = new URLSearchParams(initDataStr || '');
    const sp = p.get('start_param');
    if (sp) return sp.replace(/\D/g, '');
  } catch (_) {}
  return '';
}

async function seedPartnerTasks() {
  try {
    const snap    = await dbGet('tasks/partner');
    const existing = snap.data || {};
    for (const task of DEFAULT_PARTNER_TASKS) {
      if (!existing[task.id]) {
        const now = Date.now();
        await dbSet(`tasks/partner/${task.id}`, { ...task, completions: 0, completedBy: [], createdAt: now, updatedAt: now });
      }
    }
  } catch (e) { console.error('seedPartnerTasks:', e.message); }
}

// ================================================================
//  LEADERBOARD — sanitise names before storage (M1 fix)
// ================================================================

async function updateLeaderboardEntry(uid, user) {
  try {
    const COMP_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
    let meta    = (await dbGet('competition/meta')).data;
    const nowMs = Date.now();
    if (!meta || !meta.endDate || !meta.startDate) {
      meta = { startDate: meta?.startDate || nowMs, endDate: meta?.endDate || (nowMs + COMP_DURATION_MS) };
      await dbSet('competition/meta', meta);
    }
    if (nowMs > meta.endDate) {
      meta = { startDate: nowMs, endDate: nowMs + COMP_DURATION_MS };
      await dbSet('competition/meta', meta);
      await dbSet('competition/snapshots', null);
      await dbSet('competition/users', null);
      await dbSet('competition/leaderboard', null);
    }
    if (nowMs < meta.startDate) return;

    const rr      = await dbGet(`users/${uid}/referrals`);
    const refIds  = rr.data ? Object.keys(rr.data) : [];
    let activeNow = 0;
    for (const refId of refIds) {
      const hd = await dbGet(`users/${refId}/hasDeposited`);
      if (hd.data === true) activeNow++;
    }
    const miningNow = Math.round((user.miningRate || 0) * 24);
    const snapKey   = `competition/snapshots/${uid}`;
    let snap        = (await dbGet(snapKey)).data;
    if (!snap) {
      snap = { activeRefs: activeNow, miningPerDay: miningNow, ts: nowMs };
      await dbSet(snapKey, snap);
    }
    // FIXED M1: sanitise name before leaderboard storage
    const safeName = sanitiseText(`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Panda', 64);
    const safePhoto = sanitiseUrl(user.photoUrl || '');

    const entry = {
      userId     : uid,
      name       : safeName,
      photo      : safePhoto,
      activeScore: Math.max(0, activeNow - snap.activeRefs),
      miningScore: Math.max(0, miningNow - snap.miningPerDay),
      activeNow, miningNow, ts: nowMs,
    };
    await dbSet(`competition/users/${uid}`, entry);

    const allr     = await dbGet('competition/users');
    const all      = allr.data ? Object.values(allr.data) : [];
    const byActive = [...all].sort((a, b) => b.activeScore - a.activeScore).slice(0, 50)
      .map(u => ({ userId: u.userId, name: u.name, photo: u.photo, score: u.activeScore }));
    const byMining = [...all].sort((a, b) => b.miningScore - a.miningScore).slice(0, 50)
      .map(u => ({ userId: u.userId, name: u.name, photo: u.photo, score: u.miningScore }));
    await dbSet('competition/leaderboard', { activeRefs: byActive, miningSpeed: byMining, updatedAt: nowMs });
  } catch (e) { console.error('updateLeaderboardEntry:', e.message); }
}

// ================================================================
//  REFERRAL REGISTRATION
// ================================================================

async function registerReferral(uid, user, referrerId) {
  try {
    const rr   = await dbGet(`users/${referrerId}/referrals`);
    const refs = rr.data || {};
    if (!refs[uid]) {
      await dbSet(`users/${referrerId}/referrals/${uid}`, {
        userId   : uid,
        firstName: sanitiseText(user.firstName || '', 32),
        lastName : sanitiseText(user.lastName  || '', 32),
        username : sanitiseText(user.username  || '', 64),
        photoUrl : sanitiseUrl(user.photoUrl   || ''),
        joinedAt : Date.now(),
        earned   : 0,
      });
      const notifKey = `notifSent/ref_${uid}_${referrerId}`;
      const already  = await dbGet(notifKey);
      if (!already.data) {
        const myTs = Date.now();
        await dbSet(notifKey, { ts: myTs, by: uid });
        await new Promise(r => setTimeout(r, 150));
        const confirm = await dbGet(notifKey);
        if (confirm.data && confirm.data.ts === myTs) {
          const refName = sanitiseText(user.firstName || 'Someone', 32);
          sendTgNotification(referrerId,
            `🎉 <b>Congratulations!</b> <b>${escHtml(refName)}</b> just registered using your referral link!\n\n🐼 You will automatically earn <b>20% commission</b> on all their Market purchases.\n\n<i>Track your earnings in the Friends section</i>`
          ).catch(() => {});
        }
      }
    }
  } catch (e) { console.error('registerReferral:', e.message); }
}

// ================================================================
//  HANDLERS
// ================================================================

async function hGetState(uid, tg, data = {}, _meta = {}) {
  try {
    const rawRef = (
      data?._startParam ||
      extractStartParam(data?._initData || '') ||
      (data?.start_param || '').toString().replace(/\D/g, '')
    ).replace(/\D/g, '');
    const ref = rawRef && rawRef !== uid ? rawRef : null;

    const ur   = await dbGet(`users/${uid}`);
    let user   = ur.data;
    seedPartnerTasks().catch(e => console.error('seed:', e.message));

    if (!user) {
      user = makeUser(uid, tg, ref);
      if (user.referredBy) await registerReferral(uid, user, user.referredBy);
      await dbSet(`users/${uid}`, user);
    } else {
      syncTank(user);
      let needsSave = false;
      if (!user.welcomeBonusGiven) {
        user.coins       = (user.coins      || 0) + G.WELCOME_COINS;
        user.bamboo      = (user.bamboo     || 0) + G.WELCOME_BAMBOO;
        user.miningRate  = Math.max(user.miningRate || 0, G.WELCOME_RATE);
        user.welcomeBonusGiven = true;
        needsSave        = true;
      }
      // Update user profile from Telegram — sanitise all fields
      if (tg) {
        if (tg.first_name) user.firstName = sanitiseText(tg.first_name, 64);
        if (tg.last_name)  user.lastName  = sanitiseText(tg.last_name,  64);
        if (tg.username)   user.username  = sanitiseText(tg.username,   64);
        if (tg.photo_url)  user.photoUrl  = sanitiseUrl(tg.photo_url);
      }
      await dbUpdate(`users/${uid}`, {
        firstName: user.firstName, lastName: user.lastName,
        username : user.username,  photoUrl: user.photoUrl,
        tankAccrued: user.tankAccrued, lastSeen: user.lastSeen,
        ...(needsSave ? { coins: user.coins, bamboo: user.bamboo, miningRate: user.miningRate, welcomeBonusGiven: true } : {}),
      });
    }

    updateLeaderboardEntry(uid, user).catch(() => {});

    const rr       = await dbGet(`users/${uid}/referrals`);
    const refList  = Object.values(rr.data || {});
    const referrals = await Promise.all(refList.map(async r => {
      let deposited = r.hasDeposited || false;
      if (!deposited) {
        const ud = await dbGet(`users/${r.userId}/hasDeposited`);
        deposited = ud.data === true;
        if (deposited) await dbUpdate(`users/${uid}/referrals/${r.userId}`, { hasDeposited: true }).catch(() => {});
      }
      return {
        userId      : r.userId,
        name        : sanitiseText(`${r.firstName || ''} ${r.lastName || ''}`.trim() || 'Friend', 64),
        photo       : sanitiseUrl(r.photoUrl || ''),
        date        : r.joinedAt ? new Date(r.joinedAt).toLocaleDateString() : '',
        earned      : r.earned || 0,
        hasDeposited: deposited,
      };
    }));

    const er    = await dbGet(`users/${uid}/exchHistory`);
    const wr    = await dbGet(`users/${uid}/wdHistory`);
    const dr    = await dbGet(`users/${uid}/deposits`);
    const tpr   = await dbGet('tasks/partner');
    const tcr   = await dbGet('tasks/community');
    const lr    = await dbGet(`users/${uid}/log`);

    const exchHistory   = er.data ? Object.values(er.data).sort((a, b) => b.ts - a.ts).slice(0, 30) : [];
    const wdHistory     = wr.data ? Object.values(wr.data).sort((a, b) => b.ts - a.ts).slice(0, 30) : [];
    const pendingDeposit = (dr.data ? Object.values(dr.data) : []).find(d => d.status === 'pending') || null;
    const deposits      = (dr.data ? Object.values(dr.data) : []).map(d => ({ amount: d.amount || 0, status: d.status || 'pending', ts: d.timestamp || d.ts || 0 }));
    const tasks         = {
      partner  : tpr.data ? Object.values(tpr.data).filter(t => t.status === 'active') : [],
      community: tcr.data ? Object.values(tcr.data).filter(t => t.status === 'active') : [],
    };
    const balanceLog    = lr.data ? Object.values(lr.data).sort((a, b) => b.ts - a.ts).slice(0, 50) : [];

    return { success: true, data: {
      user: {
        bamboo: user.bamboo || 0, coins: user.coins || 0,
        miningRate: user.miningRate || 0, totalEarned: user.totalEarned || 0,
        machines: user.machines || {}, tankLevel: user.tankLevel || 1,
        tankAccrued: user.tankAccrued || 0, hasDeposited: user.hasDeposited || false,
        tonBalance: user.tonBalance || 0,
      },
      referrals, completedTasks: user.completedTasks || [],
      exchHistory, wdHistory, deposits, balanceLog, pendingDeposit, tasks,
    }};
  } catch (e) { console.error('getState', e); return { success: false, error: 'Internal error', errorCode: 'GET_STATE_ERROR' }; }
}

// ── Collect ──────────────────────────────────────────────────────
async function hCollect(uid, _data, _meta = {}) {
  try {
    const r    = await dbGet(`users/${uid}`);
    const user = r.data;
    if (!user) return { success: false, error: 'User not found' };
    syncTank(user);
    const actual = Math.floor(user.tankAccrued);
    if (actual < 1) return { success: false, error: 'Tank is empty' };
    const nb = (user.bamboo || 0) + actual;
    await dbUpdate(`users/${uid}`, { bamboo: nb, totalEarned: (user.totalEarned || 0) + actual, tankAccrued: user.tankAccrued - actual, lastSeen: user.lastSeen });
    log(uid, 'collect', { collected: actual, bamboo_before: user.bamboo || 0, bamboo_after: nb, tankLevel: user.tankLevel || 1 }, _meta);
    return { success: true, data: { collected: actual, bamboo: nb } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Buy item ─────────────────────────────────────────────────────
async function hBuyItem(uid, data, _meta = {}) {
  try {
    const itemId = sanitiseText(String(data.itemId || ''), 64);
    const item   = G.ITEMS[itemId];
    if (!item) return { success: false, error: 'Unknown item' };

    const q     = Math.max(1, Math.min(10, parseInt(data.qty) || 1));
    const total = item.price * q;

    // FIXED C4: atomic transaction for balance deduction
    let finalBamboo, finalMachines, finalRate;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return; // abort
      if ((user.bamboo || 0) < total) return; // abort — insufficient funds
      const machines    = user.machines || {};
      machines[itemId]  = (machines[itemId] || 0) + q;
      const newRate     = recalcRate(machines);
      finalBamboo   = (user.bamboo || 0) - total;
      finalMachines = machines;
      finalRate     = newRate;
      return { ...user, bamboo: finalBamboo, machines, miningRate: newRate };
    });

    if (!txResult.committed) return { success: false, error: 'Not enough Bamboo or transaction conflict' };

    log(uid, 'buy_item', { itemId, qty: q, totalCost: total, bamboo_after: finalBamboo, miningRate_after: finalRate }, _meta);

    // Referral commission
    const userSnap = txResult.snapshot.val();
    if (userSnap?.referredBy && userSnap.referredBy !== uid) {
      const comm = Math.floor(total * G.REF_BONUS_PCT / 100);
      const rr   = await dbGet(`users/${userSnap.referredBy}`);
      if (rr.data) {
        await dbUpdate(`users/${userSnap.referredBy}`, { bamboo: (rr.data.bamboo || 0) + comm });
        await dbPush(`users/${userSnap.referredBy}/referralEarnings`, { fromUserId: uid, amount: comm, timestamp: Date.now() });
        log(userSnap.referredBy, 'referral_commission', { fromUserId: uid, commission: comm });
        const buyerName = escHtml(sanitiseText(userSnap.firstName || 'Your friend', 32));
        sendTgNotification(userSnap.referredBy,
          `💰 <b>Commission earned!</b>\n\n<b>${buyerName}</b> made a purchase from the Market\nYou earned <b>${comm} Bamboo</b> (20% commission) 🎋`
        ).catch(() => {});
      }
    }
    return { success: true, data: { bamboo: finalBamboo, miningRate: finalRate, machines: finalMachines } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Upgrade tank ─────────────────────────────────────────────────
async function hUpgradeTank(uid, data, _meta = {}) {
  try {
    // FIXED C4: atomic transaction
    let finalBamboo, finalLevel;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      const cur  = user.tankLevel || 1;
      const next = cur + 1;
      if (next > G.MAX_TANK_LVL)        return; // abort
      if (parseInt(data.newLevel) !== next) return; // abort — level mismatch
      const cost = G.TANK[next].upgCost;
      if ((user.bamboo || 0) < cost)     return; // abort
      finalBamboo = (user.bamboo || 0) - cost;
      finalLevel  = next;
      return { ...user, bamboo: finalBamboo, tankLevel: next };
    });
    if (!txResult.committed) return { success: false, error: 'Not enough Bamboo, max level, or transaction conflict' };
    log(uid, 'upgrade_tank', { tankLevel_after: finalLevel, bamboo_after: finalBamboo }, _meta);
    return { success: true, data: { tankLevel: finalLevel, bamboo: finalBamboo } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Exchange ─────────────────────────────────────────────────────
async function hExchange(uid, data, _meta = {}) {
  try {
    if (data.coinsAmount !== undefined) return { success: false, error: 'Coins to Bamboo exchange is disabled' };
    if (data.bambooAmount === undefined) return { success: false, error: 'Specify bambooAmount' };

    const bam = Math.floor(parseInt(data.bambooAmount) || 0);
    if (bam < G.BAMBOO_PER_COIN) return { success: false, error: `Min ${G.BAMBOO_PER_COIN} Bamboo` };

    const coins = Math.floor(bam / G.BAMBOO_PER_COIN);

    // FIXED C4: atomic transaction — no separate lock needed
    let finalBamboo, finalCoins;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      if ((user.bamboo || 0) < bam) return; // abort
      finalBamboo = (user.bamboo || 0) - bam;
      finalCoins  = (user.coins  || 0) + coins;
      return { ...user, bamboo: finalBamboo, coins: finalCoins };
    });

    if (!txResult.committed) return { success: false, error: 'Not enough Bamboo or transaction conflict' };

    const entry = { bam, coins, dir: 'B→C', ts: Date.now() };
    await dbPush(`users/${uid}/exchHistory`, entry);
    log(uid, 'exchange', { bamboo_spent: bam, coins_received: coins, bamboo_after: finalBamboo, coins_after: finalCoins }, _meta);
    return { success: true, data: { bamboo: finalBamboo, coins: finalCoins, entry } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Withdraw ─────────────────────────────────────────────────────
async function hWithdraw(uid, data, _meta = {}) {
  try {
    const addr = (data.address || '').trim();
    const amt  = parseFloat(data.amount) || 0;

    // FIXED H4: strict TON address format validation
    if (!isValidAddress(addr)) return { success: false, error: 'Invalid TON address format. Must start with UQ or EQ.' };
    if (!Number.isFinite(amt) || amt < G.MIN_WITHDRAW) return { success: false, error: `Minimum withdrawal is ${G.MIN_WITHDRAW} Coins` };
    if (amt > 1_000_000) return { success: false, error: 'Amount too large' };

    const now = Date.now();

    // FIXED C4: atomic transaction for balance deduction
    let finalCoins, wdId;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      if ((user.coins || 0) < amt) return;
      if ((now - (user._lastWdTs || 0)) < 60_000) return; // 60s cooldown
      finalCoins = (user.coins || 0) - amt;
      return { ...user, coins: finalCoins, _lastWdTs: now };
    });

    if (!txResult.committed) {
      const user = (await dbGet(`users/${uid}`)).data;
      if (user && (user.coins || 0) < amt) return { success: false, error: 'Not enough Coins' };
      if (user && (now - (user._lastWdTs || 0)) < 60_000) return { success: false, error: 'Please wait 60 seconds before next withdrawal' };
      return { success: false, error: 'Transaction conflict, please retry' };
    }

    const user = txResult.snapshot.val();

    // Check device fingerprint for non-depositors
    if (!user.hasDeposited) {
      const fp = sanitiseText(data.deviceFingerprint || '', 120).replace(/[^a-zA-Z0-9_-]/g, '_');
      if (fp && fp.length > 8) {
        const fpRec = await dbGet(`deviceFingerprints/${fp}`);
        if (fpRec.data && fpRec.data.uid && fpRec.data.uid !== uid) {
          // Rollback coins
          await dbTransaction(`users/${uid}`, u => u ? { ...u, coins: (u.coins || 0) + amt, _lastWdTs: u._lastWdTs } : u);
          await dbSet(`flaggedWithdrawals/fp_${uid}_${now}`, { userId: uid, reason: 'duplicate_device', fingerprint: fp.slice(0, 40), existingUser: fpRec.data.uid, amount: amt, ts: now });
          return { success: false, error: 'MULTI_ACCOUNT', errorCode: 'MULTI_ACCOUNT' };
        }
        if (!fpRec.data) await dbSet(`deviceFingerprints/${fp}`, { uid, ts: now });
      }
    }

    // Check partner tasks completion
    const tpr          = await dbGet('tasks/partner');
    const partnerTasks = tpr.data ? Object.values(tpr.data).filter(t => t.status === 'active') : [];
    const missing      = partnerTasks.filter(t => !(user.completedTasks || []).includes(t.id));
    if (missing.length > 0) {
      await dbTransaction(`users/${uid}`, u => u ? { ...u, coins: (u.coins || 0) + amt, _lastWdTs: u._lastWdTs } : u);
      return { success: false, error: 'Complete all partner tasks first', errorCode: 'PARTNER_TASKS_REQUIRED', missing: missing.length };
    }

    wdId      = `wd_${uid}_${now}`;
    const ton = amt * G.TON_PER_COIN;
    const rec = { wdId, userId: uid, address: addr, amt, ton, status: 'pending', ts: now };
    await dbSet(`users/${uid}/wdHistory/${wdId}`, rec);
    await dbSet(`withdrawQueue/${wdId}`, rec);
    log(uid, 'withdraw_request', { wdId, amount_coins: amt, amount_ton: ton, address: addr, coins_after: finalCoins }, _meta);
    return { success: true, data: { wdId, coins: finalCoins, status: 'pending' } };
  } catch (e) { console.error('hWithdraw:', e); return { success: false, error: 'Internal error' }; }
}

// ── Deposit (records txHash for external server confirmation) ────
// External server monitors TON blockchain and calls adminConfirmDeposit.
// This endpoint only registers user intent — no balance is added here.
async function hDeposit(uid, data, _meta = {}) {
  try {
    const amt    = parseFloat(data.amount) || 0;
    const txHash = sanitiseText(data.txHash || '', 256).trim();
    if (!txHash || txHash.length < 10) return { success: false, error: 'Invalid txHash' };
    if (!Number.isFinite(amt) || amt < G.MIN_DEPOSIT_TON) return { success: false, error: 'Invalid deposit amount' };

    // Only allow hex/alphanumeric txHash (TON format)
    if (!/^[a-fA-F0-9]{64}$/.test(txHash)) return { success: false, error: 'Invalid txHash format' };

    const safeHash = txHash.toLowerCase(); // normalise
    const dup      = await dbGet(`txHashes/${safeHash}`);
    if (dup.data) return { success: false, error: 'Transaction already registered' };

    const depId = `dep_${uid}_${Date.now()}`;
    const rec   = { depId, userId: uid, txHash: safeHash, amount: amt, status: 'pending', ts: Date.now() };
    const u     = (await dbGet(`users/${uid}`)).data || {};

    await dbSet(`users/${uid}/deposits/${depId}`, rec);
    await dbSet(`pendingDeposits/${depId}`, rec);
    await dbSet(`txHashes/${safeHash}`, { depId, userId: uid, ts: Date.now() });
    log(uid, 'deposit_initiated', { depId, txHash: safeHash, amount_ton: amt, bamboo_before: u.bamboo || 0 }, _meta);
    return { success: true, data: { depositId: depId, message: 'Transaction registered. Your balance will be updated after blockchain confirmation.' } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Claim task ────────────────────────────────────────────────────
async function hClaimTask(uid, data, _meta = {}) {
  try {
    const tid = sanitiseText(String(data.taskId || ''), 64);
    if (!tid) return { success: false, error: 'Invalid taskId' };

    let bam = 0, coins = 0;

    if (G.REF_TASKS[tid]) {
      const t  = G.REF_TASKS[tid];
      const rr = await dbGet(`users/${uid}/referrals`);
      const rc = rr.data ? Object.keys(rr.data).length : 0;
      if (rc < t.n) return { success: false, error: `Need ${t.n} referrals (have ${rc})` };
      bam = t.bam; coins = t.coins;
    } else if (G.REF_ACTIVE_TASKS[tid]) {
      const t      = G.REF_ACTIVE_TASKS[tid];
      const rr     = await dbGet(`users/${uid}/referrals`);
      const refIds = rr.data ? Object.keys(rr.data) : [];
      let activeCount = 0;
      for (const refId of refIds) {
        const hdR = await dbGet(`users/${refId}/hasDeposited`);
        if (hdR.data === true) activeCount++;
      }
      if (activeCount < t.n) return { success: false, error: `Need ${t.n} active depositing referrals (have ${activeCount})` };
      bam = t.bam; coins = t.coins;
    } else if (G.SOC_TASKS[tid]) {
      bam = G.SOC_TASKS[tid];
    } else {
      return { success: false, error: 'Unknown task' };
    }

    // FIXED C4: atomic transaction to prevent double-claim
    let finalBamboo, finalCoins;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      if ((user.completedTasks || []).includes(tid)) return; // abort — already claimed
      finalBamboo = (user.bamboo || 0) + bam;
      finalCoins  = (user.coins  || 0) + coins;
      return { ...user, bamboo: finalBamboo, coins: finalCoins, completedTasks: [...(user.completedTasks || []), tid] };
    });

    if (!txResult.committed) return { success: false, error: 'Task already claimed or transaction conflict' };
    log(uid, 'claim_task', { taskId: tid, bamboo_reward: bam, coins_reward: coins, bamboo_after: finalBamboo, coins_after: finalCoins }, _meta);
    return { success: true, data: { bamboo: finalBamboo, coins: finalCoins, bam, coins } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Verify task ───────────────────────────────────────────────────
async function hVerifyTask(uid, data, _meta = {}) {
  try {
    const taskId  = sanitiseText(String(data.taskId || ''), 100);
    if (!taskId) return { success: false, error: 'Invalid taskId' };

    const cat     = ['community', 'partner'].includes(data.taskCategory) ? data.taskCategory : 'community';
    let tr        = await dbGet(`tasks/${cat}/${taskId}`);
    let task      = tr.data;
    let taskCat   = cat;
    if (!task) {
      const other = cat === 'community' ? 'partner' : 'community';
      tr    = await dbGet(`tasks/${other}/${taskId}`);
      task  = tr.data;
      taskCat = other;
    }
    if (!task)                   return { success: false, error: 'Task not found' };
    if (task.status !== 'active') return { success: false, error: 'Task is no longer active' };

    // Check user hasn't already completed it
    const ur = await dbGet(`users/${uid}`);
    const u  = ur.data || {};
    if ((u.completedTasks || []).includes(taskId))   return { success: false, error: 'Task already completed' };
    if ((task.completedBy || []).includes(uid))       return { success: false, error: 'Task already completed' };

    // Channel membership check
    if (task.type === 'channel') {
      const isMember = await checkMembership(uid, task.link);
      if (!isMember) return { success: false, error: 'You must join the channel first, then try again.' };
    }

    const bam = task.bambooReward || 500;
    const newCompletions = (task.completions || 0) + 1;
    const taskUpdates    = {
      completions : newCompletions,
      completedBy : [...(task.completedBy || []), uid],
      updatedAt   : Date.now(),
    };
    if (task.targetUsers != null && newCompletions >= (task.targetUsers || Infinity)) {
      taskUpdates.status = 'completed';
    }
    await dbUpdate(`tasks/${taskCat}/${taskId}`, taskUpdates);

    // FIXED C4: atomic user balance update
    let finalBamboo;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      if ((user.completedTasks || []).includes(taskId)) return; // double check
      finalBamboo = (user.bamboo || 0) + bam;
      return { ...user, bamboo: finalBamboo, completedTasks: [...(user.completedTasks || []), taskId] };
    });

    if (!txResult.committed) return { success: false, error: 'Task already completed or conflict' };
    log(uid, 'verify_task', { taskId, taskCategory: taskCat, bamboo_reward: bam, bamboo_after: finalBamboo }, _meta);
    return { success: true, data: { bambooAdded: bam, completions: newCompletions } };
  } catch (e) { console.error('verifyTask:', e); return { success: false, error: 'Internal error' }; }
}

// ── Create task ───────────────────────────────────────────────────
async function hCreateTask(uid, data, _meta = {}) {
  try {
    const type   = data.type;
    const link   = sanitiseText(data.link || '', 200);
    if (!['channel', 'bot'].includes(type)) return { success: false, error: 'Invalid type. Must be channel or bot' };

    const target = parseInt(data.targetUsers) || 0;
    if (target < 100)    return { success: false, error: 'Minimum target is 100 users' };
    if (target > 100_000) return { success: false, error: 'Maximum target is 100,000 users' };
    if (!link || !link.includes('t.me/')) return { success: false, error: 'Valid Telegram link required' };

    const COINS_PER_USER = 60;
    const cost = target * COINS_PER_USER;

    // FIXED C4: atomic transaction
    let finalCoins;
    const txResult = await dbTransaction(`users/${uid}`, user => {
      if (!user) return;
      if ((user.coins || 0) < cost) return;
      finalCoins = (user.coins || 0) - cost;
      return { ...user, coins: finalCoins };
    });

    if (!txResult.committed) return { success: false, error: `Insufficient Coins. Need ${cost} Coins` };

    const username = sanitiseText(link.split('t.me/')[1]?.split('?')[0]?.split('/')[0] || link, 64);
    const now      = Date.now();
    const taskId   = `task_${now}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
    const taskData = {
      id: taskId, creatorId: uid, type,
      link     : link,
      name     : `@${username}`,
      targetUsers: target, bambooReward: 500,
      completions: 0, completedBy: [], status: 'active',
      createdAt: now, expiresAt: now + (30 * 24 * 60 * 60 * 1000), updatedAt: now,
    };
    await dbSet(`tasks/community/${taskId}`, taskData);
    await dbPush(`users/${uid}/transactions`, { type: 'create_task', taskId, taskType: type, targetUsers: target, coinsCost: cost, timestamp: now });
    log(uid, 'create_task', { taskId, taskType: type, targetUsers: target, coins_spent: cost, coins_after: finalCoins }, _meta);
    return { success: true, data: { taskId, type, targetUsers: target, totalCost: cost, bambooReward: 500 } };
  } catch (e) { console.error('createTask:', e); return { success: false, error: 'Internal error' }; }
}

// ── Leaderboard ───────────────────────────────────────────────────
async function hGetLeaderboard(uid, _meta = {}) {
  try {
    const COMP_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
    let meta    = (await dbGet('competition/meta')).data;
    const nowMs = Date.now();
    if (!meta || !meta.endDate || !meta.startDate) {
      meta = { startDate: meta?.startDate || nowMs, endDate: meta?.endDate || (nowMs + COMP_DURATION_MS) };
      await dbSet('competition/meta', meta);
    }
    if (nowMs > meta.endDate) {
      meta = { startDate: nowMs, endDate: nowMs + COMP_DURATION_MS };
      await dbSet('competition/meta', meta);
    }
    const lbr  = await dbGet('competition/leaderboard');
    const lb   = lbr.data || { activeRefs: [], miningSpeed: [] };
    const snap = (await dbGet(`competition/snapshots/${uid}`)).data || null;
    return { success: true, data: { endDate: meta.endDate, startDate: meta.startDate, activeRefs: lb.activeRefs || [], miningSpeed: lb.miningSpeed || [], mySnapshot: snap } };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Season allocation — RECALCULATED SERVER-SIDE (M2 fix) ────────
async function hSaveSeasonAlloc(uid, _clientData = {}) {
  try {
    // FIXED M2: ignore all client-provided values, recalculate on server
    const ur = await dbGet(`users/${uid}`);
    const u  = ur.data;
    if (!u) return { success: false, error: 'User not found' };

    const coins      = u.coins || 0;
    const coinsAlloc = Math.floor(coins * 0.20);

    const rr         = await dbGet(`users/${uid}/referrals`);
    const activeRefs = Object.values(rr.data || {}).filter(r => r.hasDeposited).length;
    const refsAlloc  = activeRefs * 3000;

    // Get competition rank from leaderboard
    const lbr  = await dbGet('competition/leaderboard');
    const lb   = lbr.data || {};
    const SNS_COMP_PRIZES = [50, 40, 30, 20, 10, 9, 8, 7, 6, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1];
    let myRank = 0;
    for (const tab of ['activeRefs', 'miningSpeed']) {
      const board = lb[tab] || [];
      const idx   = board.findIndex(e => String(e.userId) === String(uid));
      if (idx >= 0 && idx < 20) {
        const rank = idx + 1;
        if (!myRank || rank < myRank) myRank = rank;
      }
    }
    const compTon  = (myRank > 0 && myRank <= SNS_COMP_PRIZES.length) ? SNS_COMP_PRIZES[myRank - 1] : 0;
    const total    = coinsAlloc + refsAlloc;
    const rec      = { uid, coinsAlloc, refsAlloc, compAlloc: 0, compRank: myRank, compTon, total, totalTon: String(compTon), updatedAt: Date.now() };
    await dbSet(`season2/alloc/${uid}`, rec);
    return { success: true, data: rec };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

async function hGetSeasonAlloc(uid) {
  try {
    const r = await dbGet(`season2/alloc/${uid}`);
    return { success: true, data: r.data || null };
  } catch (e) { return { success: false, error: 'Internal error' }; }
}

// ── Admin handlers ────────────────────────────────────────────────
async function hAdmin(action, data) {
  switch (action) {
    case 'adminGetUser': {
      if (!isValidUid(String(data.userId || ''))) return { success: false, error: 'Invalid userId' };
      const r = await dbGet(`users/${data.userId}`);
      return { success: true, data: r.data || null };
    }
    case 'adminSetBalance': {
      if (!isValidUid(String(data.userId || ''))) return { success: false, error: 'Invalid userId' };
      const r = await dbGet(`users/${data.userId}`);
      if (!r.data) return { success: false, error: 'User not found' };
      const u = {};
      if (data.bamboo     !== undefined) u.bamboo     = Math.max(0, parseFloat(data.bamboo)     || 0);
      if (data.coins      !== undefined) u.coins      = Math.max(0, parseFloat(data.coins)      || 0);
      if (data.tonBalance !== undefined) u.tonBalance = Math.max(0, parseFloat(data.tonBalance) || 0);
      await dbUpdate(`users/${data.userId}`, u);
      log(data.userId, 'admin_set_balance', { ...u, by: 'admin' });
      return { success: true };
    }
    case 'adminConfirmDeposit': {
      if (!isValidUid(String(data.userId || ''))) return { success: false, error: 'Invalid userId' };
      const dep = await dbGet(`users/${data.userId}/deposits/${data.depositId}`);
      if (!dep.data) return { success: false, error: 'Deposit not found' };
      if (dep.data.status === 'completed') return { success: false, error: 'Already confirmed' };

      const ton    = parseFloat(data.amount || dep.data.amount);
      const bamboo = Math.floor(ton * G.TON_TO_BAMBOO);

      // FIXED C4: atomic transaction for deposit confirmation
      await dbTransaction(`users/${data.userId}`, user => {
        if (!user) return;
        return { ...user, bamboo: (user.bamboo || 0) + bamboo, tonBalance: (user.tonBalance || 0) + ton, hasDeposited: true };
      });
      await dbUpdate(`users/${data.userId}/deposits/${data.depositId}`, { status: 'completed', completedAt: Date.now() });
      const u = (await dbGet(`users/${data.userId}`)).data;
      if (u?.referredBy) await dbUpdate(`users/${u.referredBy}/referrals/${data.userId}`, { hasDeposited: true }).catch(() => {});
      await dbDelete(`pendingDeposits/${data.depositId}`);
      log(data.userId, 'admin_confirm_deposit', { depositId: data.depositId, amount_ton: ton, bamboo_added: bamboo, by: 'admin' });
      return { success: true, data: { bambooAdded: bamboo } };
    }
    case 'adminApproveWithdraw': {
      await dbUpdate(`users/${data.userId}/wdHistory/${data.wdId}`, { status: 'approved', approvedAt: Date.now() });
      await dbDelete(`withdrawQueue/${data.wdId}`);
      return { success: true };
    }
    case 'adminRejectWithdraw': {
      const wd = await dbGet(`users/${data.userId}/wdHistory/${data.wdId}`);
      if (!wd.data) return { success: false, error: 'Withdrawal not found' };
      await dbUpdate(`users/${data.userId}/wdHistory/${data.wdId}`, { status: 'rejected', rejectedAt: Date.now() });
      if (data.refund) {
        await dbTransaction(`users/${data.userId}`, user => {
          if (!user) return;
          return { ...user, coins: (user.coins || 0) + (wd.data.amt || 0) };
        });
      }
      await dbDelete(`withdrawQueue/${data.wdId}`);
      return { success: true };
    }
    case 'adminGetQueue': {
      const w = await dbGet('withdrawQueue');
      const d = await dbGet('pendingDeposits');
      return { success: true, data: { withdrawals: w.data ? Object.values(w.data) : [], deposits: d.data ? Object.values(d.data) : [] } };
    }
    default: return { success: false, error: 'Unknown admin action' };
  }
}

// ================================================================
//  MIDDLEWARE
// ================================================================

const ALLOWED_ORIGINS = [
  'https://pandabambo.vercel.app',
  'https://web.telegram.org',
  'https://telegram.org',
];

app.use((req, res, next) => {
  // FIXED H6: strict CORS — no wildcard
  const origin = req.headers['origin'];
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Action');
  res.setHeader('Access-Control-Max-Age',       '86400');
  res.setHeader('X-Content-Type-Options',   'nosniff');
  res.setHeader('X-Frame-Options',          'DENY');
  res.setHeader('X-XSS-Protection',         '1; mode=block');
  res.setHeader('Referrer-Policy',          'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',       'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',  "default-src 'none'; frame-ancestors 'none'");
  res.removeHeader('X-Powered-By');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (req.path === '/api' && req.method !== 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  next();
});

app.use(express.text({ limit: '10kb', type: '*/*' }));

// ================================================================
//  ROUTES
// ================================================================

app.get('/health', (_req, res) => {
  // FIXED C5: no sensitive info in health endpoint
  res.json({ success: true, data: { status: 'ok', ts: Date.now() } });
});

app.get('/tonconnect-manifest.json', (_req, res) => {
  res.json({
    url        : 'https://pandabambo.vercel.app',
    name       : 'PandaBambooBot',
    iconUrl    : 'https://i.supaimg.com/ec27537b-aa6a-42cf-8ba1-d6850eeea36d/87e9d1bd-c053-466a-a29e-40483a009e8f.png',
    description: 'Panda Bamboo Factory',
  });
});

app.post('/api', async (req, res) => {
  // FIXED H1: get real IP — don't trust x-forwarded-for alone
  // If behind a trusted proxy (e.g. Railway), use socket address; otherwise read forwarded
  const ip = req.socket.remoteAddress || 'unknown';
  if (!rateOk(ip)) return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });

  // Parse body FIRST, then sanitise fields individually (H3 fix)
  let body;
  try {
    body = parseBody(req.body);
  } catch (_) {
    return res.status(400).json({ success: false, error: 'Invalid request body' });
  }

  const authHeader = req.headers['authorization'] || '';
  const action     = sanitiseText(req.headers['x-action'] || body.action || '', 64);
  const data       = (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) ? body.data : {};
  if (!action) return res.status(400).json({ success: false, error: 'Missing action' });

  // Admin actions
  const ADMIN_ACTIONS = new Set(['adminGetUser', 'adminSetBalance', 'adminConfirmDeposit', 'adminApproveWithdraw', 'adminRejectWithdraw', 'adminGetQueue']);
  if (ADMIN_ACTIONS.has(action)) {
    const v = await validateTg(authHeader.replace('Telegram ', ''), process.env.BOT_TOKEN);
    if (!v.valid) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!adminIds.includes(String(v.user?.id))) return res.status(403).json({ success: false, error: 'Forbidden' });
    return res.json(await hAdmin(action, data));
  }

  // Ping (no auth)
  if (action === 'ping') return res.json({ success: true, data: { pong: true, ts: Date.now() } });

  // Telegram auth required for all other actions
  if (!authHeader.startsWith('Telegram ')) return res.status(401).json({ success: false, error: 'Authentication required' });

  const v = await validateTg(authHeader.replace('Telegram ', ''), process.env.BOT_TOKEN);
  if (!v.valid) {
    // FIXED C5: no debug info leaked to client
    return res.status(401).json({ success: false, error: 'Authentication failed', errorCode: 'INVALID_AUTH' });
  }

  const uid   = String(v.user.id);
  if (!isValidUid(uid)) return res.status(400).json({ success: false, error: 'Invalid user id' });

  const _meta = { ip, ua: sanitiseText(req.headers['user-agent'] || '', 200) };
  console.log(`[${new Date().toISOString()}] uid:${uid} action:${action} ip:${ip}`);

  if (!userActionOk(uid, action)) return res.status(429).json({ success: false, error: 'Too fast. Please wait a moment.' });

  let result;
  switch (action) {
    case 'getState'       : result = await hGetState      (uid, v.user, { ...data, _startParam: v.startParam || '' }, _meta); break;
    case 'collect'        : result = await hCollect       (uid, data, _meta); break;
    case 'buyItem'        : result = await hBuyItem       (uid, data, _meta); break;
    case 'upgradeTank'    : result = await hUpgradeTank   (uid, data, _meta); break;
    case 'exchange'       : result = await hExchange      (uid, data, _meta); break;
    case 'withdraw'       : result = await hWithdraw      (uid, data, _meta); break;
    case 'deposit'        : result = await hDeposit       (uid, data, _meta); break;
    case 'claimTask'      : result = await hClaimTask     (uid, data, _meta); break;
    case 'verifyTask'     : result = await hVerifyTask    (uid, data, _meta); break;
    case 'createTask'     : result = await hCreateTask    (uid, data, _meta); break;
    case 'getLeaderboard' : result = await hGetLeaderboard(uid, _meta); break;
    case 'saveSeasonAlloc': result = await hSaveSeasonAlloc(uid, data); break;
    case 'getSeasonAlloc' : result = await hGetSeasonAlloc(uid); break;
    default               : return res.status(400).json({ success: false, error: 'Unknown action' });
  }

  const status = result?._status || 200;
  if (result?._status) delete result._status;
  res.status(status).json(result);
});

// ================================================================
//  START
// ================================================================

app.listen(PORT, () => {
  console.log(`🐼 Panda Bamboo Factory SECURED server on port ${PORT}`);
  console.log(`   Firebase Admin SDK: ✅`);
  console.log(`   Bot Token: ${process.env.BOT_TOKEN ? '✅ configured' : '❌ MISSING — server will exit'}`);
});
