// Numbers that every screen needs: received, serials entered, pending, dispatched ... per material
const { Delivery, Serial, Dispatch } = require('./models');

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const cmp = (a, b) => collator.compare(a || '', b || '');
const blank = () => ({ received: 0, deliveries: 0, serials: 0, RECEIVED: 0, INSTALLED: 0, UNDER_TESTING: 0, SPARE: 0, DISPATCHED: 0, dispatched: 0 });

async function loadStats() {
  const [dAgg, sAgg, dispatches] = await Promise.all([
    Delivery.aggregate([{ $group: { _id: '$material', qty: { $sum: '$qty' }, n: { $sum: 1 } } }]),
    Serial.aggregate([{ $group: { _id: { m: '$material', s: '$status' }, n: { $sum: 1 } } }]),
    Dispatch.find({}, 'lines.material lines.qty').lean(),
  ]);
  const map = new Map();
  const get = id => { id = String(id); if (!map.has(id)) map.set(id, blank()); return map.get(id); };
  dAgg.forEach(a => { const o = get(a._id); o.received += a.qty; o.deliveries += a.n; });
  sAgg.forEach(a => { const o = get(a._id.m); o[a._id.s] = (o[a._id.s] || 0) + a.n; o.serials += a.n; });
  dispatches.forEach(d => (d.lines || []).forEach(l => { if (l.material) get(l.material).dispatched += l.qty || 0; }));
  return get;
}

// Add the calculated fields and the "needs attention" flags to a material
function decorate(m, s) {
  const challanQty = m.challanQty || 0;
  const expected = challanQty > 0 ? challanQty : s.received;
  const pending = m.trackSerial ? Math.max(0, expected - s.serials) : 0;      // like the Excel "Pending Serial Nos": challan qty - serials entered
  const toEnter = m.trackSerial ? Math.max(0, s.received - s.serials) : 0;     // units that are here but have no serial number yet
  const inStore = Math.max(0, s.received - s.dispatched);
  let status;
  if (!m.trackSerial) status = challanQty === 0 && s.received === 0 ? 'N/A' : 'Qty only';
  else if (expected === 0 && s.serials === 0) status = 'N/A';
  else if (pending === 0) status = 'Complete';
  else status = s.serials === 0 ? 'Not started' : 'Partial';

  const flags = [];
  if (toEnter > 0) flags.push({ type: 'pending', level: s.serials > 0 ? 'warn' : 'info', text: `${toEnter} delivered unit${toEnter > 1 ? 's have' : ' has'} no serial number yet (${s.serials} of ${s.received} entered)` });
  else if (pending > 0 && s.received >= expected) flags.push({ type: 'pending', level: 'warn', text: `${pending} serial number${pending > 1 ? 's' : ''} still to enter (${s.serials} of ${expected})` });
  if (challanQty > 0 && s.received < challanQty) flags.push({ type: 'short', level: 'info', text: `Challan says ${challanQty}, received ${s.received}: ${challanQty - s.received} not delivered yet` });
  if (m.trackSerial && s.received > 0 && s.serials > s.received) flags.push({ type: 'over', level: 'warn', text: `${s.serials} serial numbers entered but only ${s.received} delivered. Check the delivery tracker or the serial list` });
  if (s.dispatched > s.received && s.received > 0) flags.push({ type: 'overdispatch', level: 'warn', text: `${s.dispatched} dispatched but only ${s.received} received` });
  return { ...m, ...s, challanQty, expected, pending, toEnter, inStore, status, flags };
}

module.exports = { loadStats, decorate, cmp, collator };
