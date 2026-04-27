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
        spalle      TEXT NOT NULL DEFAULT '',
        chest       TEXT NOT NULL DEFAULT '',
        braccia     TEXT NOT NULL DEFAULT '',
        gloves      TEXT NOT NULL DEFAULT '',
        boots       TEXT NOT NULL DEFAULT '',
        hero1       TEXT NOT NULL DEFAULT '',
        hero2       TEXT NOT NULL DEFAULT '',
        servant1    TEXT NOT NULL DEFAULT '',
        servant2    TEXT NOT NULL DEFAULT '',
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
    {
      sql: `CREATE TABLE IF NOT EXISTS heroes (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        rarity        TEXT NOT NULL,
        class1        TEXT NOT NULL DEFAULT '',
        class2        TEXT NOT NULL DEFAULT '',
        strong_vs     TEXT NOT NULL DEFAULT '',
        danni         REAL,
        armatura      REAL,
        pv            REAL,
        potere1       TEXT NOT NULL DEFAULT '',
        potere2       TEXT NOT NULL DEFAULT '',
        potere3       TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'pending',
        submitted_by  TEXT NOT NULL DEFAULT '',
        confirmations INTEGER NOT NULL DEFAULT 0,
        flags         INTEGER NOT NULL DEFAULT 0,
        timestamp     TEXT NOT NULL
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS servants (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        rarity          TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT '',
        tags            TEXT NOT NULL DEFAULT '',
        danni           REAL,
        armatura        REAL,
        pv              REAL,
        potere_nome     TEXT NOT NULL DEFAULT '',
        potere_desc     TEXT NOT NULL DEFAULT '',
        vulnerabilities TEXT NOT NULL DEFAULT '',
        resistances     TEXT NOT NULL DEFAULT '',
        capture_glove   TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'pending',
        submitted_by    TEXT NOT NULL DEFAULT '',
        confirmations   INTEGER NOT NULL DEFAULT 0,
        flags           INTEGER NOT NULL DEFAULT 0,
        timestamp       TEXT NOT NULL
      )`,
      args: []
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_builds_mode      ON builds(mode)`,      args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_builds_status    ON builds(status)`,    args: [] },
    {
      sql: `CREATE TABLE IF NOT EXISTS gloves (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        rarity        TEXT NOT NULL,
        danni         REAL,
        description   TEXT NOT NULL DEFAULT '',
        nodes_json    TEXT NOT NULL DEFAULT '[]',
        nodi_totali   INTEGER,
        status        TEXT NOT NULL DEFAULT 'pending',
        submitted_by  TEXT NOT NULL DEFAULT '',
        confirmations INTEGER NOT NULL DEFAULT 0,
        flags         INTEGER NOT NULL DEFAULT 0,
        timestamp     TEXT NOT NULL
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS weapons (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        rarity         TEXT NOT NULL,
        weapon_type    TEXT NOT NULL DEFAULT '',
        danni          REAL,
        forte_contro_1 TEXT NOT NULL DEFAULT '',
        forte_contro_2 TEXT NOT NULL DEFAULT '',
        talisman_slots INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'pending',
        submitted_by   TEXT NOT NULL DEFAULT '',
        confirmations  INTEGER NOT NULL DEFAULT 0,
        flags          INTEGER NOT NULL DEFAULT 0,
        timestamp      TEXT NOT NULL
      )`,
      args: []
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_weapons_status   ON weapons(status)`,   args: [] },
    {
      sql: `CREATE TABLE IF NOT EXISTS armor_pieces (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        slot           TEXT NOT NULL,
        rarity         TEXT NOT NULL,
        armatura       REAL,
        forte_contro   TEXT NOT NULL DEFAULT '',
        armor_set      TEXT NOT NULL DEFAULT '',
        talisman_slots INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'pending',
        submitted_by   TEXT NOT NULL DEFAULT '',
        confirmations  INTEGER NOT NULL DEFAULT 0,
        flags          INTEGER NOT NULL DEFAULT 0,
        timestamp      TEXT NOT NULL
      )`,
      args: []
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_armor_slot    ON armor_pieces(slot)`,   args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_armor_status  ON armor_pieces(status)`, args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_heroes_status    ON heroes(status)`,    args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_servants_status  ON servants(status)`,  args: [] },
    { sql: `CREATE INDEX IF NOT EXISTS idx_gloves_status    ON gloves(status)`,    args: [] },
  ], 'write');

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      gamertag     TEXT NOT NULL,
      provider     TEXT NOT NULL,
      provider_id  TEXT NOT NULL,
      avatar_url   TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT 'user',
      contributor  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      UNIQUE(provider, provider_id)
    )`,
    args: []
  });

  await db.execute({
    sql: `CREATE TABLE IF NOT EXISTS item_confirmations (
      item_id   TEXT NOT NULL,
      item_type TEXT NOT NULL,
      voter_key TEXT NOT NULL,
      action    TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      PRIMARY KEY (item_id, item_type, voter_key)
    )`,
    args: []
  });

  // Safe migrations on existing DB
  const migrations = [
    `ALTER TABLE builds   ADD COLUMN spalle      TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE builds   ADD COLUMN braccia     TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE builds   ADD COLUMN servant1    TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE builds   ADD COLUMN servant2    TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE servants ADD COLUMN potere_nome   TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE servants ADD COLUMN potere_desc   TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE servants ADD COLUMN capture_glove TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users    ADD COLUMN role          TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE users    ADD COLUMN contributor   INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE heroes   ADD COLUMN flags         INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE servants ADD COLUMN flags         INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE gloves   ADD COLUMN flags         INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE weapons  ADD COLUMN flags         INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE armor_pieces ADD COLUMN flags     INTEGER NOT NULL DEFAULT 0`,
  ];
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }); } catch (_) { /* column already exists */ }
  }
}

