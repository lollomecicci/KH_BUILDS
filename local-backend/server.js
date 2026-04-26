'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const dotenv  = require('dotenv');
const db      = require('./db');

dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = parseInt(process.env.PORT || '3000');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.resolve(__dirname, '..')));

app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const ok   = data => ({ ok: true,  data });
const fail = msg  => ({ ok: false, error: msg });

// ---- ROUTES ------------------------------------------------

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
    const data = await db.createBuild(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createBuild]', err.message);
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

// ---- COMMUNITY CONFIRM/FLAG --------------------------------
// POST /api/items/:type/:id/confirm  { voterKey, action: "confirm"|"flag" }
app.post('/api/items/:type/:id/confirm', async (req, res) => {
  try {
    const data = await db.confirmItem(
      req.params.type,
      req.params.id,
      req.body.voterKey,
      req.body.action || 'confirm'
    );
    res.json(ok(data));
  } catch (err) {
    console.error('[confirmItem]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ADMIN -------------------------------------------------
// PATCH /api/admin/items/:type/:id/status  { status }
// Richiede header X-Admin-Token
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json(fail('Non autorizzato'));
  }
  next();
};

app.patch('/api/admin/items/:type/:id/status', adminAuth, async (req, res) => {
  try {
    const data = await db.adminSetStatus(req.params.type, req.params.id, req.body.status);
    res.json(ok(data));
  } catch (err) {
    console.error('[adminSetStatus]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- WEAPONS -----------------------------------------------

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

app.post('/api/weapons', async (req, res) => {
  try {
    const data = await db.createWeapon(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createWeapon]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- ARMOR -------------------------------------------------

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

app.post('/api/armor', async (req, res) => {
  try {
    const data = await db.createArmorPiece(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createArmorPiece]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- HEROES ------------------------------------------------

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

app.post('/api/heroes', async (req, res) => {
  try {
    const data = await db.createHero(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createHero]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- SERVANTS ----------------------------------------------

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

app.post('/api/servants', async (req, res) => {
  try {
    const data = await db.createServant(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createServant]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- GLOVES ------------------------------------------------

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

app.post('/api/gloves', async (req, res) => {
  try {
    const data = await db.createGlove(req.body);
    res.status(201).json(ok(data));
  } catch (err) {
    console.error('[createGlove]', err.message);
    res.status(400).json(fail(err.message));
  }
});

// ---- HEALTH ------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- START -------------------------------------------------

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
