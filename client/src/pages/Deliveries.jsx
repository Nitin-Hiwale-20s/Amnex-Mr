import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { can, fmt, num, qs } from '../constants.js';
import { Icon, PageHead, Empty, toast } from '../ui.jsx';
import { DeliveryForm } from '../parts.jsx';

export default function Deliveries({ user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [f, setF] = useState({ q: '', material: '', from: '', to: '' });
  const [d, setD] = useState(null);
  const [mats, setMats] = useState([]);
  const [m, setM] = useState(null);
  useEffect(() => { api('/api/materials').then(setMats).catch(() => {}); }, []);
  const load = () => api('/api/deliveries' + qs(f)).then(setD).catch(e => toast(e.message, 'err'));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [f]);
  const del = async x => { if (!confirm(`Delete the delivery of ${x.qty} x ${x.material?.name}?`)) return; try { await api(`/api/deliveries/${x._id}`, 'DELETE'); toast('Deleted'); load(); } catch (er) { toast(er.message, 'err'); } };
  const dl = fmtx => download(`/api/export/deliveries/${fmtx}${qs(f)}`).catch(e => toast(e.message, 'err'));
  const set = k => e => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageHead title="Material deliveries" sub="Material Delivery Tracker: what arrived at site, and when"
        action={<>
          <button className="btn" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Excel</button>
          <button className="btn" onClick={() => dl('pdf')}><Icon name="file" size={18} />PDF</button>
          {canEdit && <button className="btn primary" onClick={() => setM({})}><Icon name="plus" size={18} />Add delivery</button>}
        </>} />
      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input value={f.q} onChange={set('q')} placeholder="Search material or remarks" /></div>
        <select className="auto" value={f.material} onChange={set('material')}><option value="">All materials</option>{mats.map(x => <option key={x._id} value={x._id}>{x.name}</option>)}</select>
        <label className="inline-date">From<input type="date" value={f.from} onChange={set('from')} /></label>
        <label className="inline-date">To<input type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      {!d && <p className="loading">Loading...</p>}
      {d && !d.rows.length && <Empty title="No deliveries" text="No delivery entries match. Add one when material arrives at site." />}
      {d && d.rows.length > 0 && (
        <div className="plate"><div className="tbl"><table>
          <thead><tr><th>#</th><th>Date</th><th>Material</th><th className="num">Qty</th><th>Remarks</th>{canEdit && <th />}</tr></thead>
          <tbody>{d.rows.map((x, i) => (
            <tr key={x._id}>
              <td className="muted">{i + 1}</td><td className="nowrap">{fmt(x.date)}</td>
              <td><button className="link plain" onClick={() => go('material', { id: x.material?._id })}>{x.material?.name}</button></td>
              <td className="num"><b>{x.qty}</b></td><td>{x.remarks || <span className="muted">-</span>}</td>
              {canEdit && <td className="nowrap end"><button className="icon-btn" onClick={() => setM(x)} aria-label="Edit"><Icon name="edit" size={16} /></button><button className="icon-btn danger" onClick={() => del(x)} aria-label="Delete"><Icon name="trash" size={16} /></button></td>}
            </tr>))}</tbody>
        </table></div>
        <div className="tbl-foot">{num(d.rows.length)} entries  |  total quantity {num(d.total)}{d.updatedOn ? `  |  last updated ${fmt(d.updatedOn)}` : ''}</div></div>
      )}
      {m && <DeliveryForm initial={m._id ? m : null} materials={mats} onClose={() => setM(null)} onSaved={() => { setM(null); load(); }} />}
    </>
  );
}