// ─── Builds ──────────────────────────────────────────────────────────────────

async function listBuilds({ mode = 'all', sort = 'votes', search = '', page = 1, limit = 12 }) {
  const conditions = ["status != 'hidden'"];
  const args = [];

  if (mode !== 'all') {
    conditions.push('mode = ?');
    args.push(mode);
  }

  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conditions.push('(title LIKE ? OR weapon LIKE ? OR hero1 LIKE ? OR hero2 LIKE ? OR servant1 LIKE ? OR servant2 LIKE ? OR description LIKE ?)');
    args.push(q, q, q, q, q, q, q);
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
          (id,timestamp,title,mode,weapon,helmet,spalle,chest,braccia,gloves,boots,hero1,hero2,servant1,servant2,charms,description,author,upvotes,downvotes,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,'active')`,
    args: [
      id, ts, title, mode, weapon,
      (d.helmet  ||'').trim(), (d.spalle  ||'').trim(),
      (d.chest   ||'').trim(), (d.braccia ||'').trim(),
      (d.gloves  ||'').trim(), (d.boots   ||'').trim(),
      (d.hero1   ||'').trim(), (d.hero2   ||'').trim(),
      (d.servant1||'').trim(), (d.servant2||'').trim(),
      (d.charms||'').trim(), (d.description||'').trim(), author
    ]
  });

  return { id, message: 'Build creata con successo!' };
}

async function voteBuild(id, type, voterKey) {
  if (!id)                           throw new Error('ID build mancante');
  if (!type)                         throw new Error('Tipo voto mancante');
  if (!voterKey)                     throw new Error('Identificatore votante mancante');
  if (!['up','down'].includes(type)) throw new Error('Tipo voto non valido (up/down)');

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
    spalle:      s('spalle'),
    chest:       s('chest'),
    braccia:     s('braccia'),
    gloves:      s('gloves'),
    boots:       s('boots'),
    hero1:       s('hero1'),
    hero2:       s('hero2'),
    servant1:    s('servant1'),
    servant2:    s('servant2'),
    charms:      s('charms'),
    description: s('description'),
    author:      s('author') || 'Anonimo',
    upvotes:     n('upvotes'),
    downvotes:   n('downvotes'),
    status:      s('status') || 'active'
  };
}

// ─── Community confirmation ───────────────────────────────────────────────────

// Accept both plural (from URL path) and singular (legacy) keys
const ITEM_TABLES = {
  weapon: 'weapons',       weapons: 'weapons',
  armor:  'armor_pieces',  armor_pieces: 'armor_pieces',
  hero:   'heroes',        heroes: 'heroes',
  servant:'servants',      servants: 'servants',
  glove:  'gloves',        gloves: 'gloves',
};
const CONFIRM_THRESHOLD = 3;
const FLAG_THRESHOLD    = 3;

async function confirmItem(itemType, itemId, voterKey, action) {
  const table = ITEM_TABLES[itemType];
  if (!table)                                throw new Error('Tipo item non valido');
  if (!itemId)                               throw new Error('ID item mancante');
  if (!voterKey)                             throw new Error('voter_key mancante');
  if (!['confirm','flag'].includes(action))  throw new Error('Azione non valida (confirm/flag)');

  const itemRes = await db.execute({ sql: `SELECT id, status FROM ${table} WHERE id = ?`, args: [itemId] });
  if (!itemRes.rows.length) throw new Error('Item non trovato');
  const currentStatus = String(itemRes.rows[0].status);

  const dupRes = await db.execute({
    sql:  'SELECT action FROM item_confirmations WHERE item_id = ? AND item_type = ? AND voter_key = ?',
    args: [itemId, itemType, voterKey]
  });
  if (dupRes.rows.length) {
    return { alreadyVoted: true, action: String(dupRes.rows[0].action), message: 'Hai già espresso un parere su questo item' };
  }

  await db.execute({
    sql:  'INSERT INTO item_confirmations (item_id, item_type, voter_key, action, timestamp) VALUES (?,?,?,?,?)',
    args: [itemId, itemType, voterKey, action, new Date().toISOString()]
  });

  // Update denormalised counters on item row
  if (action === 'confirm') {
    await db.execute({ sql: `UPDATE ${table} SET confirmations = confirmations + 1 WHERE id = ?`, args: [itemId] });
  } else {
    await db.execute({ sql: `UPDATE ${table} SET flags = flags + 1 WHERE id = ?`, args: [itemId] });
  }

  const countRes = await db.execute({
    sql: `SELECT confirmations, flags FROM ${table} WHERE id = ?`, args: [itemId]
  });
  const confirms = Number(countRes.rows[0].confirmations || 0);
  const flags    = Number(countRes.rows[0].flags    || 0);

  let newStatus = currentStatus;
  if (flags >= FLAG_THRESHOLD)         newStatus = 'flagged';
  else if (confirms >= CONFIRM_THRESHOLD) newStatus = 'verified';

  if (newStatus !== currentStatus) {
    await db.execute({ sql: `UPDATE ${table} SET status = ? WHERE id = ?`, args: [newStatus, itemId] });
  }

  return { message: 'Parere registrato!', confirms, flags, status: newStatus };
}

async function adminSetStatus(itemType, itemId, newStatus) {
  const table = ITEM_TABLES[itemType];
  if (!table) throw new Error('Tipo item non valido');
  if (!['pending','verified','flagged'].includes(newStatus)) throw new Error('Status non valido');
  const res = await db.execute({ sql: `UPDATE ${table} SET status = ? WHERE id = ?`, args: [newStatus, itemId] });
  if (!res.rowsAffected) throw new Error('Item non trovato');
  return { message: `Status aggiornato a ${newStatus}` };
}

// ─── Weapons ─────────────────────────────────────────────────────────────────

const VALID_RARITIES      = ['comune','raro','epico','leggendario','unico'];
const VALID_RARITIES_ITEM = ['comune','raro','epico','leggendario','unico','mitico'];
const VALID_ARMOR_SLOTS   = ['elmo','spalle','busto','braccia','guanti','gambe'];
const VALID_ARMOR_SETS    = ['pesante','magico','leggero','a distanza'];
const VALID_WEAPON_TYPES  = ['spada','ascia','martello'];

function weaponToObj(row) {
  const s = k => String(row[k] || '');
  return {
    id:             s('id'),
    name:           s('name'),
    rarity:         s('rarity'),
    weapon_type:    s('weapon_type'),
    danni:          row.danni != null ? Number(row.danni) : null,
    forte_contro_1: s('forte_contro_1'),
    forte_contro_2: s('forte_contro_2'),
    talisman_slots: Number(row.talisman_slots || 0),
    status:         s('status'),
    submitted_by:   s('submitted_by'),
    confirmations:  Number(row.confirmations || 0),
    flags:          Number(row.flags || 0),
    timestamp:      s('timestamp'),
  };
}

async function listWeapons({ rarity, weapon_type, status = 'verified', search = '' } = {}) {
  const conds = [];
  const args  = [];
  if (status !== 'all')  { conds.push('status = ?');      args.push(status); }
  if (rarity)            { conds.push('rarity = ?');       args.push(rarity); }
  if (weapon_type)       { conds.push('weapon_type = ?');  args.push(weapon_type); }
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(name LIKE ? OR weapon_type LIKE ?)');
    args.push(q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await db.execute({ sql: `SELECT * FROM weapons ${where} ORDER BY name ASC`, args });
  return res.rows.map(weaponToObj);
}

async function getWeapon(id) {
  if (!id) throw new Error('ID arma mancante');
  const res = await db.execute({ sql: 'SELECT * FROM weapons WHERE id = ?', args: [id] });
  return res.rows.length ? weaponToObj(res.rows[0]) : null;
}

async function createWeapon(d) {
  const name        = (d.name        || '').trim();
  const rarity      = (d.rarity      || '').trim().toLowerCase();
  const weapon_type = (d.weapon_type || '').trim();
  if (!name)                                    throw new Error('Nome arma obbligatorio');
  if (!VALID_RARITIES_ITEM.includes(rarity))  throw new Error('Rarità non valida');

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO weapons (id,name,rarity,weapon_type,danni,forte_contro_1,forte_contro_2,talisman_slots,status,submitted_by,confirmations,flags,timestamp)
          VALUES (?,?,?,?,?,?,?,?,'pending',?,0,0,?)`,
    args: [
      id, name, rarity, weapon_type,
      d.danni != null ? Number(d.danni) : null,
      (d.forte_contro_1||'').trim(),
      (d.forte_contro_2||'').trim(),
      d.talisman_slots != null ? Number(d.talisman_slots) : 0,
      (d.submitted_by||'').trim(),
      new Date().toISOString()
    ]
  });
  return { id, message: 'Arma inviata per verifica!' };
}

