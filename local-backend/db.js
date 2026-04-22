'use strict';

const { createClient } = require('@libsql/client');

const db = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:./kh_builds.db',
  ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {})
});

async function initSchema() {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS builds (
        id          TEXT PRIMARY KEY,
        timestamp   TEXT NOT NULL,
        title       TEXT NOT NULL,
        mode        TEXT NOT NULL,
        weapon      TEXT NOT NULL DEFAULT '',
        helmet      TEXT NOT NULL DEFAULT '',
        chest       TEXT NOT NULL DEFAULT '',
        gloves      TEXT NOT NULL DEFAULT '',
        boots       TEXT NOT NULL DEFAULT '',
        hero1       TEXT NOT NULL DEFAULT '',
        hero2       TEXT NOT NULL DEFAULT '',
        hero3       TEXT NOT NULL DEFAULT '',
        charms      TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        author      TEXT NOT NULL DEFAULT 'Anonimo',
        upvotes     INTEGER NOT NULL DEFAULT 0,
        downvotes   INTEGER NOT NULL DEFAULT 0,
        status      TEXT NOT NULL DEFAULT 'active'
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS votes (
        build_id  TEXT NOT NULL,
        voter_key TEXT NOT NULL,
        vote_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        PRIMARY KEY (build_id, voter_key)
      )`,
      args: []
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_builds_mode   ON builds(mode)`,   args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status)`, args: [] },
  ], 'write');
}

async function listBuilds({ mode = 'all', sort = 'votes', search = '', page = 1, limit = 12 }) {
  const conditions = ["status != 'hidden'"];
  const args = [];

  if (mode !== 'all') {
    conditions.push('mode = ?');
    args.push(mode);
  }

  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conditions.push('(title LIKE ? OR weapon LIKE ? OR hero1 LIKE ? OR hero2 LIKE ? OR hero3 LIKE ? OR description LIKE ?)');
    args.push(q, q, q, q, q, q);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const orderMap = {
    votes:   '(upvotes - downvotes) DESC',
    newest:  'timestamp DESC',
    oldest:  'timestamp ASC',
    upvotes: 'upvotes DESC',
  };
  const order = orderMap[sort] || orderMap.votes;

  const countRes = await db.execute({ sql: `SELECT COUNT(*) as cnt FROM builds ${where}`, args });
  const total    = Number(countRes.rows[0].cnt);
  const pages    = Math.max(1, Math.ceil(total / limit));
  const p        = Math.min(page, pages);

  const rows = await db.execute({
    sql:  `SELECT * FROM builds ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
    args: [...args, limit, (p - 1) * limit]
  });

  return { builds: rows.rows.map(rowToObj), total, page: p, limit, pages };
}

async function getBuild(id) {
  if (!id) throw new Error('ID build mancante');
  const res = await db.execute({ sql: 'SELECT * FROM builds WHERE id = ?', args: [id] });
  return res.rows.length ? rowToObj(res.rows[0]) : null;
}

