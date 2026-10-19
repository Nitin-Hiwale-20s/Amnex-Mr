import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { can, fmt, isoDay, num, today } from '../constants.js';
import { Icon, Modal, Field, PageHead, Empty, toast } from '../ui.jsx';

const LINE0 = { material: '', description: '', qty: '', serialsText: '', partNo: '', date: '', remarks: '' };

// one item row of a dispatch, with an optional "pick from register" helper
function LineEditor({ line, i, mats, onChange, onRemove, only }) {
  const [pick, setPick] = useState(null); // list of serials of this material
  const set = (k, v) => onChange({ ...line, [k]: v });
  const chooseMat = async id => {
    const m = mats.find(x => x._id === id);
    onChange({ ...line, material: id, description: line.description || (m ? m.name : '') });
    setPick(null);
  };
  const openPick = async () => {
    if (pick) return setPick(null);
    try { const d = await api(`/api/materials/${line.material}`); setPick(d.serials.filter(s => s.status !== 'DISPATCHED')); } catch (er) { toast(er.message, 'err'); }
  };
  const have = new Set(line.serialsText.split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean));
  const toggle = sn => {
    const list = [...have]; const k = list.indexOf(sn);
    if (k >= 0) list.splice(k, 1); else list.push(sn);
    onChange({ ...line, serialsText: list.join('\n'), qty: line.qty === '' || Number(line.qty) === have.size ? '' : line.qty });
  };
  return (
    <div className="line">
      <div className="line-h"><b>Item {i + 1}</b>{!only && <button type="button" className="icon-btn danger" onClick={onRemove} aria-label="Remove item"><Icon name="trash" size={16} /></button>}</div>
      <div className="grid-2">
        <Field label="Material from list (optional)">
          <select value={line.material} onChange={e => chooseMat(e.target.value)}><option value="">Not in list / type below</option>{mats.map(m => <option key={m._id} value={m._id}>{m.itemNo ? m.itemNo + '. ' : ''}{m.name}</option>)}</select>
        </Field>
        <Field label="Item description"><input value={line.description} onChange={e => set('description', e.target.value)} required /></Field>
      </div>
      <div className="grid-3">
        <Field label="Quantity" hint="Leave empty = number of serials"><input type="number" min="0" value={line.qty} onChange={e => set('qty', e.target.value)} /></Field>
        <Field label="Date (optional)"><input type="date" value={line.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Part no. (optional)"><input value={line.partNo} onChange={e => set('partNo', e.target.value)} /></Field>
      </div>
      <Field label={`Serial numbers (${have.size})`} hint="One per line. They are marked Dispatched in the register.">
        <textarea rows={3} className="mono" value={line.serialsText} onChange={e => set('serialsText', e.target.value)} />
      </Field>
      {line.material && <button type="button" className="btn sm" onClick={openPick}>{pick ? 'Hide register list' : 'Pick from register'}</button>}
      {pick && (
        <div className="picker">
          {!pick.length && <span className="muted">No undispatched serial numbers for this material.</span>}
          {pick.map(s => <label key={s._id} className={'pick' + (have.has(s.serialNo) ? ' on' : '')}><input type="checkbox" checked={have.has(s.serialNo)} onChange={() => toggle(s.serialNo)} /><span className="mono">{s.serialNo}</span></label>)}
        </div>
      )}
      <Field label="Remarks (optional)"><input value={line.remarks} onChange={e => set('remarks', e.target.value)} /></Field>
    </div>
  );
}

export function DispatchForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState(() => initial ? {
    date: isoDay(initial.date), sentTo: initial.sentTo, company: initial.company || '', reference: initial.reference || '',
    lines: initial.lines.map(l => ({ material: l.material || '', description: l.description || '', qty: l.qty ?? '', serialsText: (l.serials || []).join('\n'), partNo: l.partNo || '', date: isoDay(l.date), remarks: l.remarks || '' })),
  } : { date: today(), sentTo: '', company: '', reference: '', lines: [{ ...LINE0 }] });
  const [mats, setMats] = useState([]);
  useEffect(() => { api('/api/materials').then(setMats).catch(() => {}); }, []);
  const setLine = (i, l) => setF({ ...f, lines: f.lines.map((x, k) => k === i ? l : x) });
  const save = async e => {
    e.preventDefault();
    try {
      const r = initial?._id ? await api(`/api/dispatches/${initial._id}`, 'PUT', f) : await api('/api/dispatches', 'POST', f);
      if (r.missing?.length) toast(`Saved. ${r.missing.length} serial number(s) are not in the register: ${r.missing.slice(0, 3).join(', ')}${r.missing.length > 3 ? '...' : ''}`, 'err'); else toast('Dispatch saved');
      onSaved(r);
    } catch (er) { toast(er.message, 'err'); }
  };
  return (
    <Modal title={initial?._id ? 'Edit dispatch' : 'New dispatch'} onClose={onClose} wide>
      <form onSubmit={save} className="stack">
        <div className="grid-2">
          <Field label="Sent to / location"><input value={f.sentTo} onChange={e => setF({ ...f, sentTo: e.target.value })} required autoFocus placeholder="e.g. Malewada" /></Field>
          <Field label="Dispatch date"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></Field>
          <Field label="Company"><input value={f.company} onChange={e => setF({ ...f, company: e.target.value })} /></Field>
          <Field label="Reference"><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} placeholder="e.g. As per call Mr. Manish Sir" /></Field>
        </div>
        {f.lines.map((l, i) => <LineEditor key={i} i={i} line={l} mats={mats} only={f.lines.length === 1} onChange={x => setLine(i, x)} onRemove={() => setF({ ...f, lines: f.lines.filter((_, k) => k !== i) })} />)}
        <button type="button" className="btn" onClick={() => setF({ ...f, lines: [...f.lines, { ...LINE0 }] })}><Icon name="plus" size={18} />Add another item</button>
        <button className="btn primary block">Save dispatch</button>
      </form>
    </Modal>
  );
}

export default function Dispatches({ user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [list, setList] = useState(null);
  const [m, setM] = useState(false);
  const load = () => api('/api/dispatches').then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHead title="Dispatch" sub="Material sent from site to another location (Equipment Dispatch Log / Challan)"
        action={canEdit && <button className="btn primary" onClick={() => setM(true)}><Icon name="plus" size={18} />New dispatch</button>} />
      {!list && <p className="loading">Loading...</p>}
      {list && !list.length && <Empty title="No dispatches yet" text="Create a dispatch when material leaves site. The serial numbers in it become Dispatched automatically." action={canEdit && <button className="btn primary" onClick={() => setM(true)}><Icon name="plus" size={18} />New dispatch</button>} />}
      {list && list.length > 0 && (
        <div className="plate"><div className="tbl"><table>
          <thead><tr><th>Date</th><th>Sent to</th><th>Reference</th><th className="num">Items</th><th className="num">Units</th></tr></thead>
          <tbody>{list.map(d => <tr key={d._id} className="click" onClick={() => go('dispatch', { id: d._id })}><td className="nowrap">{fmt(d.date)}</td><td><b>{d.sentTo}</b>{d.company && <small className="muted block">{d.company}</small>}</td><td>{d.reference}</td><td className="num">{d.items}</td><td className="num"><b>{num(d.units)}</b></td></tr>)}</tbody>
        </table></div></div>
      )}
      {m && <DispatchForm onClose={() => setM(false)} onSaved={r => { setM(false); go('dispatch', { id: r.id }); }} />}
    </>
  );
}
