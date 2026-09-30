require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.resolve(process.env.DATA_FILE || './data/db.json');
const ADMIN_ORIGIN = process.env.ADMIN_ORIGIN || 'http://localhost:3001';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-secret-change-me';

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.headers.origin === ADMIN_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ADMIN_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function loadDb() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveDb(db) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function safeEq(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function b64url(input) { return Buffer.from(input).toString('base64url'); }
function signToken() {
  const payload = b64url(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 12 }));
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('base64url');
  if (!safeEq(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Date.now();
  } catch { return false; }
}
function adminOnly(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Não autorizado' });
  next();
}
function clean(v, max = 250) { return typeof v === 'string' ? v.slice(0, max) : ''; }

app.get('/api/bootstrap', (req, res) => {
  const db = loadDb();
  res.json({ settings: db.settings, templates: db.templates.filter(t => t.active !== false) });
});

app.post('/api/track', (req, res) => {
  const db = loadDb();
  const body = req.body || {};
  const event = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    event: clean(body.event, 60),
    visitorId: clean(body.visitorId, 80),
    sessionId: clean(body.sessionId, 80),
    path: clean(body.path, 300),
    referrer: clean(body.referrer, 500),
    source: clean(body.source, 120),
    medium: clean(body.medium, 120),
    campaign: clean(body.campaign, 160),
    content: clean(body.content, 160),
    term: clean(body.term, 160),
    clickId: clean(body.clickId, 180),
    trackedLink: clean(body.trackedLink, 120),
    modelId: clean(body.modelId, 120),
    plan: clean(body.plan, 60),
    value: Number.isFinite(Number(body.value)) ? Number(body.value) : null,
    leadCode: clean(body.leadCode, 40),
    userAgent: clean(req.headers['user-agent'] || '', 350)
  };
  if (!event.event) return res.status(400).json({ error: 'Evento ausente' });
  db.events.push(event);
  if (db.events.length > 50000) db.events = db.events.slice(-50000);
  saveDb(db);
  res.status(201).json({ ok: true, id: event.id });
});

app.get('/r/:slug', (req, res) => {
  const db = loadDb();
  const link = db.trackedLinks.find(l => l.slug === req.params.slug && l.active !== false);
  if (!link) return res.redirect('/');
  link.clicks = (link.clicks || 0) + 1;
  link.lastClickAt = new Date().toISOString();
  saveDb(db);
  const url = new URL(link.target || '/', process.env.APP_URL || ('http://localhost:' + PORT));
  if (link.source) url.searchParams.set('utm_source', link.source);
  if (link.medium) url.searchParams.set('utm_medium', link.medium);
  if (link.campaign) url.searchParams.set('utm_campaign', link.campaign);
  if (link.content) url.searchParams.set('utm_content', link.content);
  url.searchParams.set('gs_link', link.slug);
  res.redirect(url.toString());
});

app.post('/api/admin/login', (req, res) => {
  if (!safeEq(req.body?.password || '', ADMIN_PASSWORD)) return res.status(401).json({ error: 'Senha inválida' });
  res.json({ token: signToken() });
});

app.get('/api/admin/summary', adminOnly, (req, res) => {
  const db = loadDb();
  const events = db.events;
  const visitors = new Set(events.map(e => e.visitorId).filter(Boolean)).size;
  const whatsapp = events.filter(e => e.event === 'WhatsAppClick');
  const modelViews = events.filter(e => e.event === 'ModelView');
  const bySource = {};
  const byModel = {};
  for (const e of events) {
    const source = e.source || (e.referrer ? 'referral' : 'direto');
    bySource[source] = (bySource[source] || 0) + 1;
    if (e.modelId) byModel[e.modelId] = (byModel[e.modelId] || 0) + 1;
  }
  res.json({
    totals: {
      events: events.length,
      visitors,
      modelViews: modelViews.length,
      whatsappClicks: whatsapp.length,
      conversion: visitors ? Number(((whatsapp.length / visitors) * 100).toFixed(1)) : 0
    },
    bySource: Object.entries(bySource).sort((a,b) => b[1]-a[1]).slice(0,10),
    byModel: Object.entries(byModel).sort((a,b) => b[1]-a[1]).slice(0,10),
    recent: events.slice(-30).reverse()
  });
});

app.get('/api/admin/events', adminOnly, (req, res) => {
  const db = loadDb();
  const limit = Math.min(Number(req.query.limit || 200), 1000);
  res.json(db.events.slice(-limit).reverse());
});

app.get('/api/admin/settings', adminOnly, (req, res) => res.json(loadDb().settings));
app.put('/api/admin/settings', adminOnly, (req, res) => {
  const db = loadDb();
  db.settings = {
    ...db.settings,
    ...req.body,
    plans: { ...db.settings.plans, ...(req.body.plans || {}) }
  };
  saveDb(db);
  res.json(db.settings);
});

app.get('/api/admin/templates', adminOnly, (req, res) => res.json(loadDb().templates));
app.post('/api/admin/templates', adminOnly, (req, res) => {
  const db = loadDb();
  const item = { ...req.body, id: req.body.id || crypto.randomUUID(), active: req.body.active !== false };
  db.templates.push(item);
  saveDb(db);
  res.status(201).json(item);
});
app.put('/api/admin/templates/:id', adminOnly, (req, res) => {
  const db = loadDb();
  const i = db.templates.findIndex(t => t.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Modelo não encontrado' });
  db.templates[i] = { ...db.templates[i], ...req.body, id: db.templates[i].id };
  saveDb(db);
  res.json(db.templates[i]);
});
app.delete('/api/admin/templates/:id', adminOnly, (req, res) => {
  const db = loadDb();
  db.templates = db.templates.filter(t => t.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/links', adminOnly, (req, res) => res.json(loadDb().trackedLinks));
app.post('/api/admin/links', adminOnly, (req, res) => {
  const db = loadDb();
  const slug = String(req.body.slug || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0,60);
  if (!slug) return res.status(400).json({ error: 'Slug inválido' });
  if (db.trackedLinks.some(l => l.slug === slug)) return res.status(409).json({ error: 'Slug já existe' });
  const item = {
    id: crypto.randomUUID(),
    slug,
    target: req.body.target || '/',
    source: req.body.source || '',
    medium: req.body.medium || '',
    campaign: req.body.campaign || '',
    content: req.body.content || '',
    active: true,
    clicks: 0
  };
  db.trackedLinks.push(item);
  saveDb(db);
  res.status(201).json(item);
});
app.delete('/api/admin/links/:id', adminOnly, (req, res) => {
  const db = loadDb();
  db.trackedLinks = db.trackedLinks.filter(l => l.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('GALVESTART público/API: http://localhost:' + PORT);
  if (ADMIN_SECRET === 'dev-secret-change-me' || ADMIN_PASSWORD === 'troque-esta-senha') {
    console.warn('ATENÇÃO: altere ADMIN_PASSWORD e ADMIN_SECRET antes de publicar.');
  }
});
