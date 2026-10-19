import { useEffect, useState } from 'react';
import { api, download } from '../api.js';
import { can, num, qs, STATUSES } from '../constants.js';
import { Icon, PageHead, Empty, Pager, toast } from '../ui.jsx';
import { SerialList } from '../parts.jsx';

export default function Serials({ user, go }) {
  const canEdit = can(user, 'inventory', 'edit');
  const [f, setF] = useState({ q: '', material: '', challan: '', status: '', location: '' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [mats, setMats] = useState([]);
  const [challans, setChallans] = useState([]);
  useEffect(() => { api('/api/materials').then(setMats).catch(() => {}); api('/api/challans').then(setChallans).catch(() => {}); }, []);
  const load = () => api('/api/serials' + qs({ ...f, page, size: 100 })).then(setD).catch(e => toast(e.message, 'err'));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [f, page]);
  const set = k => e => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  const dl = fmt => download(`/api/export/serials/${fmt}${qs(f)}`).catch(e => toast(e.message, 'err'));
  const visibleMats = f.challan ? mats.filter(m => m.challan?._id === f.challan) : mats;
  const by = d?.byStatus || {};

  return (
    <>
      <PageHead title="Serial number register" sub="Every unit with its serial number, status and location"
        action={<>
          <button className="btn" onClick={() => dl('excel')}><Icon name="sheet" size={18} />Excel</button>
          <button className="btn" onClick={() => dl('pdf')}><Icon name="file" size={18} />PDF</button>
        </>} />
      <div className="search big"><Icon name="search" size={22} /><input value={f.q} onChange={set('q')} placeholder="Search a serial number, e.g. FCW2833" /></div>
      <div className="toolbar tight">
        <select className="auto" value={f.challan} onChange={e => { setPage(1); setF({ ...f, challan: e.target.value, material: '' }); }}><option value="">All challans</option>{challans.map(c => <option key={c._id} value={c._id}>{c.dcNo}</option>)}</select>
        <select className="auto" value={f.material} onChange={set('material')}><option value="">All materials</option>{visibleMats.map(m => <option key={m._id} value={m._id}>{m.itemNo ? m.itemNo + '. ' : ''}{m.name}</option>)}</select>
        <input className="auto" value={f.location} onChange={set('location')} placeholder="Location" />
        <div className="chips">
          <button className={!f.status ? 'on' : ''} onClick={() => { setPage(1); setF({ ...f, status: '' }); }}>All</button>
          {STATUSES.map(s => <button key={s.k} className={f.status === s.k ? 'on ' + s.k : ''} onClick={() => { setPage(1); setF({ ...f, status: f.status === s.k ? '' : s.k }); }}>{s.l}{by[s.k] !== undefined && !f.status ? ` ${by[s.k]}` : ''}</button>)}
        </div>
      </div>
      {!d && <p className="loading">Loading...</p>}
      {d && !d.total && <Empty title="No serial numbers" text="Nothing matches. Serial numbers are added from a material page, or by importing the Serial Number Register." />}
      {d && d.total > 0 && (
        <div className="plate">
          <SerialList rows={d.rows} canEdit={canEdit} showMaterial go={go} reload={load} />
          <div className="tbl-foot">{num(d.total)} serial number{d.total === 1 ? '' : 's'}</div>
          <Pager page={d.page} size={d.size} total={d.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}
