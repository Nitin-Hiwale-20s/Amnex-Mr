const { connect } = require('./db');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const { Challan, Material, Delivery, Serial, Dispatch, Activity, User, STATUSES } = require('./models');
const { loadStats, decorate, cmp } = require('./stats');
const { reports, serialQuery, findDeliveries } = require('./reports');
const { toExcel, toPdf } = require('./exporters');
const { parseSerials, splitSerials, keyOf } = require('./serials');
const { applyDispatch, revertDispatch, describeDispatch } = require('./dispatch');
const { importFiles } = require('./importer');
const { router: authRouter, auth, need, adminOnly, wrap, logActivity } = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.get('/api/health', (_, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

// Make sure MongoDB is connected before any other /api route (needed on serverless; cheap when already connected)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
  try { await connect(); next(); }
  catch (err) { console.error(err.message); res.status(503).json({ error: 'Database is not reachable. Check MONGODB_URI and Atlas Network Access (0.0.0.0/0).' }); }
});
app.use('/api', authRouter); // /auth/* and /users

const api = express.Router();
api.use(auth);
const view = need('inventory', 'view'), edit = need('inventory', 'edit');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, typeof o[k] === 'string' ? o[k].trim() : o[k]]));
const found = x => { if (!x) throw new Error('Not found (it may have been deleted)'); return x; };
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asDate = v => { const d = new Date(v); if (!v || isNaN(d)) throw new Error('Enter a valid date'); return d; };
const guessTrack = name => !/(cable|patch|\bkit\b|sd card|manager|mounting|\bliu\b|loop)/i.test(name);
const sortMats = list => list.sort((a, b) => cmp(a.challan?.dcNo || '~', b.challan?.dcNo || '~') || cmp(a.itemNo, b.itemNo) || cmp(a.name, b.name));
const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
const log = logActivity;

// ---------- Dashboard ----------
api.get('/summary', view, wrap(async (_, res) => {
  const [mats, get, challans, dispatches, dels] = await Promise.all([
    Material.find({}).populate('challan', 'dcNo').lean(), loadStats(), Challan.countDocuments(), Dispatch.find({}).sort({ date: -1 }).lean(),
    Delivery.find({}).sort({ date: -1, createdAt: -1 }).limit(6).populate('material', 'name').lean(),
  ]);
  const d = mats.map(m => decorate(m, get(m._id)));
  const issues = d.flatMap(m => m.flags.map(f => ({ ...f, material: m._id, name: m.name, dc: m.challan?.dcNo }))).sort((a, b) => (a.level === 'warn' ? 0 : 1) - (b.level === 'warn' ? 0 : 1));
  res.json({
    challans, materials: mats.length, challanQty: sum(d, 'challanQty'), received: sum(d, 'received'), serials: sum(d, 'serials'), toEnter: sum(d, 'toEnter'),
    installed: sum(d, 'INSTALLED'), spare: sum(d, 'SPARE'), testing: sum(d, 'UNDER_TESTING'), dispatched: dispatches.reduce((a, x) => a + sum(x.lines, 'qty'), 0), inStore: sum(d, 'inStore'), dispatchCount: dispatches.length,
    issues, recentDeliveries: dels, recentDispatches: dispatches.slice(0, 5).map(x => ({ _id: x._id, date: x.date, sentTo: x.sentTo, reference: x.reference, units: sum(x.lines, 'qty'), items: x.lines.length })),
  });
}));

