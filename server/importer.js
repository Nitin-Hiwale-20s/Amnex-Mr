// Reads the three kinds of Excel files used on this project:
//   1. AMNEX Material Serial Number Register (sheets "Serial Number Register" + "Challan Summary")
//   2. Material Delivery Tracker (sheet "Material Tracker")
//   3. Equipment Dispatch Log / Challan (sheet "Dispatch Details")
// Importing the same file twice is safe: nothing is duplicated.
const ExcelJS = require('exceljs');
const { Challan, Material, Delivery, Serial, Dispatch } = require('./models');
const { keyOf } = require('./serials');
const { applyDispatch } = require('./dispatch');

// ---------- small helpers ----------
const ERR = /^#(REF|N\/A|VALUE|DIV\/0|NAME|NULL|NUM)[!?]?$/;
function val(cell) {
  if (!cell || cell.type === ExcelJS.ValueType.Merge) return null;      // lower cells of a merged block are empty
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('error' in v) return null;
    if ('result' in v) v = v.result;
    else if (v.richText) v = v.richText.map(t => t.text).join('');
    else if ('text' in v) v = v.text;
    else return null;
  }
  if (typeof v === 'string') { v = v.trim(); if (!v || ERR.test(v)) return null; }
  return v === undefined ? null : v;
}
const cellsOf = (ws, r, n) => Array.from({ length: n }, (_, i) => val(ws.getCell(r, i + 1)));
const str = v => (v === null || v === undefined ? '' : String(v).trim());
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['with', 'and', 'for', 'of', 'the', 'a', 'an', 'to', 'in']);
const toks = s => new Set(norm(s).split(' ').filter(t => t && !STOP.has(t)));
function toDate(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(Date.UTC(y, +m[2] - 1, +m[1])); }
  }
  return null;
}
const dayKey = d => d.toISOString().slice(0, 10);
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const findRow = (ws, col, text, max = 30) => { for (let r = 1; r <= max; r++) if (str(val(ws.getCell(r, col))).toLowerCase() === text.toLowerCase()) return r; return 0; };
const guessTrack = name => !/(cable|patch|\bkit\b|sd card|manager|mounting|\bliu\b|loop)/i.test(name);
const statusOf = t => {
  const n = norm(t);
  if (n.startsWith('install')) return 'INSTALLED';
  if (n.includes('test')) return 'UNDER_TESTING';
  if (n.startsWith('spare')) return 'SPARE';
  if (n.startsWith('dispatch')) return 'DISPATCHED';
  return 'RECEIVED';
};

// Tracker names that are written differently from the challan name (name pattern of the challan item)
const BUILTIN = [
  ['adaptor', /aim65.*charging/], ['adaptor aim 65', /aim65.*charging/], ['cisco industrial g8', /ir1101/],
  ['ip phone wireless', /10 line/], ['cpu', /workstation/], ['printer a4 size', /a4/],
  ['video call controller delta', /video wall controller/], ['cosec vega cpmem prox', /cpm em prox/],
];

// Finds the material for a name used in the tracker / dispatch. Returns { mat, via } or null
function resolveMaterial(mats, name) {
  const n = norm(name);
  if (!n) return null;
  const exact = mats.filter(x => norm(x.name) === n || (x.aliases || []).some(a => norm(a) === n));
  if (exact.length) return { mat: exact[exact.length - 1], via: 'exact' };
  const b = BUILTIN.find(([a]) => a === n);
  if (b) { const m = mats.filter(x => x.challan && b[1].test(norm(x.name))); if (m.length) return { mat: m[m.length - 1], via: 'alias' }; }
  // similar name (only against challan items, and only when one item is clearly the best)
  const t = toks(name);
  if (t.size) {
    const scored = mats.filter(x => x.challan).map(x => {
      const mt = toks([x.name, x.model, ...(x.aliases || [])].join(' '));
      return { x, s: [...t].filter(w => mt.has(w)).length / t.size };
    }).sort((p, q) => q.s - p.s);
    if (scored.length && scored[0].s >= 0.75 && (scored.length === 1 || scored[0].s > scored[1].s)) return { mat: scored[0].x, via: 'similar' };
  }
  return null;
}
async function addAlias(mat, name) {
  if (norm(name) === norm(mat.name) || (mat.aliases || []).some(a => norm(a) === norm(name))) return;
  mat.aliases = [...(mat.aliases || []), name];
  await Material.updateOne({ _id: mat._id }, { $addToSet: { aliases: name } });
}