// ─── Heroes ──────────────────────────────────────────────────────────────────

function heroToObj(row) {
  const s = k => String(row[k] || '');
  const n = k => (row[k] != null ? Number(row[k]) : null);
  return {
    id:            s('id'),
    name:          s('name'),
    rarity:        s('rarity'),
    class1:        s('class1'),
    class2:        s('class2'),
    strong_vs:     s('strong_vs'),
    danni:         n('danni'),
    armatura:      n('armatura'),
    pv:            n('pv'),
    potere1:       s('potere1'),
    potere2:       s('potere2'),
    potere3:       s('potere3'),
    status:        s('status'),
    submitted_by:  s('submitted_by'),
    confirmations: Number(row.confirmations || 0),
    flags:         Number(row.flags || 0),
    timestamp:     s('timestamp'),
  };
}

async function listHeroes({ rarity, status = 'verified', search = '' } = {}) {
  const conds = [];
  const args  = [];
  if (status !== 'all') { conds.push('status = ?'); args.push(status); }
  if (rarity)           { conds.push('rarity = ?'); args.push(rarity); }
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(name LIKE ? OR class1 LIKE ? OR class2 LIKE ?)');
    args.push(q, q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await db.execute({ sql: `SELECT * FROM heroes ${where} ORDER BY name ASC`, args });
  return res.rows.map(heroToObj);
}

async function getHero(id) {
  if (!id) throw new Error('ID eroe mancante');
  const res = await db.execute({ sql: 'SELECT * FROM heroes WHERE id = ?', args: [id] });
  return res.rows.length ? heroToObj(res.rows[0]) : null;
}

async function createHero(d) {
  const name   = (d.name   || '').trim();
  const rarity = (d.rarity || '').trim().toLowerCase();
  if (!name)                            throw new Error('Nome eroe obbligatorio');
  if (!VALID_RARITIES.includes(rarity)) throw new Error('Rarità non valida');

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO heroes (id,name,rarity,class1,class2,strong_vs,danni,armatura,pv,potere1,potere2,potere3,status,submitted_by,confirmations,flags,timestamp)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,0,0,?)`,
    args: [
      id, name, rarity,
      (d.class1    ||'').trim(), (d.class2    ||'').trim(),
      (d.strong_vs ||'').trim(),
      d.danni    != null ? Number(d.danni)    : null,
      d.armatura != null ? Number(d.armatura) : null,
      d.pv       != null ? Number(d.pv)       : null,
      (d.potere1||'').trim(), (d.potere2||'').trim(), (d.potere3||'').trim(),
      (d.submitted_by||'').trim(),
      new Date().toISOString()
    ]
  });
  return { id, message: 'Eroe inviato per verifica!' };
}

// ─── Servants ────────────────────────────────────────────────────────────────

function servantToObj(row) {
  const s = k => String(row[k] || '');
  const n = k => (row[k] != null ? Number(row[k]) : null);
  return {
    id:              s('id'),
    name:            s('name'),
    rarity:          s('rarity'),
    type:            s('type'),
    tags:            s('tags'),
    danni:           n('danni'),
    armatura:        n('armatura'),
    pv:              n('pv'),
    potere_nome:     s('potere_nome'),
    potere_desc:     s('potere_desc'),
    vulnerabilities: s('vulnerabilities'),
    resistances:     s('resistances'),
    capture_glove:   s('capture_glove'),
    status:          s('status'),
    submitted_by:    s('submitted_by'),
    confirmations:   Number(row.confirmations || 0),
    flags:           Number(row.flags || 0),
    timestamp:       s('timestamp'),
  };
}

async function listServants({ rarity, type, status = 'verified', search = '' } = {}) {
  const conds = [];
  const args  = [];
  if (status !== 'all') { conds.push('status = ?'); args.push(status); }
  if (rarity)           { conds.push('rarity = ?'); args.push(rarity); }
  if (type)             { conds.push('type = ?');   args.push(type);   }
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(name LIKE ? OR tags LIKE ?)');
    args.push(q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await db.execute({ sql: `SELECT * FROM servants ${where} ORDER BY name ASC`, args });
  return res.rows.map(servantToObj);
}

async function getServant(id) {
  if (!id) throw new Error('ID servitore mancante');
  const res = await db.execute({ sql: 'SELECT * FROM servants WHERE id = ?', args: [id] });
  return res.rows.length ? servantToObj(res.rows[0]) : null;
}

async function createServant(d) {
  const name   = (d.name   || '').trim();
  const rarity = (d.rarity || '').trim().toLowerCase();
  if (!name)                            throw new Error('Nome servitore obbligatorio');
  if (!VALID_RARITIES.includes(rarity)) throw new Error('Rarità non valida');

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO servants (id,name,rarity,type,tags,danni,armatura,pv,potere_nome,potere_desc,vulnerabilities,resistances,capture_glove,status,submitted_by,confirmations,flags,timestamp)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,0,0,?)`,
    args: [
      id, name, rarity,
      (d.type  ||'').trim(),
      (d.tags  ||'').trim(),
      d.danni    != null ? Number(d.danni)    : null,
      d.armatura != null ? Number(d.armatura) : null,
      d.pv       != null ? Number(d.pv)       : null,
      (d.potere_nome     ||'').trim(),
      (d.potere_desc     ||'').trim(),
      (d.vulnerabilities ||'').trim(),
      (d.resistances     ||'').trim(),
      (d.capture_glove   ||'').trim(),
      (d.submitted_by    ||'').trim(),
      new Date().toISOString()
    ]
  });
  return { id, message: 'Servitore inviato per verifica!' };
}

