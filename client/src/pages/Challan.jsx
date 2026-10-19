import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { can, fmt, num } from '../constants.js';
import { Icon, PageHead, Crumbs, Empty, Progress, toast } from '../ui.jsx';
import { MaterialForm } from '../parts.jsx';
import { ChallanForm } from './Challans.jsx';
import { statusClass } from './Materials.jsx';

export default function Challan({ id, user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null);
  const [challans, setChallans] = useState([]);
  const load = () => api(`/api/challans/${id}`).then(setD).catch(e => { toast(e.message, 'err'); go('chl'); });
  useEffect(() => { load(); api('/api/challans').then(setChallans).catch(() => {}); }, [id]);
  const del = async () => {
    if (!confirm(`Delete challan ${d.challan.dcNo}? Its ${d.items.length} item(s) are kept, they just no longer belong to a challan.`)) return;
    try { await api(`/api/challans/${id}`, 'DELETE'); toast('Challan deleted'); go('chl'); } catch (er) { toast(er.message, 'err'); }
  };
  const dl = fmt => download(`/api/export/reconciliation/${fmt}?challan=${id}`).catch(e => toast(e.message, 'err'));
  if (!d) return <p className="loading">Loading...</p>;
  const { challan: c, items, totals: t } = d;

  return (
    <>
      <Crumbs items={[{ label: 'Challans', onClick: () => go('chl') }, { label: c.dcNo }]} />
      <PageHead title={c.dcNo} sub={[fmt(c.date), c.recipient, c.company].filter(Boolean).join('  |  ') || 'Delivery challan'}
        action={<>
          <button className="btn" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Excel</button>
          <button className="btn" onClick={() => dl('pdf')}><Icon name="file" size={18} />PDF</button>
          {canEdit && <button className="btn primary" onClick={() => setModal('item')}><Icon name="plus" size={18} />Add item</button>}
          {canEdit && <button className="icon-btn" onClick={() => setModal('edit')} aria-label="Edit challan"><Icon name="edit" size={18} /></button>}
          {canEdit && <button className="icon-btn danger" onClick={del} aria-label="Delete challan"><Icon name="trash" size={18} /></button>}
        </>} />
      {(c.project || c.notes) && <div className="note">{c.project}{c.project && c.notes ? '. ' : ''}{c.notes}</div>}
      <div className="tiles small">
        {[['Items', items.length], ['Challan qty', t.challanQty], ['Received', t.received], ['Serials entered', t.serials], ['Pending serials', t.pending], ['Dispatched', t.dispatched]].map(([l, v]) => <div key={l} className={'tile ' + (l === 'Pending serials' && v ? 'warn' : '')}><span>{l}</span><b>{num(v)}</b></div>)}
      </div>
      {!items.length ? <Empty title="No items on this challan" text="Add the items written on the challan with their quantities." /> : (
        <div className="plate"><div className="tbl"><table>
          <thead><tr><th>No.</th><th>Material</th><th>HSN</th><th className="num">Challan qty</th><th className="num">Received</th><th>Serials entered</th><th className="num">Pending</th><th className="num">Dispatched</th><th>Status</th></tr></thead>
          <tbody>
            {items.map(x => (
              <tr key={x._id} className="click" onClick={() => go('material', { id: x._id })}>
                <td className="muted">{x.itemNo}</td>
                <td><b>{x.name}</b>{x.model && <small className="muted block clip">{x.model}</small>}</td>
                <td className="muted">{x.hsn}</td>
                <td className="num">{x.challanQty}</td>
                <td className="num"><b className={x.challanQty > x.received ? 'warn-t' : ''}>{x.received}</b></td>
                <td className="sercol">{x.trackSerial ? <><span className="nums"><b>{x.serials}</b> / {x.expected}</span><Progress value={x.serials} max={x.expected} /></> : <span className="muted">Qty only</span>}</td>
                <td className="num">{x.pending ? <b className="warn-t">{x.pending}</b> : <span className="muted">0</span>}</td>
                <td className="num">{x.dispatched || <span className="muted">-</span>}</td>
                <td><span className={'pill ' + statusClass(x.status)}>{x.status}</span></td>
              </tr>
            ))}
            <tr className="tot"><td /><td>TOTAL</td><td /><td className="num">{t.challanQty}</td><td className="num">{t.received}</td><td>{t.serials}</td><td className="num">{t.pending}</td><td className="num">{t.dispatched}</td><td /></tr>
          </tbody>
        </table></div></div>
      )}
      {modal === 'edit' && <ChallanForm initial={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === 'item' && <MaterialForm initial={{ challan: id }} challans={challans} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}
