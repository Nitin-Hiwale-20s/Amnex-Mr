import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { can, fmt, num } from '../constants.js';
import { Icon, Empty, PageHead, toast } from '../ui.jsx';

export default function Home({ user, go }) {
  const [s, setS] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => { api('/api/summary').then(setS).catch(e => toast(e.message, 'err')); }, []);
  if (!s) return <p className="loading">Loading...</p>;
  const empty = !s.materials && !s.challans;
  const tiles = [
    { l: 'Challans', v: s.challans, to: 'chl' }, { l: 'Materials', v: s.materials, to: 'mat' }, { l: 'Units delivered', v: s.received, c: 'hot', to: 'del' },
    { l: 'Serial numbers', v: s.serials, to: 'ser' }, { l: 'Serials to enter', v: s.toEnter, c: s.toEnter ? 'warn' : '', to: 'mat' },
    { l: 'Dispatched', v: s.dispatched, to: 'dis' }, { l: 'In site store', v: s.inStore, c: 'ok', to: 'mat' },
  ];
  const issues = all ? s.issues : s.issues.slice(0, 8);
  return (
    <>
      <PageHead title="Dashboard" sub="Delivery, serial numbers and dispatch of ITMS material at a glance" />
      {empty && (
        <Empty title="Start with your Excel files" text="Import the Serial Number Register, the Material Delivery Tracker and the Dispatch Log. Everything is created for you."
          action={can(user, 'inventory', 'edit') && <button className="btn primary" onClick={() => go('imp')}><Icon name="upload" size={18} />Import Excel files</button>} />
      )}
      <div className="tiles">{tiles.map(t => <button key={t.l} className={'tile ' + (t.c || '')} onClick={() => go(t.to)}><span>{t.l}</span><b>{num(t.v)}</b></button>)}</div>

      {s.issues.length > 0 && (
        <>
          <h3 className="section">Data checks <em className="count">{s.issues.length}</em></h3>
          <div className="plate">
            {issues.map((i, k) => (
              <button key={k} className={'issue ' + i.level} onClick={() => go('material', { id: i.material })}>
                <Icon name="alert" size={18} /><span><b>{i.name}</b>{i.dc && <small> {i.dc}</small>}<br />{i.text}</span><Icon name="chev" size={16} />
              </button>
            ))}
            {s.issues.length > 8 && <button className="more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${s.issues.length}`}</button>}
          </div>
        </>
      )}

      <div className="cols-2">
        <div>
          <h3 className="section">Recent deliveries</h3>
          <div className="plate"><div className="tbl"><table>
            <thead><tr><th>Date</th><th>Material</th><th className="num">Qty</th></tr></thead>
            <tbody>
              {s.recentDeliveries.map(d => <tr key={d._id} className="click" onClick={() => go('del')}><td className="nowrap">{fmt(d.date)}</td><td>{d.material?.name}</td><td className="num"><b>{d.qty}</b></td></tr>)}
              {!s.recentDeliveries.length && <tr><td colSpan={3} className="muted center">No deliveries yet.</td></tr>}
            </tbody>
          </table></div></div>
        </div>
        <div>
          <h3 className="section">Recent dispatches</h3>
          <div className="plate"><div className="tbl"><table>
            <thead><tr><th>Date</th><th>Sent to</th><th className="num">Units</th></tr></thead>
            <tbody>
              {s.recentDispatches.map(d => <tr key={d._id} className="click" onClick={() => go('dispatch', { id: d._id })}><td className="nowrap">{fmt(d.date)}</td><td>{d.sentTo}<small className="muted block">{d.reference}</small></td><td className="num"><b>{d.units}</b></td></tr>)}
              {!s.recentDispatches.length && <tr><td colSpan={3} className="muted center">No dispatches yet.</td></tr>}
            </tbody>
          </table></div></div>
        </div>
      </div>
    </>
  );
}