// ─── Gloves ──────────────────────────────────────────────────────────────────

function gloveToObj(row) {
  const s = k => String(row[k] || '');
  let nodes = [];
  try { nodes = JSON.parse(row.nodes_json || '[]'); } catch (_) {}
  return {
    id:            s('id'),
    name:          s('name'),
    rarity:        s('rarity'),
    danni:         row.danni != null ? Number(row.danni) : null,
    description:   s('description'),
    nodes:         nodes,
    nodi_totali:   row.nodi_totali != null ? Number(row.nodi_totali) : null,
    status:        s('status'),
    submitted_by:  s('submitted_by'),
    confirmations: Number(row.confirmations || 0),
    flags:         Number(row.flags || 0),
    timestamp:     s('timestamp'),
  };
}

async function listGloves({ rarity, status = 'verified', search = '' } = {}) {
  const conds = [];
  const args  = [];
  if (status !== 'all') { conds.push('status = ?'); args.push(status); }
  if (rarity)           { conds.push('rarity = ?'); args.push(rarity); }
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(name LIKE ? OR description LIKE ?)');
    args.push(q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await db.execute({ sql: `SELECT * FROM gloves ${where} ORDER BY name ASC`, args });
  return res.rows.map(gloveToObj);
}

async function getGlove(id) {
  if (!id) throw new Error('ID guanto mancante');
  const res = await db.execute({ sql: 'SELECT * FROM gloves WHERE id = ?', args: [id] });
  return res.rows.length ? gloveToObj(res.rows[0]) : null;
}

async function createGlove(d) {
  const name   = (d.name   || '').trim();
  const rarity = (d.rarity || '').trim().toLowerCase();
  if (!name)                            throw new Error('Nome guanto obbligatorio');
  if (!VALID_RARITIES.includes(rarity)) throw new Error('Rarità non valida');

  let nodes = d.nodes_json || d.nodes || [];
  if (typeof nodes === 'string') { try { nodes = JSON.parse(nodes); } catch { nodes = []; } }
  if (!Array.isArray(nodes)) throw new Error('nodes deve essere un array');
  const nodes_json = JSON.stringify(nodes);

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO gloves (id,name,rarity,danni,description,nodes_json,nodi_totali,status,submitted_by,confirmations,flags,timestamp)
          VALUES (?,?,?,?,?,?,?,'pending',?,0,0,?)`,
    args: [
      id, name, rarity,
      d.danni != null ? Number(d.danni) : null,
      (d.description||'').trim(),
      nodes_json,
      d.nodi_totali != null ? Number(d.nodi_totali) : null,
      (d.submitted_by||'').trim(),
      new Date().toISOString()
    ]
  });
  return { id, message: 'Guanto inviato per verifica!' };
}

// ─── Armor ───────────────────────────────────────────────────────────────────

function armorToObj(row) {
  const s = k => String(row[k] || '');
  return {
    id:             s('id'),
    name:           s('name'),
    slot:           s('slot'),
    rarity:         s('rarity'),
    armatura:       row.armatura != null ? Number(row.armatura) : null,
    forte_contro:   s('forte_contro'),
    armor_set:      s('armor_set'),
    talisman_slots: Number(row.talisman_slots || 0),
    status:         s('status'),
    submitted_by:   s('submitted_by'),
    confirmations:  Number(row.confirmations || 0),
    flags:          Number(row.flags || 0),
    timestamp:      s('timestamp'),
  };
}

async function listArmorPieces({ slot, rarity, armor_set, status = 'verified', search = '' } = {}) {
  const conds = [];
  const args  = [];
  if (status !== 'all') { conds.push('status = ?');    args.push(status); }
  if (slot)             { conds.push('slot = ?');       args.push(slot); }
  if (rarity)           { conds.push('rarity = ?');     args.push(rarity); }
  if (armor_set)        { conds.push('armor_set = ?');  args.push(armor_set); }
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(name LIKE ? OR forte_contro LIKE ? OR armor_set LIKE ?)');
    args.push(q, q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const res = await db.execute({ sql: `SELECT * FROM armor_pieces ${where} ORDER BY slot ASC, name ASC`, args });
  return res.rows.map(armorToObj);
}

async function getArmorPiece(id) {
  if (!id) throw new Error('ID armatura mancante');
  const res = await db.execute({ sql: 'SELECT * FROM armor_pieces WHERE id = ?', args: [id] });
  return res.rows.length ? armorToObj(res.rows[0]) : null;
}

async function createArmorPiece(d) {
  const name   = (d.name   || '').trim();
  const slot   = (d.slot   || '').trim().toLowerCase();
  const rarity = (d.rarity || '').trim().toLowerCase();
  if (!name)                                  throw new Error('Nome armatura obbligatorio');
  if (!VALID_ARMOR_SLOTS.includes(slot))      throw new Error('Slot non valido');
  if (!VALID_RARITIES_ITEM.includes(rarity))  throw new Error('Rarità non valida');

  const armor_set    = (d.armor_set    || '').trim().toLowerCase();
  const forte_contro = (d.forte_contro || '').trim();
  if (armor_set && !VALID_ARMOR_SETS.includes(armor_set)) throw new Error('Set armatura non valido');

  const id = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO armor_pieces (id,name,slot,rarity,armatura,forte_contro,armor_set,talisman_slots,status,submitted_by,confirmations,flags,timestamp)
          VALUES (?,?,?,?,?,?,?,?,'pending',?,0,0,?)`,
    args: [
      id, name, slot, rarity,
      d.armatura != null ? Number(d.armatura) : null,
      forte_contro, armor_set,
      d.talisman_slots != null ? Number(d.talisman_slots) : 0,
      (d.submitted_by||'').trim(),
      new Date().toISOString()
    ]
  });
  return { id, message: 'Armatura inviata per verifica!' };
}

