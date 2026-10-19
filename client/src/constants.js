export const APP_NAME = 'MATERIAL TRACKER';
export const APP_SUB = 'ITMS  |  IC20 SHIRDI';
export const LEVELS = ['none', 'view', 'edit'];
export const LEVEL_LABEL = { none: 'No access', view: 'View', edit: 'Edit' };
export const MODULES = [{ k: 'inventory', label: 'Material Tracker', hint: 'Challans, deliveries, serial numbers and dispatch. Edit = add, change, delete, import.' }];
const all = l => Object.fromEntries(MODULES.map(m => [m.k, l]));
export const ROLE_DEFAULTS = { admin: all('edit'), engineer: all('edit'), user: all('view') };
export const ROLE_LABEL = { admin: 'Admin', engineer: 'Engineer', user: 'User' };
export const STATUSES = [
  { k: 'RECEIVED', l: 'Received' },
  { k: 'INSTALLED', l: 'Installed' },
  { k: 'UNDER_TESTING', l: 'Under Testing' },
  { k: 'SPARE', l: 'Spare' },
  { k: 'DISPATCHED', l: 'Dispatched' },
];
export const STATUS_LABEL = Object.fromEntries(STATUSES.map(s => [s.k, s.l]));
const rank = l => LEVELS.indexOf(l);
export const can = (user, mod, level = 'view') => !!user && rank(user.access?.[mod]) >= rank(level);
// dates are stored as UTC midnight, so always show them in UTC (no day shift)
export const fmt = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const isoDay = d => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const today = () => new Date().toISOString().slice(0, 10);
export const num = n => Number(n || 0).toLocaleString('en-IN');
export const qs = o => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };
export const fmtTime = d => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Never');
