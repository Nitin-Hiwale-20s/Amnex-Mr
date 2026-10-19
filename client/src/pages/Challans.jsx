import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { can, fmt, isoDay, num } from '../constants.js';
import { Icon, Modal, Field, PageHead, Empty, toast } from '../ui.jsx';

export function ChallanForm({ initial, onClose, onSaved }) {
  const [f, setF] = useState({ dcNo: '', date: '', company: '', recipient: '', project: '', notes: '', ...initial, date: isoDay(initial?.date) });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try {
      const r = initial?._id ? await api(`/api/challans/${initial._id}`, 'PUT', f) : await api('/api/challans', 'POST', f);
      toast('Challan saved'); onSaved(r);
    } catch (er) { toast(er.message.includes('duplicate') ? 'A challan with this DC number already exists' : er.message, 'err'); }
  };
  return (
    <Modal title={initial?._id ? 'Edit challan' : 'Add delivery challan'} onClose={onClose}>
      <form onSubmit={save} className="stack">
        <div className="grid-2">
          <Field label="DC number"><input value={f.dcNo} onChange={set('dcNo')} required autoFocus placeholder="e.g. AMNEX/01/02-09-26" /></Field>
          <Field label="Challan date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        </div>
        <Field label="Company / vendor"><input value={f.company} onChange={set('company')} placeholder="e.g. Amnex Infotechnologies Pvt Ltd" /></Field>
        <Field label="Recipient"><input value={f.recipient} onChange={set('recipient')} /></Field>
        <Field label="Project"><input value={f.project} onChange={set('project')} /></Field>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <button className="btn primary block">Save challan</button>
      </form>
    </Modal>
  );
}

export default function Challans({ user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [list, setList] = useState(null);
  const [m, setM] = useState(null);
  const load = () => api('/api/challans').then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHead title="Delivery challans" sub="Each challan with what was promised, what arrived and which serial numbers are still missing"
        action={canEdit && <button className="btn primary" onClick={() => setM({})}><Icon name="plus" size={18} />Add challan</button>} />
      {!list && <p className="loading">Loading...</p>}
      {list && !list.length && <Empty title="No challans yet" text="Add a challan, or import your Serial Number Register Excel (it creates the challan and its items)." />}
      <div className="cards">
        {list?.map(c => (
          <div key={c._id} className="card" role="button" tabIndex={0} onClick={() => go('challan', { id: c._id })} onKeyDown={e => e.key === 'Enter' && go('challan', { id: c._id })}>
            <div className="card-top"><span className="card-ic"><Icon name="file" size={24} /></span><div><b className="card-name">{c.dcNo}</b><small>{fmt(c.date)}{c.recipient ? '  |  ' + c.recipient : ''}</small></div></div>
            <div className="card-nums"><div><b>{num(c.items)}</b><small>Items</small></div><div><b>{num(c.challanQty)}</b><small>Challan qty</small></div><div><b>{num(c.received)}</b><small>Received</small></div><div><b>{num(c.serials)}</b><small>Serials</small></div></div>
            {c.pending > 0 ? <span className="pill warn">{c.pending} serial numbers pending</span> : <span className="pill ok">All serial numbers entered</span>}
          </div>
        ))}
      </div>
      {m && <ChallanForm initial={m} onClose={() => setM(null)} onSaved={r => { setM(null); go('challan', { id: r._id }); }} />}
    </>
  );
}
