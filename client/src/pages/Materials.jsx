import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { can, num, qs } from '../constants.js';
import { Icon, PageHead, Empty, Progress, toast } from '../ui.jsx';
import { MaterialForm } from '../parts.jsx';

export const statusClass = s => ({ Complete: 'ok', Partial: 'warn', 'Not started': 'info', 'Qty only': 'mut', 'N/A': 'mut' }[s] || 'mut');

export default function Materials({ user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [f, setF] = useState({ q: '', challan: '', attention: '' });
  const [list, setList] = useState(null);
  const [challans, setChallans] = useState([]);
  const [m, setM] = useState(null);
  useEffect(() => { api('/api/challans').then(setChallans).catch(() => {}); }, []);
  const load = () => api('/api/materials' + qs(f)).then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [f]);
  const dl = fmt => download(`/api/export/materials/${fmt}${qs({ challan: f.challan })}`).catch(e => toast(e.message, 'err'));

  return (
    <>
      <PageHead title="Materials" sub="Every item with challan quantity, delivered, serial numbers and dispatch"
        action={<>
          <button className="btn" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Excel</button>
          <button className="btn" onClick={() => dl('pdf')}><Icon name="file" size={18} />PDF</button>
          {canEdit && <button className="btn primary" onClick={() => setM({})}><Icon name="plus" size={18} />Add material</button>}
        </>} />
      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Search material, model or HSN" /></div>
        <select className="auto" value={f.challan} onChange={e => setF({ ...f, challan: e.target.value })}>
          <option value="">All challans</option><option value="none">Not on a challan</option>{challans.map(c => <option key={c._id} value={c._id}>{c.dcNo}</option>)}
        </select>
        <label className="switch tight"><input type="checkbox" checked={!!f.attention} onChange={e => setF({ ...f, attention: e.target.checked ? '1' : '' })} /><span>Needs attention</span></label>
      </div>
      {!list && <p className="loading">Loading...</p>}
      {list && !list.length && <Empty title="No materials" text="Nothing matches. Add a material, or import your Excel files from the Import page." />}
      {list && list.length > 0 && (
        <div className="plate"><div className="tbl"><table>
          <thead><tr><th>Item</th><th>Material</th><th className="num">Challan</th><th className="num">Received</th><th>Serial numbers</th><th className="num">Dispatched</th><th className="num">In store</th><th>Status</th></tr></thead>
          <tbody>
            {list.map(x => (
              <tr key={x._id} className="click" onClick={() => go('material', { id: x._id })}>
                <td className="muted nowrap">{x.itemNo || '-'}</td>
                <td><b>{x.name}</b>{x.model && <small className="muted block clip">{x.model}</small>}{x.challan && <small className="muted block">{x.challan.dcNo}</small>}</td>
                <td className="num">{x.challanQty || <span className="muted">-</span>}</td>
                <td className="num"><b className={x.challanQty > x.received ? 'warn-t' : ''}>{x.received}</b></td>
                <td className="sercol">{x.trackSerial ? <><span className="nums"><b>{x.serials}</b> / {x.expected || 0}</span><Progress value={x.serials} max={x.expected} warn={x.serials > x.received && x.received > 0} /></> : <span className="muted">Qty only</span>}</td>
                <td className="num">{x.dispatched || <span className="muted">-</span>}</td>
                <td className="num">{x.inStore}</td>
                <td><span className={'pill ' + statusClass(x.status)}>{x.status}</span>{x.flags.length > 0 && <span className="dot-warn" title={x.flags.map(f => f.text).join('\n')}><Icon name="alert" size={15} />{x.flags.length}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table></div><div className="tbl-foot">{num(list.length)} material{list.length === 1 ? '' : 's'}</div></div>
      )}
      {m && <MaterialForm initial={m} challans={challans} onClose={() => setM(null)} onSaved={r => { setM(null); load(); go('material', { id: r._id }); }} />}
    </>
  );
}