// ─── Users ───────────────────────────────────────────────────────────────────

function userToObj(row) {
  return {
    id:          String(row.id),
    gamertag:    String(row.gamertag),
    provider:    String(row.provider),
    provider_id: String(row.provider_id || ''),
    avatar_url:  String(row.avatar_url  || ''),
    role:        String(row.role        || 'user'),
    contributor: Number(row.contributor || 0),
    created_at:  String(row.created_at  || ''),
  };
}

async function upsertUser({ provider, provider_id, gamertag, avatar_url }) {
  const existing = await db.execute({
    sql:  'SELECT * FROM users WHERE provider = ? AND provider_id = ?',
    args: [provider, provider_id]
  });

  if (existing.rows.length) {
    const u = existing.rows[0];
    await db.execute({
      sql:  'UPDATE users SET avatar_url = ? WHERE id = ?',
      args: [avatar_url, u.id]
    });
    return { ...userToObj(u), avatar_url, is_new: false };
  }

  // First user ever registered becomes admin automatically
  const adminCheck = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
  const role = Number(adminCheck.rows[0].cnt) === 0 ? 'admin' : 'user';

  const id = crypto.randomUUID();
  await db.execute({
    sql:  'INSERT INTO users (id, gamertag, provider, provider_id, avatar_url, role, contributor, created_at) VALUES (?,?,?,?,?,?,?,?)',
    args: [id, gamertag, provider, provider_id, avatar_url, role, role === 'admin' ? 1 : 0, new Date().toISOString()]
  });
  return { id, gamertag, provider, provider_id, avatar_url, role, contributor: role === 'admin' ? 1 : 0, is_new: true };
}