// ---------- 1. Serial Number Register (+ Challan Summary) ----------
async function importRegister(wb, userId, out) {
  const ws = wb.getWorksheet('Serial Number Register');
  const sum = wb.getWorksheet('Challan Summary');

  let dcNo = '', regDate = null, project = '', company = '';
  company = str(val(ws.getCell(1, 1))).split(/\s+-\s+/)[0];
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= 7; c++) {
    const t = str(val(ws.getCell(r, c)));
    if (/^Project:/i.test(t)) project = t.replace(/^Project:\s*/i, '');
    const m = t.match(/DC No:\s*([^\s|]+)/i); if (m) dcNo = m[1];
    const d = t.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i); if (d) regDate = toDate(d[1]);
  }
  let sumDate = null, recipient = '';
  if (sum) for (let r = 1; r <= 3; r++) {
    const t = str(val(sum.getCell(r, 1)));
    const m = t.match(/DC No:\s*([^\s|]+)/i); if (m && !dcNo) dcNo = m[1];
    if (m) { const d = t.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i); if (d) sumDate = toDate(d[1]); const rc = t.match(/Recipient:\s*(.+)$/i); if (rc) recipient = rc[1].trim(); }
  }
  if (!dcNo) throw new Error('DC No not found in the first rows of the file');

  let ch = await Challan.findOne({ dcNo });
  if (!ch) {
    const note = sumDate && regDate && +sumDate !== +regDate ? `Challan summary shows ${dayKey(sumDate)}, serial register shows ${dayKey(regDate)}. Please confirm the correct date.` : undefined;
    ch = await Challan.create({ dcNo, date: sumDate || regDate, company, recipient, project, notes: note });
    out.summary.push(`Challan ${dcNo} created`);
    if (note) out.warnings.push(`Challan ${dcNo}: ${note}`);
  } else out.summary.push(`Challan ${dcNo} already existed, adding to it`);

  const mats = await Material.find({ challan: ch._id });
  const mkey = (n, m) => norm(n) + '|' + norm(m);
  const byKey = new Map(mats.map(m => [mkey(m.name, m.model), m]));
  let madeMats = 0;

  // challan lines
  if (sum) {
    const h = findRow(sum, 1, 'Item No.');
    for (let r = (h || 4) + 1; r <= sum.rowCount; r++) {
      const [itemNo, name, model, hsn, qty] = cellsOf(sum, r, 5);
      if (str(name).toUpperCase() === 'TOTAL') break;
      if (!name) continue;
      const q = Number(qty) || 0;
      const ex = byKey.get(mkey(name, model));
      if (ex) { if (!ex.itemNo && itemNo) { ex.itemNo = str(itemNo); await ex.save(); } continue; }
      const m = await Material.create({ name: str(name), model: str(model), hsn: str(hsn), itemNo: str(itemNo), challan: ch._id, challanQty: q, trackSerial: q > 0 && guessTrack(str(name)) });
      byKey.set(mkey(name, model), m); madeMats++;
    }
  }

  // serial numbers
  const h = findRow(ws, 1, 'Sr. No.') || 4;
  const entries = [];
  const unitMax = new Map();
  for (let r = h + 1; r <= ws.rowCount; r++) {
    const [sr, desc, model, tag, serial, status, remarks] = cellsOf(ws, r, 7);
    if (!desc) continue;
    let m = byKey.get(mkey(desc, model));
    const of = str(tag).match(/Unit\s+(\d+)\s+of\s+(\d+)/i);
    if (!m) {
      m = await Material.create({ name: str(desc), model: str(model), challan: ch._id, challanQty: of ? +of[2] : 0, trackSerial: true });
      byKey.set(mkey(desc, model), m); madeMats++;
    }
    entries.push({ m, sr, serialNo: str(serial), seq: of ? +of[1] : 0, status: statusOf(status), remarks: str(remarks) });
    unitMax.set(String(m._id), (unitMax.get(String(m._id)) || 0) + 1);
  }
  // anything that has serial numbers in the register is serial-tracked
  for (const id of new Set(entries.filter(e => e.serialNo && !e.m.trackSerial).map(e => String(e.m._id)))) { await Material.updateOne({ _id: id }, { trackSerial: true }); }
  if (madeMats) out.summary.push(`${madeMats} material${madeMats > 1 ? 's' : ''} created from the challan`);

  const keys = entries.filter(e => e.serialNo).map(e => keyOf(e.serialNo));
  const existing = new Map();
  for (const part of chunk(keys, 400)) (await Serial.find({ serialKey: { $in: part } }).populate('material', 'name').lean()).forEach(s => existing.set(s.serialKey, s));
  const seen = new Map(), blanks = new Map(), fresh = [];
  let already = 0;
  const counter = new Map();
  for (const e of entries) {
    if (!e.serialNo) { blanks.set(e.m.name, (blanks.get(e.m.name) || 0) + 1); continue; }
    const key = keyOf(e.serialNo);
    const ex = existing.get(key);
    if (ex) {
      if (String(ex.material?._id) === String(e.m._id)) already++;
      else out.warnings.push(`Serial ${e.serialNo} (register Sr ${e.sr}, ${e.m.name}) already exists under "${ex.material?.name}". Skipped.`);
      continue;
    }
    if (seen.has(key)) { out.warnings.push(`Serial ${e.serialNo} is written twice in the register (Sr ${seen.get(key)} and Sr ${e.sr}, ${e.m.name}). Only the first was imported. One of them is probably a typing mistake.`); continue; }
    seen.set(key, e.sr);
    const c = (counter.get(String(e.m._id)) || 0) + 1; counter.set(String(e.m._id), c);
    fresh.push({ material: e.m._id, serialNo: e.serialNo, serialKey: key, seq: e.seq || c, status: e.status, remarks: e.remarks || undefined, createdBy: userId });
  }
  for (const part of chunk(fresh, 400)) await Serial.insertMany(part);
  out.counts = { Serial: fresh.length, Material: madeMats, Challan: out.summary.some(x => x.endsWith('created')) ? 1 : 0 };
  out.summary.push(`${fresh.length} serial numbers imported${already ? `, ${already} were already there` : ''}`);
  blanks.forEach((n, name) => out.warnings.push(`${name}: ${n} unit${n > 1 ? 's have' : ' has'} no serial number in the register yet.`));
}

