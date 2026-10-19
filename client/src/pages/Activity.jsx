import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtTime, num, qs, ROLE_LABEL } from '../constants.js';
import { PageHead, Empty, Pager, Icon, toast } from '../ui.jsx';

const ENTITIES = [
  ['Serial', 'Serial numbers'], ['Delivery', 'Deliveries'], ['Material', 'Materials'], ['Dispatch', 'Dispatches'], ['Challan', 'Challans'], ['User', 'Users'],
];
const ELABEL = Object.fromEntries(ENTITIES);
const ACTIONS = { add: 'Added', edit: 'Edited', delete: 'Deleted', import: 'Imported' };
const PERIODS = [['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom']];
const day = (off = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + off); };
const local = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function range(period, c) {
  if (period === 'today') return { from: day().toISOString(), until: day(1).toISOString() };
  if (period === '7') return { from: day(-6).toISOString(), until: day(1).toISOString() };
  if (period === '30') return { from: day(-29).toISOString(), until: day(1).toISOString() };
  if (period === 'custom') return { from: c.from ? local(c.from).toISOString() : '', until: c.to ? new Date(local(c.to).getTime() + 86400000).toISOString() : '' };
  return {};
}
const hue = name => [...String(name)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6;

export default function Activity() {
  const [period, setPeriod] = useState('7');
  const [c, setC] = useState({ from: '', to: '' });
  const [sum, setSum] = useState(null);
  const [user, setUser] = useState('');
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [log, setLog] = useState(null);
  const r = range(period, c);

  useEffect(() => { setSum(null); api('/api/activity/summary' + qs(r)).then(setSum).catch(e => toast(e.message, 'err')); }, [period, c]);
  useEffect(() => { api('/api/activity' + qs({ ...r, user, entity, action, page, size: 50 })).then(setLog).catch(e => toast(e.message, 'err')); }, [period, c, user, entity, action, page]);
  const reset = f => { setPage(1); f(); };

  const totals = sum ? sum.reduce((a, u) => ({ added: a.added + u.total, edited: a.edited + u.edited, deleted: a.deleted + u.deleted, active: a.active + (u.total + u.edited + u.deleted > 0 ? 1 : 0) }), { added: 0, edited: 0, deleted: 0, active: 0 }) : null;
  const byEntity = u => ENTITIES.map(([k, l]) => ({ k, l, n: (u.added[k] || 0) + (u.imported[k] || 0) })).filter(x => x.n > 0);

  return (
    <>
      <PageHead title="Activity" sub="See who added how much data, and what was changed or deleted" />
      <div className="chips period">
        {PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => reset(() => setPeriod(k))}>{l}</button>)}
        {period === 'custom' && <>
          <label className="inline-date">From<input type="date" value={c.from} onChange={e => reset(() => setC({ ...c, from: e.target.value }))} /></label>
          <label className="inline-date">To<input type="date" value={c.to} onChange={e => reset(() => setC({ ...c, to: e.target.value }))} /></label>
        </>}
      </div>

      {!sum && <p className="loading">Loading...</p>}
      {sum && (
        <>
          <div className="tiles small">
            <div className="tile hot"><span>Records added</span><b>{num(totals.added)}</b></div>
            <div className="tile"><span>Edits</span><b>{num(totals.edited)}</b></div>
            <div className="tile"><span>Deletes</span><b>{num(totals.deleted)}</b></div>
            <div className="tile"><span>Active users</span><b>{totals.active}<small> / {sum.length}</small></b></div>
          </div>

          <h3 className="section">Data added by each user</h3>
          <div className="cards">
            {sum.map(u => (
              <div key={u.user} className={'card ucard hue' + hue(u.name) + (user === u.user ? ' picked' : '')} role="button" tabIndex={0}
                onClick={() => reset(() => setUser(user === u.user ? '' : u.user))} onKeyDown={e => e.key === 'Enter' && reset(() => setUser(user === u.user ? '' : u.user))}>
                <div className="card-top">
                  <span className="avatar big">{u.name[0]}</span>
                  <div><b className="card-name">{u.name}</b><small>{ROLE_LABEL[u.role] || 'Removed'}{!u.active && u.role ? ' (disabled)' : ''}  |  last active {fmtTime(u.lastAt)}</small></div>
                </div>
                <div className="card-nums"><div><b>{num(u.total)}</b><small>Records added</small></div><div><b>{num(u.edited)}</b><small>Edits</small></div><div><b>{num(u.deleted)}</b><small>Deletes</small></div></div>
                <div className="chips-inline">
                  {byEntity(u).map(x => <span key={x.k} className={'ent e-' + x.k}>{x.l}: <b>{num(x.n)}</b></span>)}
                  {!byEntity(u).length && <span>Nothing added in this period</span>}
                </div>
              </div>
            ))}
          </div>
          {user && <p className="muted pick-note">Showing the log of one user. Click the card again to show everyone.</p>}
        </>
      )}

      <h3 className="section">Activity log</h3>
      <div className="toolbar tight">
        <select className="auto" value={entity} onChange={e => reset(() => setEntity(e.target.value))}><option value="">All data types</option>{ENTITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="auto" value={action} onChange={e => reset(() => setAction(e.target.value))}><option value="">Added, edited, deleted</option>{Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {(user || entity || action) && <button className="btn sm" onClick={() => reset(() => { setUser(''); setEntity(''); setAction(''); })}>Clear filters</button>}
      </div>
      {!log && <p className="loading">Loading...</p>}
      {log && !log.total && <Empty title="No activity" text="Nothing was recorded for these filters. Changes made from now on are recorded here." />}
      {log && log.total > 0 && (
        <div className="plate">
          <div className="tbl"><table>
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Data</th><th>Details</th><th className="num">Records</th></tr></thead>
            <tbody>{log.rows.map(x => (
              <tr key={x._id}>
                <td className="nowrap muted">{fmtTime(x.createdAt)}</td>
                <td><b>{x.userName}</b></td>
                <td><span className={'act a-' + x.action}>{ACTIONS[x.action]}</span></td>
                <td><span className={'ent e-' + x.entity}>{ELABEL[x.entity] || x.entity}</span></td>
                <td>{x.text}</td>
                <td className="num"><b>{x.count}</b></td>
              </tr>))}</tbody>
          </table></div>
          <div className="tbl-foot">{num(log.total)} entr{log.total === 1 ? 'y' : 'ies'}</div>
          <Pager page={log.page} size={log.size} total={log.total} onPage={setPage} />
        </div>
      )}
    </>
  );
}