// ---------- Challans ----------
const CHALLAN_FIELDS = ['dcNo', 'date', 'company', 'recipient', 'project', 'notes'];
api.get('/challans', view, wrap(async (_, res) => {
  const [list, mats, get] = await Promise.all([Challan.find({}).lean(), Material.find({ challan: { $ne: null } }).lean(), loadStats()]);
  const d = mats.map(m => decorate(m, get(m._id)));
  const out = list.map(c => {
    const own = d.filter(m => String(m.challan) === String(c._id));
    return { ...c, items: own.length, challanQty: sum(own, 'challanQty'), received: sum(own, 'received'), serials: sum(own, 'serials'), pending: sum(own, 'pending') };
  }).sort((a, b) => (b.date || 0) - (a.date || 0));
  res.json(out);
}));
api.post('/challans', edit, wrap(async (req, res) => {
  const b = pick(req.body, CHALLAN_FIELDS); if (b.date) b.date = asDate(b.date); else delete b.date;
  const c = await Challan.create(b);
  log(req, 'add', 'Challan', 1, `Challan ${c.dcNo}`);
  res.status(201).json(c);
}));
api.put('/challans/:id', edit, wrap(async (req, res) => {
  const b = pick(req.body, CHALLAN_FIELDS); if (b.date) b.date = asDate(b.date); else if (b.date === '') b.date = null;
  const c = found(await Challan.findByIdAndUpdate(req.params.id, b, { new: true, runValidators: true }));
  log(req, 'edit', 'Challan', 1, `Challan ${c.dcNo}`);
  res.json(c);
}));
api.delete('/challans/:id', edit, wrap(async (req, res) => {   // materials stay, they are just no longer on a challan
  await Material.updateMany({ challan: req.params.id }, { $unset: { challan: '' } });
  const c = await Challan.findByIdAndDelete(req.params.id);
  log(req, 'delete', 'Challan', 1, `Challan ${c?.dcNo || ''}`);
  res.json({ ok: true });
}));
api.get('/challans/:id', view, wrap(async (req, res) => {
  const ch = found(await Challan.findById(req.params.id).lean());
  const [mats, get] = await Promise.all([Material.find({ challan: ch._id }).populate('challan', 'dcNo').lean(), loadStats()]);
  const items = sortMats(mats.map(m => decorate(m, get(m._id))));
  res.json({ challan: ch, items, totals: { challanQty: sum(items, 'challanQty'), received: sum(items, 'received'), serials: sum(items, 'serials'), pending: sum(items, 'pending'), dispatched: sum(items, 'dispatched') } });
}));

// ---------- Materials ----------
const MATERIAL_FIELDS = ['name', 'model', 'hsn', 'itemNo', 'challan', 'challanQty', 'trackSerial', 'aliases'];
const cleanMaterial = b => {
  const o = pick(b, MATERIAL_FIELDS);
  if ('challan' in o && !o.challan) o.challan = null;
  if ('challanQty' in o) o.challanQty = Math.max(0, Number(o.challanQty) || 0);
  if (typeof o.aliases === 'string') o.aliases = o.aliases.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  return o;
};
api.get('/materials', view, wrap(async (req, res) => {
  const f = {};
  if (req.query.challan === 'none') f.challan = null; else if (req.query.challan) f.challan = req.query.challan;
  if (req.query.q) { const rx = new RegExp(esc(req.query.q.trim()), 'i'); f.$or = [{ name: rx }, { model: rx }, { aliases: rx }, { hsn: rx }]; }
  const [mats, get] = await Promise.all([Material.find(f).populate('challan', 'dcNo').lean(), loadStats()]);
  let list = mats.map(m => decorate(m, get(m._id)));
  if (req.query.attention === '1') list = list.filter(m => m.flags.length);
  res.json(sortMats(list));
}));
api.post('/materials', edit, wrap(async (req, res) => {
  const b = cleanMaterial(req.body);
  if (b.trackSerial === undefined) b.trackSerial = guessTrack(b.name || '');
  const m = await Material.create(b);
  log(req, 'add', 'Material', 1, m.name);
  res.status(201).json(m);
}));
api.put('/materials/:id', edit, wrap(async (req, res) => {
  const m = found(await Material.findByIdAndUpdate(req.params.id, cleanMaterial(req.body), { new: true, runValidators: true }));
  log(req, 'edit', 'Material', 1, m.name);
  res.json(m);
}));
api.delete('/materials/:id', edit, wrap(async (req, res) => {
  const id = req.params.id;
  const gone = await Serial.countDocuments({ material: id });
  await Serial.deleteMany({ material: id });
  await Delivery.deleteMany({ material: id });
  for (const d of await Dispatch.find({ 'lines.material': id })) { d.lines.forEach(l => { if (String(l.material) === id) l.material = undefined; }); d.markModified('lines'); await d.save(); }
  const m = await Material.findByIdAndDelete(id);
  log(req, 'delete', 'Material', 1, `${m?.name || ''}${gone ? ` (with ${gone} serial numbers)` : ''}`);
  res.json({ ok: true });
}));
api.get('/materials/:id', view, wrap(async (req, res) => {
  const m = found(await Material.findById(req.params.id).populate('challan', 'dcNo date').lean());
  const [get, serials, deliveries, dispatches] = await Promise.all([
    loadStats(), Serial.find({ material: m._id }).sort({ seq: 1 }).lean(),
    Delivery.find({ material: m._id }).sort({ date: 1 }).lean(), Dispatch.find({ 'lines.material': m._id }).sort({ date: -1 }).lean(),
  ]);
  const dm = decorate(m, get(m._id));
  serials.sort((a, b) => a.seq - b.seq || cmp(a.serialNo, b.serialNo));
  res.json({
    material: dm, serials, deliveries,
    dispatches: dispatches.flatMap(d => d.lines.filter(l => String(l.material) === String(m._id)).map(l => ({ dispatch: d._id, date: d.date, sentTo: d.sentTo, reference: d.reference, qty: l.qty, serials: l.serials, partNo: l.partNo, remarks: l.remarks }))),
  });
}));
api.post('/materials/:id/serials', edit, wrap(async (req, res) => {
  const m = found(await Material.findById(req.params.id).lean());
  const list = parseSerials(req.body);
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'RECEIVED';
  const have = await Serial.find({ serialKey: { $in: list.map(keyOf) } }).populate('material', 'name').lean();
  const haveKeys = new Set(have.map(x => x.serialKey));
  const fresh = list.filter(s => !haveKeys.has(keyOf(s)));
  const top = await Serial.find({ material: m._id }).sort({ seq: -1 }).limit(1).lean();
  let seq = top[0]?.seq || 0;
  if (fresh.length) await Serial.insertMany(fresh.map(serialNo => ({
    material: m._id, serialNo, serialKey: keyOf(serialNo), seq: ++seq, status, remarks: String(req.body.remarks || '').trim() || undefined, createdBy: req.user._id,
  })));
  if (fresh.length) log(req, 'add', 'Serial', fresh.length, `${fresh.length} serial number${fresh.length > 1 ? 's' : ''} added to ${m.name}`);
  res.status(201).json({ added: fresh.length, skipped: have.map(x => ({ serialNo: x.serialNo, material: x.material?.name })) });
}));