// ---------- 2. Material Delivery Tracker ----------
async function importTracker(wb, userId, out) {
  const ws = wb.getWorksheet('Material Tracker');
  const h = findRow(ws, 1, 'Sr. No.') || 4;
  const mats = await Material.find({});
  const existing = new Map();
  (await Delivery.find({}).lean()).forEach(d => { const k = `${d.material}|${dayKey(d.date)}|${d.qty}`; existing.set(k, (existing.get(k) || 0) + 1); });
  const used = new Map();
  let added = 0, dup = 0, linked = 0, made = [];
  for (let r = h + 1; r <= ws.rowCount; r++) {
    const [sr, date, name, qty, remarks] = cellsOf(ws, r, 5);
    if (!name) continue;
    const d = toDate(date), q = Number(qty);
    if (!d || !Number.isFinite(q)) { out.warnings.push(`Tracker row ${r}: date or quantity is not readable (${str(name)}). Skipped.`); continue; }
    let found = resolveMaterial(mats, name), mat;
    if (found) { mat = found.mat; if (found.via !== 'exact') { await addAlias(mat, str(name)); linked++; } }
    else {
      mat = await Material.create({ name: str(name), trackSerial: guessTrack(str(name)) });
      mats.push(mat); made.push(mat.name);
    }
    const k = `${mat._id}|${dayKey(d)}|${q}`;
    used.set(k, (used.get(k) || 0) + 1);
    if ((existing.get(k) || 0) >= used.get(k)) { dup++; continue; }
    await Delivery.create({ material: mat._id, date: d, qty: q, remarks: str(remarks) || undefined });
    added++;
  }
  out.counts = { Delivery: added, Material: made.length };
  out.summary.push(`${added} delivery entries imported${dup ? `, ${dup} were already there` : ''}`);
  if (linked) out.summary.push(`${linked} entries were matched to challan items by name`);
  if (made.length) out.summary.push(`${made.length} new materials created (not on any challan): ${made.slice(0, 6).join(', ')}${made.length > 6 ? ', ...' : ''}`);
}

