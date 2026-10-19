import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { fmt, qs, STATUSES } from '../constants.js';
import { Icon, Field, PageHead, toast } from '../ui.jsx';

const REPORTS = [
  { k: 'reconciliation', l: 'Challan reconciliation (challan qty, received, serials, pending)', f: ['challan'] },
  { k: 'serials', l: 'Serial number register', f: ['challan', 'material', 'status'] },
  { k: 'deliveries', l: 'Material delivery tracker', f: ['material', 'dates'] },
  { k: 'dispatch', l: 'Dispatch log / challan', f: ['dispatch'] },
  { k: 'materials', l: 'Material stock summary', f: ['challan'] },
];

export default function Reports() {
  const [f, setF] = useState({ name: 'reconciliation', challan: '', material: '', status: '', from: '', to: '', id: '' });
  const [challans, setChallans] = useState([]);
  const [mats, setMats] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [rep, setRep] = useState(null);
  useEffect(() => { api('/api/challans').then(setChallans).catch(() => {}); api('/api/materials').then(setMats).catch(() => {}); api('/api/dispatches').then(setDispatches).catch(() => {}); }, []);
  const def = REPORTS.find(r => r.k === f.name);
  const params = () => { const o = {}; if (def.f.includes('challan')) o.challan = f.challan; if (def.f.includes('material')) o.material = f.material; if (def.f.includes('status')) o.status = f.status; if (def.f.includes('dates')) { o.from = f.from; o.to = f.to; } if (def.f.includes('dispatch')) o.id = f.id; return qs(o); };
  useEffect(() => { setRep(null); api(`/api/reports/${f.name}${params()}`).then(setRep).catch(e => toast(e.message, 'err')); }, [f]);
  const dl = fmtx => download(`/api/export/${f.name}/${fmtx}${params()}`).catch(e => toast(e.message, 'err'));
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const mlist = f.challan && def.f.includes('challan') ? mats.filter(m => m.challan?._id === f.challan) : mats;

  return (
    <>
      <PageHead title="Reports" sub="Choose a report, set filters, then download Excel or PDF" />
      <div className="plate pad stack">
        <Field label="Report"><select value={f.name} onChange={e => setF({ ...f, name: e.target.value, id: '' })}>{REPORTS.map(r => <option key={r.k} value={r.k}>{r.l}</option>)}</select></Field>
        <div className="grid-3">
          {def.f.includes('challan') && <Field label="Challan"><select value={f.challan} onChange={e => setF({ ...f, challan: e.target.value, material: '' })}><option value="">All challans</option>{challans.map(c => <option key={c._id} value={c._id}>{c.dcNo}</option>)}</select></Field>}
          {def.f.includes('material') && <Field label="Material"><select value={f.material} onChange={set('material')}><option value="">All materials</option>{mlist.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}</select></Field>}
          {def.f.includes('status') && <Field label="Status"><select value={f.status} onChange={set('status')}><option value="">All</option>{STATUSES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}</select></Field>}
          {def.f.includes('dates') && <><Field label="From"><input type="date" value={f.from} onChange={set('from')} /></Field><Field label="To"><input type="date" value={f.to} onChange={set('to')} /></Field></>}
          {def.f.includes('dispatch') && <Field label="Dispatch"><select value={f.id} onChange={set('id')}><option value="">All dispatches</option>{dispatches.map(d => <option key={d._id} value={d._id}>{fmt(d.date)}, {d.sentTo}</option>)}</select></Field>}
        </div>
        <div className="grid-2">
          <button className="btn go" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Download Excel</button>
          <button className="btn stop" onClick={() => dl('pdf')}><Icon name="file" size={18} />Download PDF</button>
        </div>
      </div>
      {!rep && <p className="loading">Loading...</p>}
      {rep && (
        <div className="plate pad">
          <h3 className="plate-title">{rep.title}</h3>
          <p className="muted">{rep.subtitle}</p>
          <div className="tbl"><table>
            <thead><tr>{rep.columns.map(c => <th key={c.key}>{c.header}</th>)}</tr></thead>
            <tbody>
              {rep.rows.slice(0, 300).map((r, i) => <tr key={i} className={r._total ? 'tot' : ''}>{rep.columns.map(c => <td key={c.key}>{r[c.key]}</td>)}</tr>)}
              {!rep.rows.length && <tr><td colSpan={rep.columns.length} className="muted center">No data for the selected filters.</td></tr>}
            </tbody>
          </table></div>
          {rep.rows.length > 300 && <p className="muted">Showing the first 300 rows. The downloaded file has all {rep.rows.length}.</p>}
        </div>
      )}
    </>
  );
}
