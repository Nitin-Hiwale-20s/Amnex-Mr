const { Challan, Material, Delivery, Serial, Dispatch } = require('./models');
const { loadStats, decorate, cmp } = require('./stats');

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmtDate = d => (d ? new Date(d).toISOString().slice(0, 10).split('-').reverse().join('/') : '');
const STATUS_LABEL = { RECEIVED: 'Received', INSTALLED: 'Installed', UNDER_TESTING: 'Under Testing', SPARE: 'Spare', DISPATCHED: 'Dispatched' };
const ids = list => list.map(x => x._id);

// ----- shared filters (used by the screens and the reports) -----
async function serialQuery(q) {
  const f = {};
  if (q.material) f.material = q.material;
  else if (q.challan) f.material = { $in: ids(await Material.find({ challan: q.challan }).select('_id').lean()) };
  if (q.status) f.status = q.status;
  if (q.location) f.location = new RegExp(esc(q.location), 'i');
  if (q.q) { const rx = new RegExp(esc(String(q.q).trim()), 'i'); f.$or = [{ serialNo: rx }, { remarks: rx }]; }
  return f;
}
async function deliveryQuery(q) {
  const f = {};
  if (q.material) f.material = q.material;
  if (q.from || q.to) { f.date = {}; if (q.from) f.date.$gte = new Date(q.from); if (q.to) f.date.$lte = new Date(q.to); }
  if (q.q) {
    const rx = new RegExp(esc(String(q.q).trim()), 'i');
    const mids = ids(await Material.find({ name: rx }).select('_id').lean());
    f.$or = [{ remarks: rx }, { material: { $in: mids } }];
  }
  return f;
}
async function findDeliveries(q) {
  const list = await Delivery.find(await deliveryQuery(q)).populate('material', 'name model').lean();
  list.sort((a, b) => a.date - b.date || String(a._id).localeCompare(String(b._id)));
  return list;
}

