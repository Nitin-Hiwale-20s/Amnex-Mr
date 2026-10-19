import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { can, fmt, num } from '../constants.js';
import { Icon, PageHead, Crumbs, toast } from '../ui.jsx';
import { DispatchForm } from './Dispatches.jsx';

export default function Dispatch({ id, user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(false);
  const load = () => api(`/api/dispatches/${id}`).then(setD).catch(e => { toast(e.message, 'err'); go('dis'); });
  useEffect(() => { load(); }, [id]);
  const del = async () => {
    if (!confirm('Delete this dispatch? Its serial numbers go back to Received.')) return;
    try { await api(`/api/dispatches/${id}`, 'DELETE'); toast('Dispatch deleted'); go('dis'); } catch (er) { toast(er.message, 'err'); }
  };
  const dl = fmtx => download(`/api/export/dispatch/${fmtx}?id=${id}`).catch(e => toast(e.message, 'err'));
  if (!d) return <p className="loading">Loading...</p>;
  return (
    <>
      <Crumbs items={[{ label: 'Dispatch', onClick: () => go('dis') }, { label: `${d.sentTo}, ${fmt(d.date)}` }]} />
      <PageHead title={`Dispatch to ${d.sentTo}`} sub={[fmt(d.date), d.company, d.reference && `Ref: ${d.reference}`].filter(Boolean).join('  |  ')}
        action={<>
          <button className="btn" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Excel</button>
          <button className="btn" onClick={() => dl('pdf')}><Icon name="file" size={18} />PDF</button>
          {canEdit && <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Edit dispatch"><Icon name="edit" size={18} /></button>}
          {canEdit && <button className="icon-btn danger" onClick={del} aria-label="Delete dispatch"><Icon name="trash" size={18} /></button>}
        </>} />
      <div className="tiles small"><div className="tile"><span>Items</span><b>{d.lines.length}</b></div><div className="tile hot"><span>Units</span><b>{num(d.units)}</b></div><div className={'tile ' + (d.missing ? 'warn' : '')}><span>Not in register</span><b>{d.missing}</b></div></div>
      {d.missing > 0 && <div className="flag warn solo"><Icon name="alert" size={16} /><span>{d.missing} serial number{d.missing > 1 ? 's are' : ' is'} not in the Serial Number Register (shown in red). Check for a typing mistake, or add the serial number to the material.</span></div>}
      <div className="plate"><div className="tbl"><table>
        <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th>Serial numbers</th><th>Date</th><th>Remarks</th></tr></thead>
        <tbody>{d.lines.map((l, i) => (
          <tr key={i}>
            <td className="muted">{i + 1}</td>
            <td><b>{l.description}</b>{l.material && <button className="link plain block" onClick={() => go('material', { id: l.material })}>open material</button>}</td>
            <td className="num"><b>{l.qty}</b>{l.qtyMismatch && <small className="warn-t block" title="Quantity differs from the number of serial numbers">{l.serialInfo.length} serials</small>}</td>
            <td><div className="sn-chips">
              {l.serialInfo.map(s => <span key={s.serialNo} className={'sn ' + (s.found ? 'ok' : 'bad')} title={s.found ? s.item : 'Not in the Serial Number Register'}>{s.serialNo}</span>)}
              {l.partNo && <span className="sn part">Part No {l.partNo}</span>}
              {!l.serialInfo.length && !l.partNo && <span className="muted">-</span>}
            </div></td>
            <td className="nowrap">{fmt(l.date || d.date)}</td><td>{l.remarks || <span className="muted">-</span>}</td>
          </tr>))}</tbody>
      </table></div></div>
      {edit && <DispatchForm initial={d} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load(); }} />}
    </>
  );
}
