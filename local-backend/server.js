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
