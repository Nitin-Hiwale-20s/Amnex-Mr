const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Activity } = require('./models');

const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('WARNING: set JWT_SECRET in .env, otherwise everyone is logged out whenever the server restarts.');

const MODULES = ['inventory'];
const LEVELS = ['none', 'view', 'edit'];
const all = l => Object.fromEntries(MODULES.map(m => [m, l]));
// Default access per role (admin can change it per user)
const ROLE_DEFAULTS = { admin: all('edit'), engineer: all('edit'), user: all('view') };
const rank = l => LEVELS.indexOf(l);

const cleanAccess = a => {
  const out = {};
  MODULES.forEach(m => { if (a && LEVELS.includes(a[m])) out[m] = a[m]; });
  return out;
};
function effectiveAccess(u) {
  if (u.role === 'admin') return all('edit');
  const stored = (u.toObject ? u.toObject().access : u.access) || {};
  return { ...ROLE_DEFAULTS[u.role], ...cleanAccess(stored) };
}
const publicUser = u => ({ id: u._id, name: u.name, username: u.username, email: u.email, role: u.role, active: u.active, access: effectiveAccess(u) });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sign = u => jwt.sign({ id: u._id }, SECRET, { expiresIn: '7d' });

const wrap = fn => (req, res, next) => fn(req, res, next).catch(e => {
  if (e.code === 11000) return res.status(400).json({ error: 'That email or username is already taken' });
  res.status(400).json({ error: e.message });
});

async function auth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const { id } = jwt.verify(h.replace('Bearer ', ''), SECRET);
    const u = await User.findById(id);
    if (!u || !u.active) return res.status(401).json({ error: 'Please log in' });
    req.user = u; req.access = effectiveAccess(u);
    next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
}
const need = (mod, level = 'view') => (req, res, next) =>
  rank(req.access[mod]) >= rank(level) ? next() : res.status(403).json({ error: 'You do not have permission to do this' });
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' }));

const attempts = new Map();
function limiter(req, res, next) {
  const now = Date.now();
  const a = (attempts.get(req.ip) || []).filter(t => now - t < 60000);
  if (a.length >= 10) return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  a.push(now); attempts.set(req.ip, a); next();
}
const checkPw = p => { if (!p || String(p).length < 6) throw new Error('Password must be at least 6 characters'); };

// Remember who did what (shown to the admin). Never blocks or breaks the real action.
const logActivity = (req, action, entity, count, text) => Activity.create({ user: req.user._id, userName: req.user.name, action, entity, count, text }).catch(() => {});

const router = express.Router();

router.get('/auth/status', wrap(async (_, res) => res.json({ needsSetup: (await User.countDocuments()) === 0 })));

router.post('/auth/setup', limiter, wrap(async (req, res) => {
  if (await User.countDocuments()) return res.status(403).json({ error: 'Setup is already complete' });
  const { name, password } = req.body;
  const username = String(req.body.email || req.body.username || '').toLowerCase().trim();
  if (!name || !username) throw new Error('Enter your name and email');
  checkPw(password);
  const u = await User.create({ name, username, email: EMAIL_RE.test(username) ? username : undefined, passwordHash: await bcrypt.hash(password, 10), role: 'admin', access: all('edit') });
  res.status(201).json({ token: sign(u), user: publicUser(u) });
}));

router.post('/auth/login', limiter, wrap(async (req, res) => {
  const id = String(req.body.username || req.body.email || '').toLowerCase().trim();
  const u = await User.findOne({ $or: [{ username: id }, { email: id }] });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.passwordHash))) return res.status(401).json({ error: 'Wrong email/username or password' });
  if (!u.active) return res.status(403).json({ error: 'Your account is disabled. Contact your admin.' });
  res.json({ token: sign(u), user: publicUser(u) });
}));

router.get('/auth/me', auth, (req, res) => res.json(publicUser(req.user)));

router.post('/auth/password', auth, wrap(async (req, res) => {
  if (!(await bcrypt.compare(String(req.body.current || ''), req.user.passwordHash))) return res.status(400).json({ error: 'Current password is wrong' });
  checkPw(req.body.next);
  req.user.passwordHash = await bcrypt.hash(req.body.next, 10);
  await req.user.save();
  res.json({ ok: true });
}));

// ---------- User management (admin only) ----------
async function ensureAdminRemains(target) {
  if (target.role === 'admin' && target.active) {
    const others = await User.countDocuments({ _id: { $ne: target._id }, role: 'admin', active: true });
    if (!others) throw new Error('At least one active admin is required');
  }
}
router.get('/users', auth, adminOnly, wrap(async (_, res) => res.json((await User.find().sort('name')).map(publicUser))));

router.post('/users', auth, adminOnly, wrap(async (req, res) => {
  const { name, password, role = 'user', access } = req.body;
  const username = String(req.body.username || '').toLowerCase().trim();
  if (!['admin', 'engineer', 'user'].includes(role)) throw new Error('Invalid role');
  checkPw(password);
  const u = await User.create({
    name, username, email: EMAIL_RE.test(username) ? username : undefined, passwordHash: await bcrypt.hash(password, 10), role,
    access: role === 'admin' ? all('edit') : { ...ROLE_DEFAULTS[role], ...cleanAccess(access) },
  });
  logActivity(req, 'add', 'User', 1, `User ${u.name} (${role}) created`);
  res.status(201).json(publicUser(u));
}));

router.put('/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new Error('User not found');
  const { name, role, active, access, password } = req.body;
  const newRole = role || u.role;
  const newActive = active === undefined ? u.active : !!active;
  if (!['admin', 'engineer', 'user'].includes(newRole)) throw new Error('Invalid role');
  if (String(u._id) === String(req.user._id) && (!newActive || newRole !== 'admin')) throw new Error('You cannot deactivate or demote yourself');
  if (newRole !== 'admin' || !newActive) await ensureAdminRemains(u);
  if (name) u.name = name;
  u.role = newRole; u.active = newActive;
  if (newActive) u.pending = false;
  u.access = newRole === 'admin' ? all('edit') : { ...ROLE_DEFAULTS[newRole], ...cleanAccess(access || (u.toObject().access)) };
  if (password) { checkPw(password); u.passwordHash = await bcrypt.hash(password, 10); }
  await u.save();
  logActivity(req, 'edit', 'User', 1, `User ${u.name} changed`);
  res.json(publicUser(u));
}));

router.delete('/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new Error('User not found');
  if (String(u._id) === String(req.user._id)) throw new Error('You cannot delete yourself');
  await ensureAdminRemains(u);
  await u.deleteOne();
  logActivity(req, 'delete', 'User', 1, `User ${u.name} deleted`);
  res.json({ ok: true });
}));

module.exports = { router, auth, need, adminOnly, wrap, logActivity, effectiveAccess, ROLE_DEFAULTS, MODULES, LEVELS, cleanAccess };
