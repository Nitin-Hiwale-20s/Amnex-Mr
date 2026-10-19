import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MODULES, LEVELS, LEVEL_LABEL, ROLE_DEFAULTS, ROLE_LABEL } from '../constants.js';
import { Icon, Modal, Field, Empty, PageHead, toast } from '../ui.jsx';

export default function Users({ me }) {
  const [list, setList] = useState(null);
  const [m, setM] = useState(null);
  const load = () => api('/api/users').then(setList).catch(e => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  const add = () => setM({ id: null, name: '', username: '', password: '', role: 'user', active: true, access: { ...ROLE_DEFAULTS.user } });
  const edit = u => setM({ id: u.id, name: u.name, username: u.username, password: '', role: u.role, active: u.active, access: { ...u.access } });
  const setRole = role => setM({ ...m, role, access: { ...ROLE_DEFAULTS[role] } });
  const save = async e => {
    e.preventDefault();
    try {
      const body = { name: m.name, role: m.role, active: m.active, access: m.access };
      if (m.id) { if (m.password) body.password = m.password; await api(`/api/users/${m.id}`, 'PUT', body); }
      else await api('/api/users', 'POST', { ...body, username: m.username, password: m.password });
      setM(null); toast(m.id ? 'User saved' : 'User created'); load();
    } catch (er) { toast(er.message, 'err'); }
  };
  const del = async u => { if (confirm(`Delete ${u.name}? They will no longer be able to log in.`)) { try { await api(`/api/users/${u.id}`, 'DELETE'); toast('User deleted'); load(); } catch (er) { toast(er.message, 'err'); } } };
  if (!list) return <p className="loading">Loading users</p>;

  return (
    <>
      <PageHead title="Users" sub="Only you (admin) can create accounts and decide who can see and change what" action={<button className="btn primary" onClick={add}><Icon name="plus" size={18} />Create user</button>} />
      {!list.length && <Empty title="No users" text="Add a user to give them access." />}
      <div className="plate ledger">
        {list.map(u => (
          <div className={'row' + (!u.active ? ' off' : '')} key={u.id}>
            <span className="avatar">{u.name[0]}</span>
            <div className="row-main">
              <div className="row-title"><b>{u.name}</b>
                <span className={'tag role-' + u.role}>{ROLE_LABEL[u.role]}</span>
                {!u.active && <span className="tag bad">Disabled</span>}
              </div>
              <div className="row-sub">{u.email || u.username}</div>
              <div className="chips-inline">
                {u.role === 'admin' ? <span className="hl">Full access</span> : MODULES.filter(x => u.access[x.k] !== 'none').map(x => <span key={x.k}>{x.label}: {LEVEL_LABEL[u.access[x.k]]}</span>)}
                {u.role !== 'admin' && MODULES.every(x => u.access[x.k] === 'none') && <span>No access yet</span>}
              </div>
            </div>
            <div className="row-end">
              <button className="icon-btn" onClick={() => edit(u)} aria-label={`Edit ${u.name}`}><Icon name="edit" size={18} /></button>
              {u.id !== me.id && <button className="icon-btn danger" onClick={() => del(u)} aria-label={`Delete ${u.name}`}><Icon name="trash" size={18} /></button>}
            </div>
          </div>
        ))}
      </div>
      {m && (
        <Modal title={m.id ? 'Edit user' : 'Create user'} onClose={() => setM(null)}>
          <form onSubmit={save} className="stack">
            {!m.id && <div className="note">Give this person their email/username and password. They cannot create accounts themselves.</div>}
            <Field label="Name"><input value={m.name} onChange={e => setM({ ...m, name: e.target.value })} required /></Field>
            <div className="grid-2">
              <Field label="Email or username"><input value={m.username} onChange={e => setM({ ...m, username: e.target.value })} disabled={!!m.id} required autoCapitalize="none" /></Field>
              <Field label={m.id ? 'New password' : 'Password'} hint={m.id ? 'Leave empty to keep the current one' : 'At least 6 characters'}><input type="password" value={m.password} onChange={e => setM({ ...m, password: e.target.value })} required={!m.id} autoComplete="new-password" /></Field>
            </div>
            <Field label="Role">
              <div className="seg full">{['admin', 'engineer', 'user'].map(r => <button type="button" key={r} className={m.role === r ? 'on' : ''} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</button>)}</div>
            </Field>
            <div>
              <div className="label-strong">{m.role === 'admin' ? 'Admins can do everything' : 'Access by area'}</div>
              {m.role !== 'admin' && MODULES.map(x => (
                <div className="perm" key={x.k}>
                  <div><b>{x.label}</b><small>{x.hint}</small></div>
                  <div className="seg">{LEVELS.map(l => <button type="button" key={l} className={m.access[x.k] === l ? 'on ' + l : ''} onClick={() => setM({ ...m, access: { ...m.access, [x.k]: l } })}>{LEVEL_LABEL[l]}</button>)}</div>
                </div>
              ))}
            </div>
            {m.id && m.id !== me.id && <label className="switch"><input type="checkbox" checked={m.active} onChange={e => setM({ ...m, active: e.target.checked })} /><span>Account enabled. Turn off to block login.</span></label>}
            <button className="btn primary block">{m.id ? 'Save user' : 'Create user'}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
