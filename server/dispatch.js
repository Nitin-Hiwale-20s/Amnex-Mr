// Dispatch logic shared by the API and the Excel importer
const { Serial } = require('./models');
const { keyOf } = require('./serials');

// Mark the serial numbers of a saved dispatch as DISPATCHED (location = where they were sent)
async function applyDispatch(d) {
  const missing = [];
  for (const line of d.lines) {
    const keys = (line.serials || []).map(keyOf);
    if (!keys.length) continue;
    const docs = await Serial.find({ serialKey: { $in: keys } }).select('serialKey material').lean();
    const have = new Set(docs.map(x => x.serialKey));
    line.serials.forEach(s => { if (!have.has(keyOf(s))) missing.push(s); });
    if (docs.length) await Serial.updateMany({ _id: { $in: docs.map(x => x._id) } }, { $set: { status: 'DISPATCHED', location: d.sentTo, dispatch: d._id } });
    if (!line.material && docs.length && new Set(docs.map(x => String(x.material))).size === 1) line.material = docs[0].material;
  }
  d.markModified('lines');
  await d.save();
  return { missing };
}

// Undo: serial numbers of this dispatch go back to RECEIVED
async function revertDispatch(id) {
  await Serial.updateMany({ dispatch: id }, { $set: { status: 'RECEIVED', location: '' }, $unset: { dispatch: '' } });
}

// A dispatch for the screen: every serial number tells whether it exists in the register
async function describeDispatch(d) {
  d = d.toObject ? d.toObject() : d;
  const keys = [...new Set(d.lines.flatMap(l => (l.serials || []).map(keyOf)))];
  const docs = keys.length ? await Serial.find({ serialKey: { $in: keys } }).populate('material', 'name').lean() : [];
  const byKey = new Map(docs.map(x => [x.serialKey, x]));
  d.lines = d.lines.map(l => {
    const info = (l.serials || []).map(s => {
      const x = byKey.get(keyOf(s));
      return { serialNo: s, found: !!x, item: x?.material?.name, other: !!(x && x.dispatch && String(x.dispatch) !== String(d._id)) };
    });
    return { ...l, serialInfo: info, missing: info.filter(i => !i.found).length, qtyMismatch: info.length > 0 && l.qty !== info.length };
  });
  d.units = d.lines.reduce((a, l) => a + (l.qty || 0), 0);
  d.missing = d.lines.reduce((a, l) => a + l.missing, 0);
  return d;
}

module.exports = { applyDispatch, revertDispatch, describeDispatch };
