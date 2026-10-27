process.env.TZ = process.env.TZ || "Asia/Shanghai";
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vote-site-secret-key-change-in-prod';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 全局鉴权中间件：尝试解析 token，不强制要求登录
app.use((req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '') || (req.query && req.query.token);
  req.user = null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// multer 配置：头像上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('只允许图片文件'));
  }
});

// 中间件：解析 token
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/, '') || (req.query && req.query.token);
  if (!token) { req.user = null; return next(); }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  const u = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(401).json({ error: '账号不存在' });
  if (u.status === 'banned') return res.status(403).json({ error: '账号已被封禁' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

// ===== 认证 =====
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: '用户名至少3位，密码至少4位' });
  try {
    const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)')
      .run(username, bcrypt.hashSync(password, 10));
    const token = jwt.sign({ id: info.lastInsertRowid, username, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user', avatar: '/img/default-duck.svg' } });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  if (row.status === 'banned') return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
  const token = jwt.sign({ id: row.id, username: row.username, role: row.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({
    token,
    user: { id: row.id, username: row.username, role: row.role, avatar: row.avatar }
  });
});

app.get('/api/me', auth, (req, res) => {
  if (!req.user) return res.json({ user: null });
  const row = db.prepare('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: row });
});

app.post('/api/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const avatar = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json({ avatar });
});

app.post('/api/reset-avatar', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run('/img/default-duck.svg', req.user.id);
  res.json({ avatar: '/img/default-duck.svg' });
});

// ===== 投票 =====
app.get('/api/polls', auth, (req, res) => {
  const { status, search, sort = 'latest', page = 1, mine, user_id } = req.query;
  const offset = (parseInt(page) - 1) * 12;
  const conds = [];
  const params = [];
  if (status) { conds.push('p.status = ?'); params.push(status); }
  if (search) { conds.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (mine === '1' && req.user) { conds.push('p.creator_id = ?'); params.push(req.user.id); }
  if (user_id) { conds.push('p.creator_id = ?'); params.push(parseInt(user_id)); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const orderMap = { latest: 'p.created_at DESC', popular: 'views_count DESC', mostvoted: 'votes_count DESC', oldest: 'p.created_at ASC' };
  const order = orderMap[sort] || orderMap.latest;

  const total = db.prepare(`SELECT COUNT(*) as c FROM polls p ${where}`).get(...params).c;
  const rows = db.prepare(`
    SELECT p.*, u.username as creator_name, u.avatar as creator_avatar,
      (SELECT COUNT(*) FROM votes v WHERE v.poll_id = p.id) as votes_count,
      (SELECT COUNT(*) FROM poll_views pv WHERE pv.poll_id = p.id) as views_count,
      (SELECT COUNT(*) FROM comments c WHERE c.poll_id = p.id) as comments_count
    FROM polls p JOIN users u ON u.id = p.creator_id
    ${where} ORDER BY ${order} LIMIT 12 OFFSET ${offset}
  `).all(...params);

  // 记录访问
  res.json({ polls: rows, total, page: parseInt(page), pages: Math.ceil(total / 12) || 1 });
});

app.post('/api/polls', requireAuth, (req, res) => {
  const { title, description, is_multiple, is_anonymous, max_choices, start_time, end_time, options } = req.body;
  if (!title || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: '标题至少2个选项' });
  }
  const info = db.prepare(`INSERT INTO polls
    (title, description, creator_id, is_multiple, is_anonymous, max_choices, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    title, description || '', req.user.id,
    is_multiple ? 1 : 0, is_anonymous ? 1 : 0,
    max_choices || 1, start_time || null, end_time || null
  );
  const pollId = info.lastInsertRowid;
  const optStmt = db.prepare('INSERT INTO options (poll_id, text, sort_order) VALUES (?, ?, ?)');
  options.forEach((o, i) => { if (o && String(o).trim()) optStmt.run(pollId, String(o).trim(), i); });
  res.json({ id: pollId });
});

app.get('/api/polls/:id', auth, (req, res) => {
  const poll = db.prepare(`
    SELECT p.*, u.username as creator_name, u.avatar as creator_avatar
    FROM polls p JOIN users u ON u.id = p.creator_id WHERE p.id = ?
  `).get(req.params.id);
  if (!poll) return res.status(404).json({ error: '不存在' });

  const options = db.prepare('SELECT * FROM options WHERE poll_id = ? ORDER BY sort_order, id').all(req.params.id);
  // 每个选项的票数
  const votesByOption = {};
  const vrows = db.prepare('SELECT option_id, COUNT(*) as c FROM votes WHERE poll_id = ? GROUP BY option_id').all(req.params.id);
  vrows.forEach(v => votesByOption[v.option_id] = v.c);
  options.forEach(o => o.votes = votesByOption[o.id] || 0);

  const totalVotes = Object.values(votesByOption).reduce((a, b) => a + b, 0);
  poll.options = options;
  poll.total_votes = totalVotes;

  // 登录用户是否已投票
  let myChoiceIds = [];
  if (req.user) {
    myChoiceIds = db.prepare('SELECT option_id FROM votes WHERE poll_id = ? AND voter_id = ?').all(req.params.id, req.user.id).map(r => r.option_id);
  } else {
    const ip = getIp(req);
    myChoiceIds = db.prepare('SELECT option_id FROM votes WHERE poll_id = ? AND voter_ip = ? AND voter_id IS NULL').all(req.params.id, ip).map(r => r.option_id);
  }
  poll.my_choice_ids = myChoiceIds;

  // 记录浏览
  db.prepare('INSERT INTO poll_views (poll_id, viewer_id, viewer_ip) VALUES (?, ?, ?)')
    .run(req.params.id, req.user ? req.user.id : null, getIp(req));

  // 评论
  poll.comments = db.prepare(`
    SELECT c.*, u.username, u.avatar FROM comments c
    LEFT JOIN users u ON u.id = c.user_id WHERE c.poll_id = ? ORDER BY c.id DESC LIMIT 100
  `).all(req.params.id);

  res.json(poll);
});

app.post('/api/polls/:id/vote', auth, (req, res) => {
  const pollId = parseInt(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll) return res.status(404).json({ error: '投票不存在' });
  if (poll.status !== 'active') return res.status(400).json({ error: '投票已结束' });
  const now = new Date();
  if (poll.start_time && new Date(poll.start_time) > now) return res.status(400).json({ error: '投票未开始' });
  if (poll.end_time && new Date(poll.end_time) < now) return res.status(400).json({ error: '投票已截止' });

  const { option_ids } = req.body;
  if (!Array.isArray(option_ids) || option_ids.length === 0) return res.status(400).json({ error: '请选择选项' });
  const maxChoices = poll.is_multiple ? (poll.max_choices || option_ids.length) : 1;
  if (option_ids.length > maxChoices) return res.status(400).json({ error: `最多可投 ${maxChoices} 项` });

  // 验证选项属于该投票
  const validOpts = db.prepare('SELECT id FROM options WHERE poll_id = ?').all(pollId).map(o => o.id);
  for (const id of option_ids) if (!validOpts.includes(id)) return res.status(400).json({ error: '选项无效' });

  // 去重
  const uniq = [...new Set(option_ids)];

  // 检查是否已投过（同一用户或同一 IP 匿名）
  let existing;
  if (req.user) {
    existing = db.prepare('SELECT id FROM votes WHERE poll_id = ? AND voter_id = ?').get(pollId, req.user.id);
  } else {
    const ip = getIp(req);
    existing = db.prepare('SELECT id FROM votes WHERE poll_id = ? AND voter_ip = ? AND voter_id IS NULL').get(pollId, ip);
  }
  if (existing) return res.status(400).json({ error: '你已经投过票了' });

  const insert = db.prepare('INSERT INTO votes (poll_id, option_id, voter_id, voter_ip) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(ids => { ids.forEach(oid => insert.run(pollId, oid, req.user ? req.user.id : null, getIp(req))); });
  tx(uniq);
  res.json({ ok: true });
});

app.post('/api/polls/:id/retract', auth, (req, res) => {
  const pollId = parseInt(req.params.id);
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId);
  if (!poll) return res.status(404).json({ error: '不存在' });
  if (poll.creator_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.prepare('DELETE FROM votes WHERE poll_id = ?').run(pollId);
  res.json({ ok: true });
});

app.post('/api/polls/:id/comments', auth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '评论不能为空' });
  const info = db.prepare('INSERT INTO comments (poll_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.user.id, content.trim().slice(0, 500));
  const row = db.prepare('SELECT c.*, u.username, u.avatar FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.post('/api/polls/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!['active', 'closed'].includes(status)) return res.status(400).json({ error: '状态无效' });
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: '不存在' });
  if (poll.creator_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.prepare('UPDATE polls SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/polls/:id', requireAuth, (req, res) => {
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: '不存在' });
  if (poll.creator_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 投票统计（给创建者/管理员看详细）
app.get('/api/polls/:id/stats', requireAuth, (req, res) => {
  const poll = db.prepare('SELECT * FROM polls WHERE id = ?').get(req.params.id);
  if (!poll) return res.status(404).json({ error: '不存在' });
  if (poll.creator_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  const options = db.prepare('SELECT * FROM options WHERE poll_id = ? ORDER BY sort_order, id').all(req.params.id);
  const stats = options.map(o => ({
    ...o,
    votes: db.prepare('SELECT COUNT(*) as c FROM votes WHERE option_id = ?').get(o.id).c
  }));
  const voters = db.prepare(`
    SELECT v.*, u.username, u.avatar FROM votes v
    LEFT JOIN users u ON u.id = v.voter_id WHERE v.poll_id = ? ORDER BY v.voted_at DESC LIMIT 500
  `).all(req.params.id);
  res.json({ poll, stats, voters,
    total_votes: voters.length,
    views: db.prepare('SELECT COUNT(*) as c FROM poll_views WHERE poll_id = ?').get(req.params.id).c
  });
});

// 用户 API
app.get('/api/users/:id', (req, res) => {
  const u = db.prepare('SELECT id, username, avatar, role, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '不存在' });
  u.polls = db.prepare('SELECT id, title, created_at, (SELECT COUNT(*) FROM votes WHERE poll_id = polls.id) as votes_count FROM polls WHERE creator_id = ? ORDER BY id DESC').all(req.params.id);
  res.json(u);
});

// 管理员
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, role, status, created_at FROM users ORDER BY id DESC').all();
  res.json(users);
});

app.post('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: '无效' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 管理员：封禁/解封用户
app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const { ban } = req.body; // true=封禁, false=解封
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能操作自己' });
  const newStatus = ban ? 'banned' : 'active';
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(newStatus, req.params.id);
  res.json({ ok: true, status: newStatus });
});

// 管理员：删除任意投票
app.delete('/api/admin/polls/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id FROM polls WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '投票不存在' });
  db.prepare('DELETE FROM polls WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM options WHERE poll_id = ?').run(req.params.id);
  db.prepare('DELETE FROM votes WHERE poll_id = ?').run(req.params.id);
  db.prepare('DELETE FROM comments WHERE poll_id = ?').run(req.params.id);
  db.prepare('DELETE FROM poll_views WHERE poll_id = ?').run(req.params.id);
  res.json({ ok: true });
});


// 错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`\n  投票站运行中 → http://localhost:${PORT}\n  种子账号由 SEED_* 环境变量注入（凭据不会出现在日志中）\n`);
});
