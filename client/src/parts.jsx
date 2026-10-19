// Forms and tables used on more than one page
import { useMemo, useState } from 'react';
import { api } from './api.js';
import { STATUSES, fmt, isoDay, today, num } from './constants.js';
import { Icon, Modal, Field, StatusTag, toast } from './ui.jsx';

export const StatusSelect = ({ value, onChange, className = '' }) => (
  <select className={'st-select ' + value + ' ' + className} value={value} onChange={e => onChange(e.target.value)}>{STATUSES.map(x => <option key={x.k} value={x.k}>{x.l}</option>)}</select>
);

// ---------- Material (challan line) ----------
export function MaterialForm({ initial, challans, onClose, onSaved }) {
  const [f, setF] = useState({
    name: '', model: '', hsn: '', itemNo: '', challan: '', challanQty: 0, trackSerial: true, aliases: '', ...initial,
    aliases: Array.isArray(initial?.aliases) ? initial.aliases.join(', ') : initial?.aliases || '',
    challan: initial?.challan?._id || initial?.challan || '',
  });
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async e => {
    e.preventDefault();
    try {
      const body = { name: f.name, model: f.model, hsn: f.hsn, itemNo: f.itemNo, challan: f.challan || null, challanQty: Number(f.challanQty) || 0, trackSerial: f.trackSerial, aliases: f.aliases };
      const r = initial?._id ? await api(`/api/materials/${initial._id}`, 'PUT', body) : await api('/api/materials', 'POST', body);
      toast('Material saved'); onSaved(r);
    } catch (er) { toast(er.message, 'err'); }
  };
  return (
    <Modal title={initial?._id ? 'Edit material' : 'Add material'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <Field label="Material description"><input value={f.name} onChange={set('name')} required autoFocus placeholder="e.g. Mobile Data Terminal for Vehicles" /></Field>
        <Field label="Model / specification (optional)"><input value={f.model} onChange={set('model')} /></Field>
        <div className="grid-3">
          <Field label="Item no. on challan"><input value={f.itemNo} onChange={set('itemNo')} placeholder="e.g. 18.1" /></Field>
          <Field label="HSN code"><input value={f.hsn} onChange={set('hsn')} /></Field>
          <Field label="Challan quantity"><input type="number" min="0" value={f.challanQty} onChange={set('challanQty')} /></Field>
        </div>
        <Field label="Delivery challan (DC)">
          <select value={f.challan} onChange={set('challan')}><option value="">Not on a challan</option>{challans.map(c => <option key={c._id} value={c._id}>{c.dcNo}</option>)}</select>
        </Field>
        <label className="switch"><input type="checkbox" checked={f.trackSerial} onChange={set('trackSerial')} /><span><b>Track serial numbers</b><br /><small className="muted">Switch off for cables, kits etc. that only have a quantity.</small></span></label>
        <Field label="Other names used in the delivery tracker (optional)" hint="Separate with commas. Used to match tracker rows to this material when importing."><input value={f.aliases} onChange={set('aliases')} /></Field>
        <button className="btn primary block">Save material</button>
      </form>
    </Modal>
  );
}

// ---------- Delivery entry ----------
export function DeliveryForm({ initial, materials, presetMaterial, onClose, onSaved }) {
  const [f, setF] = useState({ date: initial ? isoDay(initial.date) : today(), material: initial?.material?._id || presetMaterial || '', newMaterial: '', qty: initial?.qty ?? '', remarks: initial?.remarks || '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const isNew = f.material === '__new';
  const save = async e => {
    e.preventDefault();
    try {
      const body = { date: f.date, qty: f.qty, remarks: f.remarks, material: isNew ? '' : f.material, newMaterial: isNew ? f.newMaterial : '' };
      if (initial?._id) await api(`/api/deliveries/${initial._id}`, 'PUT', body); else await api('/api/deliveries', 'POST', body);
      toast('Delivery saved'); onSaved();
    } catch (er) { toast(er.message, 'err'); }
  };
  return (
    <Modal title={initial?._id ? 'Edit delivery' : 'Add delivery'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <div className="grid-2">
          <Field label="Date received"><input type="date" value={f.date} onChange={set('date')} required /></Field>
          <Field label="Quantity"><input type="number" min="0" step="any" value={f.qty} onChange={set('qty')} required autoFocus={!!presetMaterial} /></Field>
        </div>
        <Field label="Material">
          <select value={f.material} onChange={set('material')} required>
            <option value="">Choose material...</option>
            <option value="__new">+ New material (not in the list)</option>
            {materials.map(m => <option key={m._id} value={m._id}>{m.itemNo ? m.itemNo + '. ' : ''}{m.name}{m.model ? ' (' + m.model.slice(0, 30) + ')' : ''}</option>)}
          </select>
        </Field>
        {isNew && <Field label="New material name"><input value={f.newMaterial} onChange={set('newMaterial')} required autoFocus /></Field>}
        <Field label="Remarks (optional)"><input value={f.remarks} onChange={set('remarks')} placeholder="e.g. Received from Cisco, DC 123" /></Field>
        <button className="btn primary block">Save delivery</button>
      </form>
    </Modal>
  );
}

// ---------- Add serial numbers ----------
const ADD0 = { mode: 'list', text: '', prefix: '', suffix: '', from: '1', to: '10', pad: '4', status: 'RECEIVED', remarks: '' };
export function AddSerialsModal({ material, onClose, onSaved }) {
  const [add, setAdd] = useState({ ...ADD0 });
  const preview = useMemo(() => {
    if (add.mode === 'list') return new Set(add.text.split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean)).size;
    const a = parseInt(add.from, 10), b = parseInt(add.to, 10);
    return Number.isInteger(a) && Number.isInteger(b) && b >= a ? b - a + 1 : 0;
  }, [add]);
  const sample = useMemo(() => {
    if (add.mode !== 'range' || !preview) return '';
    const mk = n => add.prefix + String(n).padStart(parseInt(add.pad, 10) || 0, '0') + add.suffix, a = parseInt(add.from, 10);
    return preview > 1 ? `${mk(a)}  ...  ${mk(a + preview - 1)}` : mk(a);
  }, [add, preview]);
  const submit = async e => {
    e.preventDefault();
    try {
      const r = await api(`/api/materials/${material._id}/serials`, 'POST', add);
      if (r.skipped.length) toast(`${r.added} added. ${r.skipped.length} already in the register and skipped: ${r.skipped.slice(0, 3).map(x => x.serialNo).join(', ')}${r.skipped.length > 3 ? '...' : ''}`, r.added ? 'ok' : 'err');
      else toast(`${r.added} serial number(s) added`);
      onSaved();
    } catch (er) { toast(er.message, 'err'); }
  };
  return (
    <Modal title={`Add serial numbers: ${material.name}`} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="seg full">
          <button type="button" className={add.mode === 'list' ? 'on' : ''} onClick={() => setAdd({ ...add, mode: 'list' })}>Type / paste</button>
          <button type="button" className={add.mode === 'range' ? 'on' : ''} onClick={() => setAdd({ ...add, mode: 'range' })}>Number range</button>
        </div>
        {add.mode === 'list' ? (
          <Field label="Serial numbers" hint="One per line. You can paste a whole column from Excel.">
            <textarea rows={7} className="mono" value={add.text} onChange={e => setAdd({ ...add, text: e.target.value })} autoFocus placeholder={'TBN3252424\nTBN3252423\nTBN3252427'} />
          </Field>
        ) : (
          <>
            <div className="grid-2">
              <Field label="Text before number"><input value={add.prefix} onChange={e => setAdd({ ...add, prefix: e.target.value })} placeholder="TBN" autoFocus /></Field>
              <Field label="Text after number"><input value={add.suffix} onChange={e => setAdd({ ...add, suffix: e.target.value })} /></Field>
            </div>
            <div className="grid-3">
              <Field label="From"><input type="number" min="0" value={add.from} onChange={e => setAdd({ ...add, from: e.target.value })} required /></Field>
              <Field label="To"><input type="number" min="0" value={add.to} onChange={e => setAdd({ ...add, to: e.target.value })} required /></Field>
              <Field label="Digits" hint="4 gives 0001"><input type="number" min="0" max="12" value={add.pad} onChange={e => setAdd({ ...add, pad: e.target.value })} /></Field>
            </div>
            {sample && <div className="note">Will create: <b className="mono">{sample}</b></div>}
          </>
        )}
        <div className="grid-2">
          <Field label="Status"><StatusSelect value={add.status} onChange={v => setAdd({ ...add, status: v })} className="plain" /></Field>
          <Field label="Remarks (optional)"><input value={add.remarks} onChange={e => setAdd({ ...add, remarks: e.target.value })} /></Field>
        </div>
        <button className="btn primary block" disabled={!preview}>Add {preview ? num(preview) : ''} serial number{preview === 1 ? '' : 's'}</button>
      </form>
    </Modal>
  );
}

// ---------- Serial number table with select, status change, edit, delete ----------
export function SerialList({ rows, canEdit, showMaterial, go, reload }) {
  const [sel, setSel] = useState(new Set());
  const [ed, setEd] = useState(null);
  const [bulk, setBulk] = useState('INSTALLED');
  const allOn = rows.length > 0 && rows.every(r => sel.has(r._id));
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const done = () => { setSel(new Set()); reload(); };
  const setStatus = async (s, status) => { try { await api(`/api/serials/${s._id}`, 'PUT', { status }); reload(); } catch (er) { toast(er.message, 'err'); } };
  const del = async s => { if (!confirm(`Delete serial number ${s.serialNo}?`)) return; try { await api(`/api/serials/${s._id}`, 'DELETE'); toast('Deleted'); reload(); } catch (er) { toast(er.message, 'err'); } };
  const runBulk = async action => {
    if (action === 'delete' && !confirm(`Delete ${sel.size} selected serial number(s)? This cannot be undone.`)) return;
    try { const r = await api('/api/serials/bulk', 'POST', { ids: [...sel], action, status: bulk }); toast(action === 'delete' ? `${r.deleted} deleted` : `${r.updated} updated`); done(); } catch (er) { toast(er.message, 'err'); }
  };
  const saveEdit = async e => {
    e.preventDefault();
    try { await api(`/api/serials/${ed._id}`, 'PUT', { serialNo: ed.serialNo, status: ed.status, remarks: ed.remarks || '', location: ed.location || '' }); setEd(null); toast('Saved'); reload(); }
    catch (er) { toast(er.message, 'err'); }
  };
  const cols = 5 + (showMaterial ? 1 : 0) + (canEdit ? 2 : 0);
  return (
    <>
      {canEdit && sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size} selected</b>
          <StatusSelect value={bulk} onChange={setBulk} className="plain" />
          <button className="btn sm" onClick={() => runBulk('status')}><Icon name="check" size={16} />Set status</button>
          <button className="btn sm stop" onClick={() => runBulk('delete')}><Icon name="trash" size={16} />Delete</button>
          <button className="btn sm" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="tbl"><table>
        <thead><tr>
          {canEdit && <th className="chk"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map(r => r._id)))} aria-label="Select all" /></th>}
          {showMaterial && <th>Material</th>}<th>Serial number</th><th>Unit</th><th>Status</th><th>Location</th><th>Remarks</th>{canEdit && <th />}
        </tr></thead>
        <tbody>
          {rows.map(s => (
            <tr key={s._id} className={sel.has(s._id) ? 'sel' : ''}>
              {canEdit && <td className="chk"><input type="checkbox" checked={sel.has(s._id)} onChange={() => toggle(s._id)} aria-label={`Select ${s.serialNo}`} /></td>}
              {showMaterial && <td><button className="link plain" onClick={() => go('material', { id: s.material?._id })}>{s.material?.name}</button>{s.material?.challan?.dcNo && <small className="muted block">{s.material.challan.dcNo}</small>}</td>}
              <td className="mono"><b>{s.serialNo}</b></td>
              <td className="muted">{s.seq || ''}</td>
              <td>{canEdit ? <StatusSelect value={s.status} onChange={v => setStatus(s, v)} /> : <StatusTag s={s.status} />}</td>
              <td>{s.location || <span className="muted">-</span>}</td>
              <td>{s.remarks || <span className="muted">-</span>}</td>
              {canEdit && <td className="nowrap end">
                <button className="icon-btn" onClick={() => setEd({ ...s })} aria-label={`Edit ${s.serialNo}`}><Icon name="edit" size={16} /></button>
                <button className="icon-btn danger" onClick={() => del(s)} aria-label={`Delete ${s.serialNo}`}><Icon name="trash" size={16} /></button>
              </td>}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols} className="muted center">No serial numbers match.</td></tr>}
        </tbody>
      </table></div>
      {ed && (
        <Modal title="Edit serial number" onClose={() => setEd(null)}>
          <form onSubmit={saveEdit} className="stack">
            <Field label="Serial number"><input className="mono" value={ed.serialNo} onChange={e => setEd({ ...ed, serialNo: e.target.value })} required autoFocus /></Field>
            <div className="grid-2">
              <Field label="Status"><StatusSelect value={ed.status} onChange={v => setEd({ ...ed, status: v })} className="plain" /></Field>
              <Field label="Location (optional)"><input value={ed.location || ''} onChange={e => setEd({ ...ed, location: e.target.value })} placeholder="e.g. Site store, Malewada" /></Field>
            </div>
            <Field label="Remarks"><input value={ed.remarks || ''} onChange={e => setEd({ ...ed, remarks: e.target.value })} /></Field>
            <button className="btn primary block">Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}

export { fmt };
