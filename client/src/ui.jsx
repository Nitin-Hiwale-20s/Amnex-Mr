import { useEffect, useState } from 'react';
import { STATUSES } from './constants.js';

const ICONS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  station: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6L6 18M6 6l12 12',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z',
  back: 'M19 12H5M12 19l-7-7 7-7',
  file: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6',
  sheet: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  bolt: 'M13 2L3 14h9l-1 8 10-12h-9z',
  chev: 'M9 6l6 6-6 6',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.7 1.1z',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  alert: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01',
  check: 'M20 6L9 17l-5-5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
};
export const Icon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
);

export const Logo = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#ff5a00" /></linearGradient></defs>
    <path d="M24 2l19 11v22L24 46 5 35V13z" fill="#15110d" stroke="url(#lg)" strokeWidth="2.5" />
    <path d="M26 11L14 26h9l-2 11 13-16h-9z" fill="url(#lg)" />
  </svg>
);

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'sheet' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="sheet-h"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="sheet-b">{children}</div>
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);
export const Empty = ({ title, text, action }) => (<div className="empty"><b>{title}</b><p>{text}</p>{action}</div>);
export const PageHead = ({ title, sub, action }) => (
  <div className="page-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><div className="head-actions">{action}</div></div>
);
export const Crumbs = ({ items }) => (
  <nav className="crumbs">{items.map((c, i) => (
    <span key={i}>{i > 0 && <Icon name="chev" size={14} />}{c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <b>{c.label}</b>}</span>
  ))}</nav>
);

// Small progress bar: value of max
export function Progress({ value, max, warn }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return <div className={'prog' + (warn ? ' warn' : '')} title={`${value} of ${max}`}><i style={{ width: p + '%' }} /></div>;
}
export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">{tabs.map(t => <button key={t.k} role="tab" aria-selected={value === t.k} className={value === t.k ? 'on' : ''} onClick={() => onChange(t.k)}>{t.l}{t.n !== undefined && <em>{t.n}</em>}</button>)}</div>
);
export const Pager = ({ page, size, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span>Page {page} of {pages}</span>
      <button className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
};
export const Flags = ({ flags, onClick }) => !flags?.length ? null : (
  <div className="flags">{flags.map((f, i) => <div key={i} className={'flag ' + f.level} onClick={onClick}><Icon name="alert" size={16} /><span>{f.text}</span></div>)}</div>
);
export const StatusTag = ({ s }) => <span className={'st ' + s}>{STATUSES.find(x => x.k === s)?.l || s}</span>;

let push = null;
export const toast = (msg, kind = 'ok') => push && push(msg, kind);
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (m, k) => {
      const id = Math.random();
      setItems(x => [...x, { id, m, k }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 4000);
    };
    return () => { push = null; };
  }, []);
  return <div className="toasts" role="status">{items.map(i => <div key={i.id} className={'toast ' + i.k}>{i.m}</div>)}</div>;
}

// Day / Night theme (remembered in this browser)
export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'day' ? 'day' : 'night');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('inv_theme', theme); } catch { /* ignore */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'day' ? '#f5efe8' : '#08080b');
  }, [theme]);
  return [theme, setTheme];
}
export const ThemeSwitch = ({ theme, setTheme }) => (
  <div className="theme" role="group" aria-label="Theme">
    <button className={theme === 'day' ? 'on' : ''} onClick={() => setTheme('day')}><Icon name="sun" size={16} />Day</button>
    <button className={theme === 'night' ? 'on' : ''} onClick={() => setTheme('night')}><Icon name="moon" size={16} />Night</button>
  </div>
);
export const ThemeFab = ({ theme, setTheme }) => (
  <button className="theme-fab" onClick={() => setTheme(theme === 'day' ? 'night' : 'day')} aria-label={theme === 'day' ? 'Switch to night mode' : 'Switch to day mode'}><Icon name={theme === 'day' ? 'moon' : 'sun'} size={18} /></button>
);