async function createBuild(d) {
  const title  = (d.title  || '').trim();
  const mode   = (d.mode   || '').trim().toLowerCase();
  const weapon = (d.weapon || '').trim();
  const author = (d.author || 'Anonimo').trim();

  if (!title)                                       throw new Error('Il titolo è obbligatorio');
  if (title.length > 100)                          throw new Error('Titolo troppo lungo (max 100 caratteri)');
  if (!mode)                                        throw new Error('La modalità è obbligatoria');
  if (!['arena','pve','war','rift'].includes(mode)) throw new Error('Modalità non valida');
  if (!weapon)                                      throw new Error("L'arma è obbligatoria");
  if (weapon.length > 100)                         throw new Error('Nome arma troppo lungo (max 100 caratteri)');
  if ((d.description || '').length > 1000)         throw new Error('Descrizione troppo lunga (max 1000 caratteri)');

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO builds
          (id,timestamp,title,mode,weapon,helmet,chest,gloves,boots,hero1,hero2,hero3,charms,description,author,upvotes,downvotes,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,'active')`,
    args: [
      id, ts, title, mode, weapon,
      (d.helmet||'').trim(), (d.chest||'').trim(), (d.gloves||'').trim(), (d.boots||'').trim(),
      (d.hero1||'').trim(),  (d.hero2||'').trim(),  (d.hero3||'').trim(),
      (d.charms||'').trim(), (d.description||'').trim(), author
    ]
  });

  return { id, message: 'Build creata con successo!' };
}

async function voteBuild(id, type, voterKey) {
  if (!id)                                   throw new Error('ID build mancante');
  if (!type)                                 throw new Error('Tipo voto mancante');
  if (!voterKey)                             throw new Error('Identificatore votante mancante');
  if (!['up','down'].includes(type))         throw new Error('Tipo voto non valido (up/down)');

  const dupRes = await db.execute({
    sql:  'SELECT vote_type FROM votes WHERE build_id = ? AND voter_key = ?',
    args: [id, voterKey]
  });
  if (dupRes.rows.length) {
    return { alreadyVoted: true, voteType: String(dupRes.rows[0].vote_type), message: 'Hai già votato questa build' };
  }

  const col = type === 'up' ? 'upvotes' : 'downvotes';

  await db.batch([
    { sql: `UPDATE builds SET ${col} = ${col} + 1 WHERE id = ?`, args: [id] },
    { sql: `INSERT INTO votes (build_id, voter_key, vote_type, timestamp) VALUES (?,?,?,?)`, args: [id, voterKey, type, new Date().toISOString()] }
  ], 'write');

  const updated = await db.execute({ sql: 'SELECT upvotes, downvotes FROM builds WHERE id = ?', args: [id] });
  if (!updated.rows.length) throw new Error('Build non trovata');

  return {
    message:   'Voto registrato!',
    upvotes:   Number(updated.rows[0].upvotes),
    downvotes: Number(updated.rows[0].downvotes)
  };
}

async function getStats() {
  const [totalRes, modeRes, topRes] = await Promise.all([
    db.execute("SELECT COUNT(*) as cnt FROM builds WHERE status != 'hidden'"),
    db.execute("SELECT mode, COUNT(*) as cnt FROM builds WHERE status != 'hidden' GROUP BY mode"),
    db.execute("SELECT title, mode, upvotes, downvotes, (upvotes - downvotes) as score FROM builds WHERE status != 'hidden' ORDER BY score DESC LIMIT 1")
  ]);

  const byMode = { arena: 0, pve: 0, war: 0, rift: 0 };
  for (const row of modeRes.rows) {
    if (byMode[row.mode] !== undefined) byMode[row.mode] = Number(row.cnt);
  }

  const t = topRes.rows[0];
  const topBuild = t ? {
    title: t.title, mode: t.mode,
    score: Number(t.score), upvotes: Number(t.upvotes), downvotes: Number(t.downvotes)
  } : null;

  return { total: Number(totalRes.rows[0].cnt), byMode, topBuild };
}

function rowToObj(row) {
  const s = k => String(row[k] || '');
  const n = k => Number(row[k] || 0);
  return {
    id:          s('id'),
    timestamp:   s('timestamp'),
    title:       s('title'),
    mode:        s('mode'),
    weapon:      s('weapon'),
    helmet:      s('helmet'),
    chest:       s('chest'),
    gloves:      s('gloves'),
    boots:       s('boots'),
    hero1:       s('hero1'),
    hero2:       s('hero2'),
    hero3:       s('hero3'),
    charms:      s('charms'),
    description: s('description'),
    author:      s('author') || 'Anonimo',
    upvotes:     n('upvotes'),
    downvotes:   n('downvotes'),
    status:      s('status') || 'active'
  };
}

module.exports = { initSchema, listBuilds, getBuild, createBuild, voteBuild, getStats };