// ---------- Serial numbers (whole register) ----------
api.get('/serials', view, wrap(async (req, res) => {
  const f = await serialQuery(req.query);
  const size = Math.min(500, Math.max(10, parseInt(req.query.size, 10) || 100)), page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [total, rows, sAgg] = await Promise.all([
    Serial.countDocuments(f),
    Serial.find(f).sort({ material: 1, seq: 1 }).skip((page - 1) * size).limit(size).populate({ path: 'material', select: 'name model challan', populate: { path: 'challan', select: 'dcNo' } }).lean(),
    Serial.aggregate([{ $match: f }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ total, page, size, rows, byStatus: Object.fromEntries(sAgg.map(a => [a._id, a.n])) });
}));
api.put('/serials/:id', edit, wrap(async (req, res) => {
  const b = pick(req.body, ['serialNo', 'status', 'remarks', 'location']);
  if ('serialNo' in b) {
    if (!b.serialNo) throw new Error('Serial number cannot be empty');
    const other = await Serial.findOne({ serialKey: keyOf(b.serialNo), _id: { $ne: req.params.id } }).populate('material', 'name').lean();
    if (other) throw new Error(`${b.serialNo} already exists under "${other.material?.name}"`);
    b.serialKey = keyOf(b.serialNo);
  }
  const sr = found(await Serial.findByIdAndUpdate(req.params.id, b, { new: true, runValidators: true }));
  log(req, 'edit', 'Serial', 1, `${sr.serialNo}${b.status ? ' set to ' + b.status : ''}`);
  res.json(sr);
}));
api.delete('/serials/:id', edit, wrap(async (req, res) => {
  const sr = await Serial.findByIdAndDelete(req.params.id);
  log(req, 'delete', 'Serial', 1, sr?.serialNo);
  res.json({ ok: true });
}));
api.post('/serials/bulk', edit, wrap(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (req.body.action === 'delete') { const n = (await Serial.deleteMany({ _id: { $in: ids } })).deletedCount; log(req, 'delete', 'Serial', n, `${n} serial numbers deleted`); return res.json({ deleted: n }); }
  if (!STATUSES.includes(req.body.status)) throw new Error('Choose a status');
  const set = { status: req.body.status };
  if (typeof req.body.location === 'string') set.location = req.body.location.trim();
  const n = (await Serial.updateMany({ _id: { $in: ids } }, { $set: set })).modifiedCount;
  log(req, 'edit', 'Serial', n, `${n} serial numbers set to ${req.body.status}`);
  res.json({ updated: n });
}));

// ---------- Deliveries (Material Delivery Tracker) ----------
api.get('/deliveries', view, wrap(async (req, res) => {
  const list = await findDeliveries(req.query);
  res.json({ rows: list, total: sum(list, 'qty'), updatedOn: list.reduce((a, d) => Math.max(a, +new Date(d.updatedAt || 0)), 0) || null });
}));
async function materialFor(b) {
  if (b.material) return found(await Material.findById(b.material)).id;
  const name = String(b.newMaterial || '').trim();
  if (!name) throw new Error('Choose a material or type a new material name');
  const ex = await Material.findOne({ name: new RegExp('^' + esc(name) + '$', 'i') });
  return (ex || (await Material.create({ name, trackSerial: guessTrack(name) }))).id;
}
api.post('/deliveries', edit, wrap(async (req, res) => {
  const qty = Number(req.body.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error('Enter a valid quantity');
  const d = await Delivery.create({ material: await materialFor(req.body), date: asDate(req.body.date), qty, remarks: String(req.body.remarks || '').trim() || undefined });
  log(req, 'add', 'Delivery', 1, `${qty} x ${(await Material.findById(d.material).lean())?.name || ''}`);
  res.status(201).json(d);
}));
api.put('/deliveries/:id', edit, wrap(async (req, res) => {
  const qty = Number(req.body.qty);
  if (!Number.isFinite(qty) || qty < 0) throw new Error('Enter a valid quantity');
  const d = found(await Delivery.findByIdAndUpdate(req.params.id, { material: await materialFor(req.body), date: asDate(req.body.date), qty, remarks: String(req.body.remarks || '').trim() }, { new: true }));
  log(req, 'edit', 'Delivery', 1, `${qty} x ${(await Material.findById(d.material).lean())?.name || ''}`);
  res.json(d);
}));
api.delete('/deliveries/:id', edit, wrap(async (req, res) => {
  const d = await Delivery.findByIdAndDelete(req.params.id);
  log(req, 'delete', 'Delivery', 1, d ? `${d.qty} x ${(await Material.findById(d.material).lean())?.name || ''}` : '');
  res.json({ ok: true });
}));

// ---------- Dispatches ----------
function dispatchBody(b) {
  const lines = (Array.isArray(b.lines) ? b.lines : []).map(l => {
    const serials = splitSerials(l.serialsText !== undefined ? l.serialsText : (l.serials || []).join('\n'));
    const description = String(l.description || '').trim();
    return { material: l.material || undefined, description, serials, qty: Number.isFinite(Number(l.qty)) && l.qty !== '' ? Number(l.qty) : serials.length, partNo: String(l.partNo || '').trim() || undefined, date: l.date ? asDate(l.date) : undefined, remarks: String(l.remarks || '').trim() || undefined };
  }).filter(l => l.description || l.serials.length || l.material);
  if (!lines.length) throw new Error('Add at least one item to the dispatch');
  if (!String(b.sentTo || '').trim()) throw new Error('Enter where the material is sent');
  return { date: asDate(b.date), company: String(b.company || '').trim(), sentTo: b.sentTo.trim(), reference: String(b.reference || '').trim(), notes: String(b.notes || '').trim(), lines };
}
api.get('/dispatches', view, wrap(async (_, res) => {
  const list = await Dispatch.find({}).sort({ date: -1, createdAt: -1 }).lean();
  res.json(list.map(d => ({ _id: d._id, date: d.date, company: d.company, sentTo: d.sentTo, reference: d.reference, items: d.lines.length, units: sum(d.lines, 'qty') })));
}));
api.get('/dispatches/:id', view, wrap(async (req, res) => res.json(await describeDispatch(found(await Dispatch.findById(req.params.id))))));
api.post('/dispatches', edit, wrap(async (req, res) => {
  const d = await Dispatch.create({ ...dispatchBody(req.body), createdBy: req.user._id });
  const { missing } = await applyDispatch(d);
  log(req, 'add', 'Dispatch', 1, `To ${d.sentTo}: ${sum(d.lines, 'qty')} units`);
  res.status(201).json({ id: d.id, missing });
}));
api.put('/dispatches/:id', edit, wrap(async (req, res) => {
  const d = found(await Dispatch.findById(req.params.id));
  await revertDispatch(d._id);
  Object.assign(d, dispatchBody(req.body)); d.markModified('lines');
  await d.save();
  const { missing } = await applyDispatch(d);
  log(req, 'edit', 'Dispatch', 1, `To ${d.sentTo}: ${sum(d.lines, 'qty')} units`);
  res.json({ id: d.id, missing });
}));
api.delete('/dispatches/:id', edit, wrap(async (req, res) => {
  await revertDispatch(req.params.id);
  const d = await Dispatch.findByIdAndDelete(req.params.id);
  log(req, 'delete', 'Dispatch', 1, d ? `To ${d.sentTo}` : '');
  res.json({ ok: true });
}));

// ---------- Activity (admin only): who added how much data ----------
const dayRange = q => {   // from (inclusive) and until (exclusive) are full timestamps sent by the browser, so the user's own midnight is used
  const f = {};
  if (q.from || q.until) { f.createdAt = {}; if (q.from) f.createdAt.$gte = new Date(q.from); if (q.until) f.createdAt.$lt = new Date(q.until); }
  return f;
};
api.get('/activity/summary', adminOnly, wrap(async (req, res) => {
  const [users, rows] = await Promise.all([User.find({}).lean(), Activity.find(dayRange(req.query)).select('user action entity count createdAt').lean()]);
  const blankUser = (id, u) => ({ user: id, name: u?.name || 'Deleted user', role: u?.role || '', active: !!u?.active, added: {}, imported: {}, edited: 0, deleted: 0, total: 0, lastAt: null });
  const byUser = new Map(users.map(u => [String(u._id), blankUser(String(u._id), u)]));
  for (const a of rows) {
    const id = String(a.user);
    if (!byUser.has(id)) byUser.set(id, blankUser(id));
    const o = byUser.get(id), n = a.count || 0;
    if (a.action === 'add') { o.added[a.entity] = (o.added[a.entity] || 0) + n; o.total += n; }
    else if (a.action === 'import') { o.imported[a.entity] = (o.imported[a.entity] || 0) + n; o.total += n; }
    else if (a.action === 'edit') o.edited += n;
    else if (a.action === 'delete') o.deleted += n;
    if (!o.lastAt || a.createdAt > o.lastAt) o.lastAt = a.createdAt;
  }
  res.json([...byUser.values()].sort((a, b) => b.total - a.total || String(a.name).localeCompare(b.name)));
}));
api.get('/activity', adminOnly, wrap(async (req, res) => {
  const f = dayRange(req.query);
  ['user', 'entity', 'action'].forEach(k => { if (req.query[k]) f[k] = req.query[k]; });
  const size = Math.min(200, Math.max(10, parseInt(req.query.size, 10) || 50)), page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const [total, rows] = await Promise.all([Activity.countDocuments(f), Activity.find(f).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean()]);
  res.json({ total, page, size, rows });
}));

// ---------- Import Excel ----------
api.post('/import', edit, upload.array('files', 10), wrap(async (req, res) => {
  if (!req.files?.length) throw new Error('Choose at least one Excel (.xlsx) file');
  const results = await importFiles(req.files.map(f => ({ name: f.originalname, buffer: f.buffer })), req.user._id);
  results.forEach(r => Object.entries(r.counts || {}).forEach(([entity, n]) => { if (n > 0) log(req, 'import', entity, n, `Imported from ${r.name}`); }));
  res.json(results);
}));

// ---------- Reports / Excel / PDF ----------
api.get('/reports/:name', view, wrap(async (req, res) => {
  const fn = reports[req.params.name];
  if (!fn) return res.status(404).json({ error: 'Unknown report' });
  res.json(await fn(req.query));
}));
api.get('/export/:name/:fmt', view, wrap(async (req, res) => {
  const fn = reports[req.params.name];
  if (!fn) return res.status(404).json({ error: 'Unknown report' });
  const rep = await fn(req.query);
  const filename = `ITMS_${req.params.name}_${new Date().toISOString().slice(0, 10)}`;
  if (req.params.fmt === 'excel') return toExcel(rep, res, filename);
  if (req.params.fmt === 'pdf') return toPdf(rep, res, filename);
  res.status(400).json({ error: 'fmt must be excel or pdf' });
}));
app.use('/api', api);
app.use((err, req, res, next) => { res.status(400).json({ error: err.message || 'Something went wrong' }); }); // e.g. upload too large

const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_, res) => res.sendFile(path.join(dist, 'index.html')));
}

module.exports = app; // used by Vercel (api/index.js)

// Normal server mode (local / Render): connect first, then listen
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connect()
    .then(() => app.listen(PORT, '0.0.0.0', () => console.log('Server running on port ' + PORT)))
    .catch(err => { console.error(err.message); process.exit(1); });
}