const reports = {
  // Serial Number Register
  async serials(q) {
    const [list, mats, get] = await Promise.all([Serial.find(await serialQuery(q)).lean(), Material.find({}).populate('challan', 'dcNo').lean(), loadStats()]);
    const mm = new Map(mats.map(m => [String(m._id), decorate(m, get(m._id))]));
    list.sort((a, b) => String(a.material).localeCompare(String(b.material)) || a.seq - b.seq);
    const names = [];
    if (q.challan) names.push('DC: ' + ((await Challan.findById(q.challan).lean())?.dcNo || ''));
    if (q.material) names.push('Material: ' + (mm.get(String(q.material))?.name || ''));
    if (q.status) names.push('Status: ' + (STATUS_LABEL[q.status] || q.status));
    if (q.location) names.push('Location: ' + q.location);
    if (q.q) names.push('Search: ' + q.q);
    return {
      title: 'Material Serial Number Register',
      subtitle: (names.join('   |   ') || 'All materials') + '   |   As on ' + fmtDate(new Date()),
      columns: [
        { header: 'Sr', key: 'sr', width: 5 }, { header: 'Material Description', key: 'name', width: 24 }, { header: 'Model / Specification', key: 'model', width: 26 },
        { header: 'Unit Tag', key: 'tag', width: 11 }, { header: 'Serial Number (S/N)', key: 'serialNo', width: 22 }, { header: 'Status', key: 'status', width: 12 },
        { header: 'Location', key: 'location', width: 12 }, { header: 'Remarks', key: 'remarks', width: 18 },
      ],
      rows: list.map((s, i) => {
        const m = mm.get(String(s.material)) || {};
        return { sr: i + 1, name: m.name || '', model: m.model || '', tag: s.seq ? (m.expected >= s.seq ? `Unit ${s.seq} of ${m.expected}` : `Unit ${s.seq}`) : '', serialNo: s.serialNo, status: STATUS_LABEL[s.status] || s.status, location: s.location || '', remarks: s.remarks || '' };
      }),
    };
  },

  // Challan reconciliation (replaces the Excel "Challan Summary" sheet)
  async reconciliation(q) {
    const mf = q.challan ? { challan: q.challan } : { challan: { $ne: null } };
    const [mats, get, ch] = await Promise.all([Material.find(mf).populate('challan', 'dcNo').lean(), loadStats(), q.challan ? Challan.findById(q.challan).lean() : null]);
    const rows = mats.map(m => decorate(m, get(m._id))).sort((a, b) => cmp(a.challan?.dcNo, b.challan?.dcNo) || cmp(a.itemNo, b.itemNo) || cmp(a.name, b.name));
    const out = rows.map(m => ({ dc: m.challan?.dcNo || '', itemNo: m.itemNo || '', name: m.name, model: m.model || '', hsn: m.hsn || '', challanQty: m.challanQty, received: m.received, serials: m.serials, pending: m.pending, dispatched: m.dispatched, status: m.status }));
    const sum = k => out.reduce((a, r) => a + r[k], 0);
    if (out.length) out.push({ dc: '', itemNo: '', name: 'TOTAL', model: '', hsn: '', challanQty: sum('challanQty'), received: sum('received'), serials: sum('serials'), pending: sum('pending'), dispatched: sum('dispatched'), status: '', _total: true });
    const columns = [
      { header: 'Item No.', key: 'itemNo', width: 7 }, { header: 'Material Description', key: 'name', width: 26 }, { header: 'Model / Specification', key: 'model', width: 28 }, { header: 'HSN', key: 'hsn', width: 9 },
      { header: 'Challan Qty', key: 'challanQty', width: 9 }, { header: 'Received', key: 'received', width: 9 }, { header: 'Serials Entered', key: 'serials', width: 10 },
      { header: 'Pending Serials', key: 'pending', width: 10 }, { header: 'Dispatched', key: 'dispatched', width: 10 }, { header: 'Status', key: 'status', width: 11 },
    ];
    if (!q.challan) columns.unshift({ header: 'DC No', key: 'dc', width: 16 });
    return {
      title: 'Delivery Challan Reconciliation & Serial Number Tracker',
      subtitle: (ch ? `DC No: ${ch.dcNo}   |   Date: ${fmtDate(ch.date)}   |   Recipient: ${ch.recipient || '-'}` : 'All challans') + '   |   As on ' + fmtDate(new Date()),
      columns, rows: out,
    };
  },

  // Material Delivery Tracker
  async deliveries(q) {
    const list = await findDeliveries(q);
    const upd = list.reduce((a, d) => Math.max(a, +new Date(d.updatedAt || 0)), 0);
    const names = [];
    if (q.material) names.push('Material: ' + (list[0]?.material?.name || ''));
    if (q.from || q.to) names.push(`Period: ${q.from ? fmtDate(q.from) : 'start'} to ${q.to ? fmtDate(q.to) : 'today'}`);
    if (q.q) names.push('Search: ' + q.q);
    return {
      title: 'Material Delivery Tracker',
      subtitle: (names.join('   |   ') || 'All deliveries') + '   |   Updated on: ' + fmtDate(upd || new Date()),
      columns: [{ header: 'Sr', key: 'sr', width: 5 }, { header: 'Date', key: 'date', width: 11 }, { header: 'Material Name / Description', key: 'name', width: 46 }, { header: 'Quantity', key: 'qty', width: 10 }, { header: 'Remarks', key: 'remarks', width: 30 }],
      rows: list.map((d, i) => ({ sr: i + 1, date: fmtDate(d.date), name: d.material?.name || '', qty: d.qty, remarks: d.remarks || '' })),
    };
  },

  // Dispatch log / challan. With ?id= it is the printable challan of one dispatch; without, all dispatches
  async dispatch(q) {
    if (q.id) {
      const d = await Dispatch.findById(q.id).lean();
      if (!d) throw new Error('Dispatch not found');
      const rows = [];
      d.lines.forEach((l, i) => {
        const sn = [...(l.serials || []), ...(l.partNo ? ['Part No ' + l.partNo] : [])];
        (sn.length ? sn : ['']).forEach((s, k) => rows.push({ sr: k === 0 ? i + 1 : '', item: k === 0 ? l.description : '', qty: k === 0 ? l.qty : '', serial: s, date: fmtDate(l.date || d.date), remarks: k === 0 ? l.remarks || '' : '' }));
      });
      return {
        title: 'Equipment Dispatch Log / Challan',
        subtitle: `Company: ${d.company || '-'}   |   Date: ${fmtDate(d.date)}   |   Sent To: ${d.sentTo}   |   Reference: ${d.reference || '-'}`,
        columns: [{ header: 'Sr. No.', key: 'sr', width: 6 }, { header: 'Item Description', key: 'item', width: 34 }, { header: 'Unit Qty', key: 'qty', width: 8 }, { header: 'Item Serial No.', key: 'serial', width: 30 }, { header: 'Date', key: 'date', width: 11 }, { header: 'Remarks / Status', key: 'remarks', width: 34 }],
        rows,
      };
    }
    const list = await Dispatch.find({}).lean();
    list.sort((a, b) => a.date - b.date);
    const rows = [];
    list.forEach(d => d.lines.forEach(l => rows.push({ date: fmtDate(d.date), sentTo: d.sentTo, item: l.description, qty: l.qty, serials: (l.serials || []).join(', ') + (l.partNo ? (l.serials?.length ? ', ' : '') + 'Part No ' + l.partNo : ''), reference: d.reference || '' })));
    return {
      title: 'Equipment Dispatch Register', subtitle: 'All dispatches   |   As on ' + fmtDate(new Date()),
      columns: [{ header: 'Date', key: 'date', width: 11 }, { header: 'Sent To', key: 'sentTo', width: 16 }, { header: 'Item', key: 'item', width: 28 }, { header: 'Qty', key: 'qty', width: 6 }, { header: 'Serial Numbers', key: 'serials', width: 44 }, { header: 'Reference', key: 'reference', width: 26 }],
      rows,
    };
  },

  // Stock summary of every material
  async materials(q) {
    const mf = q.challan === 'none' ? { challan: null } : q.challan ? { challan: q.challan } : {};
    const [mats, get] = await Promise.all([Material.find(mf).populate('challan', 'dcNo').lean(), loadStats()]);
    const rows = mats.map(m => decorate(m, get(m._id))).sort((a, b) => cmp(a.challan?.dcNo || '~', b.challan?.dcNo || '~') || cmp(a.itemNo, b.itemNo) || cmp(a.name, b.name));
    const out = rows.map((m, i) => ({ sr: i + 1, name: m.name, model: m.model || '', dc: m.challan?.dcNo || '-', challanQty: m.challanQty || '', received: m.received, serials: m.trackSerial ? m.serials : '', installed: m.trackSerial ? m.INSTALLED : '', dispatched: m.dispatched, inStore: m.inStore, pending: m.trackSerial ? m.pending : '' }));
    return {
      title: 'Material Stock Summary', subtitle: 'Received, serial numbers entered, dispatched and in store   |   As on ' + fmtDate(new Date()),
      columns: [
        { header: 'Sr', key: 'sr', width: 5 }, { header: 'Material', key: 'name', width: 30 }, { header: 'Model / Specification', key: 'model', width: 24 }, { header: 'DC No', key: 'dc', width: 14 },
        { header: 'Challan Qty', key: 'challanQty', width: 9 }, { header: 'Received', key: 'received', width: 9 }, { header: 'Serials Entered', key: 'serials', width: 9 },
        { header: 'Installed', key: 'installed', width: 9 }, { header: 'Dispatched', key: 'dispatched', width: 10 }, { header: 'In Store', key: 'inStore', width: 9 }, { header: 'Pending Serials', key: 'pending', width: 9 },
      ],
      rows: out,
    };
  },
};

module.exports = { reports, serialQuery, findDeliveries, fmtDate, STATUS_LABEL };