// ---------- 3. Equipment Dispatch Log ----------
async function importDispatch(wb, userId, out) {
  const ws = wb.getWorksheet('Dispatch Details');
  const h = findRow(ws, 1, 'Sr. No.', 20) || 6;
  const head = {};
  for (let r = 1; r < h; r++) for (let c = 1; c <= 6; c++) {
    const t = str(val(ws.getCell(r, c)));
    if (!t.endsWith(':')) continue;
    for (let k = c + 1; k <= 6; k++) { const v = val(ws.getCell(r, k)); if (v !== null) { head[norm(t)] = v; break; } }
  }
  const date = toDate(head['date']), sentTo = str(head['sent to location'] || head['sent to']), company = str(head['company']), reference = str(head['reference']);
  if (!date || !sentTo) throw new Error('Dispatch date or "Sent To / Location" not found at the top of the file');
  if (await Dispatch.findOne({ sentTo, date, reference: reference || undefined })) { out.summary.push(`Dispatch to ${sentTo} on ${dayKey(date)} was already imported. Nothing changed.`); return; }

  const lines = [];
  let cur = null;
  for (let r = h + 1; r <= ws.rowCount; r++) {
    const [sr, desc, qty, serial, ldate, remarks] = cellsOf(ws, r, 6);
    if (sr !== null || desc) {
      cur = { description: str(desc), qty: Number(qty) || 0, serials: [], date: toDate(ldate) || date, remarks: str(remarks) };
      lines.push(cur);
    } else if (cur && remarks && !cur.remarks) cur.remarks = str(remarks);
    if (cur && serial !== null) {
      const p = str(serial).match(/^part\s*no\.?\s*[:-]?\s*(.+)$/i);
      if (p) cur.partNo = p[1]; else cur.serials.push(str(serial));
    }
  }
  const mats = await Material.find({});
  for (const l of lines) {
    const hit = l.serials.length ? await Serial.find({ serialKey: { $in: l.serials.map(keyOf) } }).select('material').lean() : [];
    if (hit.length && new Set(hit.map(x => String(x.material))).size === 1) l.material = hit[0].material;
    else { const f = resolveMaterial(mats, l.description); if (f) l.material = f.mat._id; }
    l.serials = [...new Set(l.serials)];
  }
  const d = await Dispatch.create({ date, company, sentTo, reference, lines, createdBy: userId });
  const { missing } = await applyDispatch(d);
  const units = lines.reduce((a, l) => a + l.qty, 0);
  out.counts = { Dispatch: 1 };
  out.summary.push(`Dispatch to ${sentTo} (${dayKey(date)}) imported: ${lines.length} items, ${units} units`);
  if (missing.length) out.warnings.push(`Dispatch to ${sentTo}: ${missing.length} serial number${missing.length > 1 ? 's are' : ' is'} not in the Serial Register (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', ...' : ''}). Check for typing mistakes.`);
  lines.filter(l => l.material && l.qty !== l.serials.length && l.serials.length).forEach(l => out.warnings.push(`Dispatch line "${l.description}": quantity ${l.qty} but ${l.serials.length} serial numbers listed.`));
}

// ---------- entry point ----------
const KINDS = [
  { kind: 'register', label: 'Serial Number Register', sheet: 'Serial Number Register', run: importRegister, order: 1 },
  { kind: 'tracker', label: 'Material Delivery Tracker', sheet: 'Material Tracker', run: importTracker, order: 2 },
  { kind: 'dispatch', label: 'Dispatch Log', sheet: 'Dispatch Details', run: importDispatch, order: 3 },
];

async function importFiles(files, userId) {
  const loaded = [];
  const results = [];
  for (const f of files) {
    const out = { name: f.name, kind: null, ok: false, summary: [], warnings: [], counts: {} };
    results.push(out);
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(f.buffer);
      const k = KINDS.find(x => wb.getWorksheet(x.sheet));
      if (!k) { out.warnings.push('Not recognised. Expected a sheet named "Serial Number Register", "Material Tracker" or "Dispatch Details".'); continue; }
      out.kind = k.label;
      loaded.push({ wb, k, out });
    } catch (e) { out.warnings.push('Could not read this file: ' + e.message); }
  }
  loaded.sort((a, b) => a.k.order - b.k.order);       // register first, then tracker, then dispatch
  for (const { wb, k, out } of loaded) {
    try { await k.run(wb, userId, out); out.ok = true; }
    catch (e) { out.warnings.push('Import stopped: ' + e.message); }
  }
  return results;
}

module.exports = { importFiles };