async function getUserById(userId) {
  const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
  return res.rows.length ? userToObj(res.rows[0]) : null;
}

async function updateGamertag(userId, gamertag) {
  gamertag = (gamertag || '').trim();
  if (!gamertag || gamertag.length < 2) throw new Error('Gamertag troppo corto (min 2 caratteri)');
  if (gamertag.length > 32)             throw new Error('Gamertag troppo lungo (max 32 caratteri)');
  const res = await db.execute({ sql: 'UPDATE users SET gamertag = ? WHERE id = ?', args: [gamertag, userId] });
  if (!res.rowsAffected) throw new Error('Utente non trovato');
  const u = await getUserById(userId);
  return u;
}

async function setContributor(userId, value) {
  const val = value ? 1 : 0;
  const res = await db.execute({ sql: 'UPDATE users SET contributor = ? WHERE id = ?', args: [val, userId] });
  if (!res.rowsAffected) throw new Error('Utente non trovato');
  const u = await getUserById(userId);
  return u;
}

const VALID_ROLES = ['user', 'mod', 'admin'];

async function updateUserRole(targetId, role) {
  if (!VALID_ROLES.includes(role)) throw new Error('Ruolo non valido (user/mod/admin)');
  const res = await db.execute({ sql: 'UPDATE users SET role = ? WHERE id = ?', args: [role, targetId] });
  if (!res.rowsAffected) throw new Error('Utente non trovato');
  return await getUserById(targetId);
}

async function listUsers({ search = '', page = 1, limit = 50 } = {}) {
  const conds = [];
  const args  = [];
  if (search && search.trim()) {
    const q = '%' + search.trim() + '%';
    conds.push('(gamertag LIKE ? OR provider LIKE ?)');
    args.push(q, q);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const countRes = await db.execute({ sql: `SELECT COUNT(*) as cnt FROM users ${where}`, args });
  const total    = Number(countRes.rows[0].cnt);
  const pages    = Math.max(1, Math.ceil(total / limit));
  const p        = Math.min(page, pages);
  const res = await db.execute({
    sql:  `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, limit, (p - 1) * limit]
  });
  return { users: res.rows.map(userToObj), total, page: p, pages };
}

module.exports = {
  initSchema,
  listBuilds, getBuild, createBuild, voteBuild, getStats,
  listWeapons, getWeapon, createWeapon,
  listArmorPieces, getArmorPiece, createArmorPiece,
  listHeroes, getHero, createHero,
  listServants, getServant, createServant,
  listGloves, getGlove, createGlove,
  confirmItem, adminSetStatus,
  upsertUser, getUserById, updateGamertag, setContributor, updateUserRole, listUsers,
};
