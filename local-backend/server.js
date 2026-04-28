'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const dotenv  = require('dotenv');
const jwt     = require('jsonwebtoken');
const db      = require('./db');

dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = parseInt(process.env.PORT || '3000');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.resolve(__dirname, '..')));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json(fail('Payload troppo grande. Riduci dimensione screenshot e riprova.'));
  }
  return next(err);
});

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const ok   = data => ({ ok: true,  data });
const fail = msg  => ({ ok: false, error: msg });

// ---- JWT --------------------------------------------------------

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev_secret_change_me';

function signToken(user) {
  return jwt.sign(
    {
      userId:      user.id,
      gamertag:    user.gamertag,
      avatar:      user.avatar_url || '',
      role:        user.role        || 'user',
      contributor: user.contributor  ? 1 : 0,
    },
    JWT_SECRET(),
    { expiresIn: '30d' }
  );
}

function parseToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try { return jwt.verify(auth.slice(7), JWT_SECRET()); }
  catch { return null; }
}

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ---- AUTH MIDDLEWARE --------------------------------------------

function requireAuth(req, res, next) {
  const user = parseToken(req);
  if (!user) return res.status(401).json(fail('Non autenticato'));
  req.user = user;
  next();
}

// Contributor = user with contributor flag OR mod OR admin
function requireContributor(req, res, next) {
  const u = req.user;
  if (!u) return res.status(401).json(fail('Non autenticato'));
  if (u.contributor || u.role === 'mod' || u.role === 'admin') return next();
  return res.status(403).json(fail('Devi essere un contributore per questa azione. Attiva il flag "Contributore" nel tuo profilo.'));
}

function requireModOrAdmin(req, res, next) {
  const user = parseToken(req);
  if (user && (user.role === 'admin' || user.role === 'mod')) { req.user = user; return next(); }
  return res.status(403).json(fail('Accesso riservato a moderatori e amministratori'));
}

// Accept admin JWT *or* X-Admin-Token header
function requireAdmin(req, res, next) {
  const headerToken = req.headers['x-admin-token'];
  if (process.env.ADMIN_TOKEN && headerToken === process.env.ADMIN_TOKEN) return next();

  const user = parseToken(req);
  if (user && user.role === 'admin') { req.user = user; return next(); }

  return res.status(403).json(fail('Accesso riservato agli amministratori'));
}

// ---- BUILDS -----------------------------------------------------

