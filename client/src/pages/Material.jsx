import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { can, fmt, num, STATUSES } from '../constants.js';
import { Icon, PageHead, Crumbs, Tabs, Flags, Empty, toast } from '../ui.jsx';
import { MaterialForm, DeliveryForm, AddSerialsModal, SerialList } from '../parts.jsx';
import { statusClass } from './Materials.jsx';

export default function Material({ id, user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('serials');
  const [q, setQ] = useState('');
  const [flt, setFlt] = useState('');
  const [challans, setChallans] = useState([]);
  const [modal, setModal] = useState(null); // edit | serials | delivery | {delivery}
  const load = () => api(`/api/materials/${id}`).then(setD).catch(e => { toast(e.message, 'err'); go('mat'); });
  useEffect(() => { load(); api('/api/challans').then(setChallans).catch(() => {}); }, [id]);

  const rows = useMemo(() => {
    if (!d) return [];
    const t = q.trim().toLowerCase();
    return d.serials.filter(s => (!flt || s.status === flt) && (!t || s.serialNo.toLowerCase().includes(t) || (s.remarks || '').toLowerCase().includes(t)));
  }, [d, q, flt]);
  const delMaterial = async () => {
    const m = d.material;
    if (!confirm(`Delete "${m.name}" with ${m.serials} serial number(s) and ${m.deliveries} delivery entr${m.deliveries === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return;
    try { await api(`/api/materials/${id}`, 'DELETE'); toast('Material deleted'); go('mat'); } catch (er) { toast(er.message, 'err'); }
  };
  const delDelivery = async x => { if (!confirm(`Delete the delivery of ${x.qty} on ${fmt(x.date)}?`)) return; try { await api(`/api/deliveries/${x._id}`, 'DELETE'); toast('Deleted'); load(); } catch (er) { toast(er.message, 'err'); } };
  if (!d) return <p className="loading">Loading...</p>;
  const m = d.material;
  const tiles = [
    { l: 'Challan qty', v: m.challanQty || '-' }, { l: 'Received', v: m.received, c: 'hot' },
    ...(m.trackSerial ? [{ l: 'Serials entered', v: m.serials }, { l: 'To enter', v: m.toEnter, c: m.toEnter ? 'warn' : '' }, { l: 'Installed', v: m.INSTALLED }] : []),
    { l: 'Dispatched', v: m.dispatched }, { l: 'In store', v: m.inStore, c: 'ok' },
  ];

  return (
    <>
      <Crumbs items={[{ label: 'Materials', onClick: () => go('mat') }, ...(m.challan ? [{ label: m.challan.dcNo, onClick: () => go('challan', { id: m.challan._id }) }] : []), { label: m.name }]} />
      <PageHead title={m.name} sub={[m.itemNo && `Item ${m.itemNo}`, m.model, m.hsn && `HSN ${m.hsn}`].filter(Boolean).join('  |  ') || 'Material'}
        action={canEdit && <>
          <button className="icon-btn" onClick={() => setModal('edit')} aria-label="Edit material"><Icon name="edit" size={18} /></button>
          <button className="icon-btn danger" onClick={delMaterial} aria-label="Delete material"><Icon name="trash" size={18} /></button>
        </>} />
      <div className="tiles small">{tiles.map(t => <div key={t.l} className={'tile ' + (t.c || '')}><span>{t.l}</span><b>{typeof t.v === 'number' ? num(t.v) : t.v}</b></div>)}</div>
      <div className="meta-row"><span className={'pill ' + statusClass(m.status)}>{m.status}</span>{!m.trackSerial && <span className="muted">Quantity only. Serial numbers are not tracked for this material.</span>}{m.aliases?.length > 0 && <span className="muted">Also called: {m.aliases.join(', ')}</span>}</div>
      <Flags flags={m.flags} />

      <Tabs value={tab} onChange={setTab} tabs={[{ k: 'serials', l: 'Serial numbers', n: d.serials.length }, { k: 'deliveries', l: 'Deliveries', n: d.deliveries.length }, { k: 'dispatch', l: 'Dispatched', n: d.dispatches.length }]} />

      {tab === 'serials' && (
        <>
          <div className="toolbar">
            <div className="search"><Icon name="search" size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search serial number or remarks" /></div>
            <div className="chips">
              <button className={!flt ? 'on' : ''} onClick={() => setFlt('')}>All</button>
              {STATUSES.map(s => <button key={s.k} className={flt === s.k ? 'on ' + s.k : ''} onClick={() => setFlt(flt === s.k ? '' : s.k)}>{s.l}</button>)}
            </div>
            {canEdit && <button className="btn primary" onClick={() => setModal('serials')}><Icon name="plus" size={18} />Add serial numbers</button>}
          </div>
          {!d.serials.length ? <Empty title="No serial numbers yet" text="Add serial numbers one by one, paste a column from Excel, or add a range." action={canEdit && <button className="btn primary" onClick={() => setModal('serials')}><Icon name="plus" size={18} />Add serial numbers</button>} />
            : <div className="plate"><SerialList rows={rows} canEdit={canEdit} go={go} reload={load} /><div className="tbl-foot">Showing {num(rows.length)} of {num(d.serials.length)}</div></div>}
        </>
      )}

      {tab === 'deliveries' && (
        <>
          <div className="toolbar">{canEdit && <button className="btn primary" onClick={() => setModal({ delivery: {} })}><Icon name="plus" size={18} />Add delivery</button>}</div>
          {!d.deliveries.length ? <Empty title="No deliveries recorded" text="Add an entry each time this material arrives at site." /> : (
            <div className="plate"><div className="tbl"><table>
              <thead><tr><th>Date</th><th className="num">Quantity</th><th>Remarks</th>{canEdit && <th />}</tr></thead>
              <tbody>{d.deliveries.map(x => (
                <tr key={x._id}><td className="nowrap">{fmt(x.date)}</td><td className="num"><b>{x.qty}</b></td><td>{x.remarks || <span className="muted">-</span>}</td>
                  {canEdit && <td className="nowrap end"><button className="icon-btn" onClick={() => setModal({ delivery: x })} aria-label="Edit delivery"><Icon name="edit" size={16} /></button><button className="icon-btn danger" onClick={() => delDelivery(x)} aria-label="Delete delivery"><Icon name="trash" size={16} /></button></td>}</tr>))}
                <tr className="tot"><td>Total</td><td className="num">{m.received}</td><td colSpan={canEdit ? 2 : 1} /></tr>
              </tbody>
            </table></div></div>
          )}
        </>
      )}

      {tab === 'dispatch' && (!d.dispatches.length ? <Empty title="Nothing dispatched" text="When this material is sent out, it appears here." /> : (
        <div className="plate"><div className="tbl"><table>
          <thead><tr><th>Date</th><th>Sent to</th><th>Reference</th><th className="num">Qty</th><th>Serial numbers</th></tr></thead>
          <tbody>{d.dispatches.map((x, i) => (
            <tr key={i} className="click" onClick={() => go('dispatch', { id: x.dispatch })}><td className="nowrap">{fmt(x.date)}</td><td>{x.sentTo}</td><td>{x.reference}</td><td className="num"><b>{x.qty}</b></td><td className="mono small">{[...(x.serials || []), x.partNo && 'Part No ' + x.partNo].filter(Boolean).join(', ')}</td></tr>))}</tbody>
        </table></div></div>
      ))}

      {modal === 'edit' && <MaterialForm initial={m} challans={challans} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal === 'serials' && <AddSerialsModal material={m} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.delivery && <DeliveryForm initial={modal.delivery._id ? { ...modal.delivery, material: { _id: id } } : null} presetMaterial={id} materials={[m]} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}