app.get('/api/builds', async (req, res) => {
  try {
    const data = await db.listBuilds({
      mode:   req.query.mode   || 'all',
      sort:   req.query.sort   || 'votes',
      search: req.query.search || '',
      page:   parseInt(req.query.page)  || 1,
      limit:  Math.min(parseInt(req.query.limit) || 12, 50)
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listBuilds]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/builds/:id', async (req, res) => {
  try {
    const build = await db.getBuild(req.params.id);
    if (!build) return res.status(404).json(fail('Build non trovata'));
    res.json(ok(build));
  } catch (err) {
    console.error('[getBuild]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/builds', async (req, res) => {
  try {
    const user  = parseToken(req);
    const owner_id = user ? user.userId : '';
    const data = await db.createBuild({ ...req.body, owner_id });
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createBuild]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.patch('/api/builds/:id', requireAuth, async (req, res) => {
  try {
    const build = await db.getBuild(req.params.id);
    if (!build) return res.status(404).json(fail('Build non trovata'));
    const isAdmin = req.user.role === 'admin';
    const isOwner = build.owner_id && build.owner_id === req.user.userId;
    if (!isAdmin && !isOwner) return res.status(403).json(fail('Non autorizzato a modificare questa build'));
    const data = isAdmin ? req.body : { ...req.body, author: build.author };
    res.json(ok(await db.adminUpdateBuild(req.params.id, data)));
  } catch (err) {
    console.error('[updateBuild]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.post('/api/builds/:id/vote', async (req, res) => {
  try {
    const data = await db.voteBuild(req.params.id, req.body.type, req.body.voterKey);
    res.json(ok(data));
  } catch (err) {
    console.error('[voteBuild]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.get('/api/stats', async (_req, res) => {
  try {
    res.json(ok(await db.getStats()));
  } catch (err) {
    console.error('[getStats]', err.message);
    res.status(500).json(fail(err.message));
  }
});

// ---- AUTH — DISCORD ---------------------------------------------

app.get('/auth/discord', (req, res) => {
  if (!process.env.DISCORD_CLIENT_ID) return res.status(503).send('Discord OAuth non configurato');
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  `${APP_URL()}/auth/discord/callback`,
    response_type: 'code',
    scope:         'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?auth_error=no_code');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${APP_URL()}/auth/discord/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token Discord non ricevuto');

    const profileRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=64`
      : '';

    const user  = await db.upsertUser({ provider: 'discord', provider_id: profile.id, gamertag: profile.username, avatar_url: avatar });
    const token = signToken(user);
    const suffix = user.is_new ? '&new_user=1' : '';
    res.redirect(`/?auth_token=${token}${suffix}`);
  } catch (err) {
    console.error('[discord/callback]', err.message);
    if (err.message === 'BANNED') return res.redirect('/?auth_error=banned');
    res.redirect('/?auth_error=discord_failed');
  }
});

// ---- AUTH — GOOGLE ----------------------------------------------

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).send('Google OAuth non configurato');
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${APP_URL()}/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?auth_error=no_code');
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${APP_URL()}/auth/google/callback`,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('Token Google non ricevuto');

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    const gamertag = profile.name || profile.email.split('@')[0];
    const user  = await db.upsertUser({ provider: 'google', provider_id: profile.id, gamertag, avatar_url: profile.picture || '', email: profile.email || '' });
    const token = signToken(user);
    const suffix = user.is_new ? '&new_user=1' : '';
    res.redirect(`/?auth_token=${token}${suffix}`);
  } catch (err) {
    console.error('[google/callback]', err.message);
    if (err.message === 'BANNED') return res.redirect('/?auth_error=banned');
    res.redirect('/?auth_error=google_failed');
  }
});

// ---- AUTH — ME --------------------------------------------------

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    // Always return fresh data from DB so role/contributor changes are instant
    const user = await db.getUserById(req.user.userId);
    if (!user) return res.status(404).json(fail('Utente non trovato'));
    res.json(ok({
      userId:      user.id,
      gamertag:    user.gamertag,
      avatar:      user.avatar_url,
      role:        user.role,
      contributor: user.contributor,
    }));
  } catch (err) {
    res.status(500).json(fail(err.message));
  }
});

app.patch('/api/me/gamertag', requireAuth, async (req, res) => {
  try {
    const user  = await db.updateGamertag(req.user.userId, req.body.gamertag);
    const token = signToken(user);
    res.json(ok({ gamertag: user.gamertag, token }));
  } catch (err) {
    res.status(400).json(fail(err.message));
  }
});

app.patch('/api/me/contributor', requireAuth, async (req, res) => {
  try {
    const value = req.body.contributor ? 1 : 0;
    const user  = await db.setContributor(req.user.userId, value);
    const token = signToken(user);
    res.json(ok({ contributor: user.contributor, token }));
  } catch (err) {
    res.status(400).json(fail(err.message));
  }
});

// ---- COMMUNITY CONFIRM/FLAG ------------------------------------
// Requires authentication + contributor/mod/admin

app.post('/api/items/:type/:id/confirm', requireAuth, requireContributor, async (req, res) => {
  try {
    // Use userId as voterKey — one vote per account, cannot spoof
    const data = await db.confirmItem(
      req.params.type,
      req.params.id,
      req.user.userId,
      req.body.action || 'confirm'
    );
    res.json(ok(data));
  } catch (err) {
    console.error('[confirmItem]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ADMIN — BUILDS --------------------------------------------

app.patch('/api/admin/builds/:id/status', requireAdmin, async (req, res) => {
  try {
    res.json(ok(await db.adminSetBuildStatus(req.params.id, req.body.status)));
  } catch (err) {
    console.error('[adminSetBuildStatus]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.patch('/api/admin/builds/:id', requireAdmin, async (req, res) => {
  try {
    res.json(ok(await db.adminUpdateBuild(req.params.id, req.body)));
  } catch (err) {
    console.error('[adminUpdateBuild]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.delete('/api/admin/builds/:id', requireAdmin, async (req, res) => {
  try {
    res.json(ok(await db.adminDeleteBuild(req.params.id)));
  } catch (err) {
    console.error('[adminDeleteBuild]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ADMIN — ITEMS ---------------------------------------------

app.patch('/api/admin/items/:type/:id/status', requireAdmin, async (req, res) => {
  try {
    const data = await db.adminSetStatus(req.params.type, req.params.id, req.body.status);
    res.json(ok(data));
  } catch (err) {
    console.error('[adminSetStatus]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ADMIN — USERS ---------------------------------------------

app.patch('/api/admin/items/:type/:id', requireAdmin, async (req, res) => {
  try {
    const data = await db.adminUpdateItem(req.params.type, req.params.id, req.body);
    res.json(ok(data));
  } catch (err) {
    console.error('[adminUpdateItem]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.get('/api/admin/users', requireModOrAdmin, async (req, res) => {
  try {
    const data = await db.listUsers({
      search: req.query.search || '',
      page:   parseInt(req.query.page) || 1,
      limit:  Math.min(parseInt(req.query.limit) || 50, 100),
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listUsers]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.patch('/api/admin/users/:id', requireModOrAdmin, async (req, res) => {
  try {
    const user = await db.updateUserDetails(req.user.role, req.params.id, req.body);
    res.json(ok(user));
  } catch (err) {
    console.error('[updateUserDetails]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const data = await db.deleteUser(req.user?.role || 'admin', req.params.id, req.body.ban || null);
    res.json(ok(data));
  } catch (err) {
    console.error('[deleteUser]', err.message);
    res.status(400).json(fail(err.message));
  }
});

app.get('/api/admin/banned', requireAdmin, async (req, res) => {
  try {
    res.json(ok(await db.listBannedAccounts()));
  } catch (err) {
    console.error('[listBanned]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.delete('/api/admin/banned/:id', requireAdmin, async (req, res) => {
  try {
    res.json(ok(await db.unbanAccount(req.params.id)));
  } catch (err) {
    console.error('[unbanAccount]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- WEAPONS ---------------------------------------------------

app.get('/api/weapons', async (req, res) => {
  try {
    const data = await db.listWeapons({
      rarity:      req.query.rarity      || '',
      weapon_type: req.query.weapon_type || '',
      status:      req.query.status      || 'verified',
      search:      req.query.search      || '',
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listWeapons]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/weapons/:id', async (req, res) => {
  try {
    const weapon = await db.getWeapon(req.params.id);
    if (!weapon) return res.status(404).json(fail('Arma non trovata'));
    res.json(ok(weapon));
  } catch (err) {
    console.error('[getWeapon]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/weapons', requireAuth, requireContributor, async (req, res) => {
  try {
    const body = { ...req.body, submitted_by: req.user.gamertag };
    const data = await db.createWeapon(body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createWeapon]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ARMOR -----------------------------------------------------

app.get('/api/armor', async (req, res) => {
  try {
    const data = await db.listArmorPieces({
      slot:      req.query.slot      || '',
      rarity:    req.query.rarity    || '',
      armor_set: req.query.armor_set || '',
      status:    req.query.status    || 'verified',
      search:    req.query.search    || '',
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listArmorPieces]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/armor/:id', async (req, res) => {
  try {
    const piece = await db.getArmorPiece(req.params.id);
    if (!piece) return res.status(404).json(fail('Armatura non trovata'));
    res.json(ok(piece));
  } catch (err) {
    console.error('[getArmorPiece]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/armor', requireAuth, requireContributor, async (req, res) => {
  try {
    const body = { ...req.body, submitted_by: req.user.gamertag };
    const data = await db.createArmorPiece(body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createArmorPiece]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- HEROES ----------------------------------------------------

app.get('/api/heroes', async (req, res) => {
  try {
    const data = await db.listHeroes({
      rarity: req.query.rarity || '',
      status: req.query.status || 'verified',
      search: req.query.search || '',
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listHeroes]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/heroes/:id', async (req, res) => {
  try {
    const hero = await db.getHero(req.params.id);
    if (!hero) return res.status(404).json(fail('Eroe non trovato'));
    res.json(ok(hero));
  } catch (err) {
    console.error('[getHero]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/heroes', requireAuth, requireContributor, async (req, res) => {
  try {
    const body = { ...req.body, submitted_by: req.user.gamertag };
    const data = await db.createHero(body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createHero]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- SERVANTS --------------------------------------------------

app.get('/api/servants', async (req, res) => {
  try {
    const data = await db.listServants({
      rarity: req.query.rarity || '',
      type:   req.query.type   || '',
      status: req.query.status || 'verified',
      search: req.query.search || '',
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listServants]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/servants/:id', async (req, res) => {
  try {
    const servant = await db.getServant(req.params.id);
    if (!servant) return res.status(404).json(fail('Servitore non trovato'));
    res.json(ok(servant));
  } catch (err) {
    console.error('[getServant]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/servants', requireAuth, requireContributor, async (req, res) => {
  try {
    const body = { ...req.body, submitted_by: req.user.gamertag };
    const data = await db.createServant(body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createServant]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- GLOVES ----------------------------------------------------

app.get('/api/gloves', async (req, res) => {
  try {
    const data = await db.listGloves({
      rarity: req.query.rarity || '',
      status: req.query.status || 'verified',
      search: req.query.search || '',
    });
    res.json(ok(data));
  } catch (err) {
    console.error('[listGloves]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.get('/api/gloves/:id', async (req, res) => {
  try {
    const glove = await db.getGlove(req.params.id);
    if (!glove) return res.status(404).json(fail('Guanto non trovato'));
    res.json(ok(glove));
  } catch (err) {
    console.error('[getGlove]', err.message);
    res.status(500).json(fail(err.message));
  }
});

app.post('/api/gloves', requireAuth, requireContributor, async (req, res) => {
  try {
    const body = { ...req.body, submitted_by: req.user.gamertag };
    const data = await db.createGlove(body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createGlove]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- AI SCREENSHOT PARSING -------------------------------------

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const ITEM_PROMPT = `Sei un assistente che analizza screenshot del gioco mobile Knighthood (UI in italiano).
Estrai i dati dell'oggetto visibile nello screenshot e restituisci SOLO un oggetto JSON valido, senza testo aggiuntivo.

Determina il tipo di oggetto tra: weapons, armor, heroes, servants, gloves

Schema JSON in base al tipo:

weapons:
{ "itemType":"weapons", "name":"...", "rarity":"comune|raro|epico|leggendario|unico|mitico",
  "weapon_type":"spada|ascia|martello", "danni":null, "forte_contro_1":"...", "forte_contro_2":"...", "talisman_slots":null }

armor:
{ "itemType":"armor", "name":"...", "rarity":"comune|raro|epico|leggendario|unico|mitico",
  "slot":"elmo|spalle|busto|braccia|guanti|gambe", "armatura":null,
  "forte_contro":"...", "armor_set":"pesante|magico|leggero|a distanza", "talisman_slots":null }

heroes:
{ "itemType":"heroes", "name":"...", "rarity":"comune|raro|epico|leggendario|unico",
  "class1":"...", "class2":"...", "strong_vs":"...", "danni":null, "armatura":null, "pv":null,
  "potere1":"nome potere 1", "potere1_desc":"descrizione effetto potere 1",
  "potere2":"nome potere 2", "potere2_desc":"descrizione effetto potere 2" }

servants:
{ "itemType":"servants", "name":"...", "rarity":"comune|raro|epico|leggendario|unico",
  "type":"...", "tags":"...", "danni":null, "armatura":null, "pv":null,
  "potere_nome":"...", "potere_desc":"...",
  "vulnerabilities":"...", "resistances":"...", "capture_glove":"..." }

gloves:
{ "itemType":"gloves", "name":"...", "rarity":"comune|raro|epico|leggendario|unico",
  "danni":null, "nodi_totali":null, "description":"...",
  "nodes_json":[ {"nome":"...","desc":"...","costo":null} ] }

Regole:
- Usa null per campi non visibili nello screenshot
- forte_contro_1/2 e forte_contro esistono SOLO se rarità è mitico
- armor_set esiste SOLO se rarità NON è mitico
- nodes_json: elenca solo i nodi upgrade visibili nello screenshot
- tags nei servants: lista separata da virgola dei tipi (es. "Bestia,Magico")
- vulnerabilities/resistances: lista separata da virgola
- rarity in minuscolo italiano
- slot armatura in minuscolo italiano
- per heroes ci sono sempre e solo due poteri; separa nome potere e descrizione effetto`;

app.post('/api/ai/parse-item', requireAuth, requireContributor, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json(fail('AI parsing non configurato (GEMINI_API_KEY mancante)'));
  }
  const images = Array.isArray(req.body.images)
    ? req.body.images
    : (req.body.image ? [{ image: req.body.image, mimeType: req.body.mimeType || 'image/jpeg' }] : []);
  if (!images.length) return res.status(400).json(fail('Immagine mancante'));
  if (images.length > 5) return res.status(400).json(fail('Massimo 5 screenshot per analisi'));

  const VALID_MIME = ['image/jpeg','image/png','image/webp','image/gif'];
  for (const img of images) {
    img.mimeType = img.mimeType || 'image/jpeg';
    if (!VALID_MIME.includes(img.mimeType)) return res.status(400).json(fail('Formato immagine non supportato (jpeg/png/webp)'));
    if (!img.image || img.image.length > 8_000_000) return res.status(400).json(fail('Uno screenshot è troppo grande'));
  }

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          ...images.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.image } })),
          { text: ITEM_PROMPT }
        ]}],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 1536,
        }
      })
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || `Gemini error ${geminiRes.status}`;
      throw new Error(msg);
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Nessuna risposta dal modello AI');

    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error('Il modello ha restituito un formato non valido'); }

    if (!parsed.itemType) throw new Error('Tipo oggetto non riconosciuto nello screenshot');

    res.json(ok(parsed));
  } catch (err) {
    console.error('[parseItem]', err.message);
    res.status(500).json(fail(err.message));
  }
});

// ---- HEALTH ----------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- START -----------------------------------------------------

async function start() {
  await db.initSchema();
  app.listen(PORT, () => {
    console.log(`\n✅ KH Builds attivo su http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
