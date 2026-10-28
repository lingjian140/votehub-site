process.env.TZ = process.env.TZ || "Asia/Shanghai";
require('dotenv').config();
// 部署后本机无数据库时，先从 GitHub 私有仓库恢复
try { require('./backup').restoreSync(); } catch (e) { console.error('[backup] restore error', e.message); }
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const db = require('./db');
const backup = require('./backup');

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
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// multer 配置：头像上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
  }
});
const imageFilter = (req, file, cb) => {
  if (/^image\/(png|jpeg|jpg|gif|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('只允许图片文件'));
};
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

// 帖子图片/视频上传
const postStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.fieldname === 'video' ? '.mp4' : '.jpg');
    const prefix = file.fieldname === 'video' ? 'video_' : 'post_';
    cb(null, prefix + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
  }
});
const mediaFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    if (/^video\/(mp4|quicktime|webm|x-matroska)$/.test(file.mimetype)) return cb(null, true);
    return cb(new Error('只允许 mp4/mov/webm 视频'));
  }
  if (/^image\/(png|jpeg|jpg|gif|webp|heic|heif)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('只允许图片文件'));
};
const postUpload = multer({
  storage: postStorage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: mediaFilter
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

function requireDeveloper(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' });
  if (!isDeveloper(req.user.id)) return res.status(403).json({ error: '仅开发者可操作' });
  next();
}

// ===== 等级 / 积分 =====
function levelFor(points) {
  return Math.max(1, Math.min(99, Math.floor((Number(points) || 0) / 100) + 1));
}
function awardPoints(userId, amount, reason) {
  if (!amount) return;
  db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(amount, userId);
  const p = db.prepare('SELECT points FROM users WHERE id = ?').get(userId);
  if (p) db.prepare('UPDATE users SET level = ? WHERE id = ?').run(levelFor(p.points), userId);
  db.prepare('INSERT INTO points_log (user_id, amount, reason) VALUES (?, ?, ?)').run(userId, amount, reason || '');
}
function isDeveloper(userId) {
  const u = db.prepare('SELECT is_developer FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_developer);
}
function developerBlocked(res, targetId) {
  if (isDeveloper(targetId)) {
    res.status(403).json({ error: '开发者账号不可被操作' });
    return true;
  }
  return false;
}
function todayStr() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pollOf(postId, userId) {
  const options = db.prepare(`SELECT o.id, o.text,
      (SELECT COUNT(*) FROM post_poll_votes v WHERE v.option_id = o.id) votes
    FROM post_poll_options o WHERE o.post_id = ? ORDER BY o.sort_order, o.id`).all(postId);
  if (!options.length) return null;
  const total = db.prepare('SELECT COUNT(*) c FROM post_poll_votes WHERE post_id = ?').get(postId).c;
  const mine = userId ? db.prepare('SELECT option_id FROM post_poll_votes WHERE post_id = ? AND user_id = ?').get(postId, userId) : null;
  return { options, total_votes: total, my_option: mine ? mine.option_id : null };
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
    res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user', avatar: '/img/default-leaf.png', points: 0, level: 1, is_developer: 0 } });
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
    user: { id: row.id, username: row.username, role: row.role, avatar: row.avatar, points: row.points || 0, level: row.level || 1, is_developer: row.is_developer || 0 }
  });
});

app.get('/api/me', auth, (req, res) => {
  if (!req.user) return res.json({ user: null });
  const row = db.prepare('SELECT id, username, avatar, role, created_at, bio, points, level, is_developer, can_post, muted_until FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: row });
});

app.post('/api/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const avatar = '/uploads/' + req.file.filename;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
  res.json({ avatar });
});

app.post('/api/reset-avatar', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run('/img/default-leaf.png', req.user.id);
  res.json({ avatar: '/img/default-leaf.png' });
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
  const users = db.prepare(`SELECT id, username, role, status, avatar, muted_until, mute_reason, can_post, bio, points, level, is_developer, created_at
    FROM users ORDER BY id DESC`).all();
  res.json(users);
});

app.post('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  if (developerBlocked(res, parseInt(req.params.id))) return;
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: '无效' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  if (developerBlocked(res, parseInt(req.params.id))) return;
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 管理员：封禁/解封用户
app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const { ban } = req.body; // true=封禁, false=解封
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能操作自己' });
  if (developerBlocked(res, parseInt(req.params.id))) return;
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


// ===== 社区 =====
function getBoards() {
  const counts = db.prepare("SELECT topic, COUNT(*) c FROM posts WHERE status='published' GROUP BY topic").all();
  const map = {}; counts.forEach(r => map[r.topic] = r.c);
  return db.prepare("SELECT id, key, name, icon, color, description, sort_order, age_restricted, require_password, password IS NOT NULL AND password != '' AS has_password FROM boards ORDER BY sort_order, id").all()
    .map(b => ({ ...b, count: map[b.key] || 0 }));
}
function boardExists(key) {
  return !!db.prepare('SELECT 1 FROM boards WHERE key = ?').get(key);
}
// 发言权限校验（封禁/禁言/发帖授权）
function writeBlocked(userId) {
  const u = db.prepare('SELECT status, muted_until, can_post FROM users WHERE id = ?').get(userId);
  if (!u) return '账号不存在';
  if (u.status === 'banned') return '账号已被封禁';
  if (u.muted_until && new Date(u.muted_until.replace(' ', 'T') + 'Z') > new Date()) {
    return '你已被禁言，解除时间：' + u.muted_until;
  }
  if (u.can_post === 0) return '你暂无发言权限，请联系管理员';
  return null;
}
function guardWrite(req, res) {
  const blocked = writeBlocked(req.user.id);
  if (blocked) { res.status(403).json({ error: blocked }); return false; }
  return true;
}

app.get('/api/boards', (req, res) => res.json(getBoards()));
app.get('/api/topics', (req, res) => res.json(getBoards()));

// 板块密码校验
app.post('/api/boards/:id/unlock', (req, res) => {
  const b = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '板块不存在' });
  if (!b.password) return res.json({ ok: true });
  if (String(req.body.password || '') !== b.password) return res.status(403).json({ error: '密码错误' });
  res.json({ ok: true });
});

// 信息流
app.get('/api/posts', auth, (req, res) => {
  const { topic, sort = 'latest', q, page = 1, user_id, liked_by } = req.query;
  const limit = 10;
  const offset = (Math.max(1, parseInt(page)) - 1) * limit;
  const conds = ["p.status = 'published'"];
  const params = [];
  if (topic && topic !== 'recommend') { conds.push('p.topic = ?'); params.push(topic); }
  if (q) { conds.push('(p.title LIKE ? OR p.content LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (user_id) { conds.push('p.user_id = ?'); params.push(parseInt(user_id)); }
  if (liked_by) { conds.push('EXISTS(SELECT 1 FROM post_likes x WHERE x.post_id = p.id AND x.user_id = ?)'); params.push(parseInt(liked_by)); }
  const where = 'WHERE ' + conds.join(' AND ');
  const order = sort === 'hot'
    ? 'p.pinned DESC, likes_count * 3 + comments_count * 2 + views_count DESC, p.id DESC'
    : 'p.pinned DESC, p.id DESC';

  const rows = db.prepare(`
    SELECT p.*, u.username, u.avatar, u.role AS user_role, u.status AS user_status,
      u.points AS user_points, u.level AS user_level, u.is_developer AS user_developer,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) comments_count,
      (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id) views_count,
      EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) liked
    FROM posts p LEFT JOIN users u ON u.id = p.user_id
    ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}
  `).all(req.user ? req.user.id : 0, ...params);
  rows.forEach(r => {
    try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; }
    r.poll = pollOf(r.id, req.user ? req.user.id : 0);
  });

  const total = db.prepare(`SELECT COUNT(*) c FROM posts p ${where}`).get(...params).c;
  res.json({ posts: rows, total, page: parseInt(page), pages: Math.ceil(total / limit) || 1 });
});

// 发帖（支持图片、视频、投票）
app.post('/api/posts', requireAuth, postUpload.fields([{ name: 'images', maxCount: 9 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  if (!guardWrite(req, res)) return;
  const { title = '', content = '', topic = 'life', type = 'post' } = req.body;
  const text = String(content).trim();
  const isPoll = type === 'poll';
  if (!text && !isPoll) return res.status(400).json({ error: '内容不能为空' });
  if (text.length > 5000) return res.status(400).json({ error: '内容过长' });
  const t = boardExists(topic) ? topic : db.prepare('SELECT key FROM boards ORDER BY sort_order LIMIT 1').get().key;
  const files = req.files || {};
  const images = (files.images || []).map(f => '/uploads/' + f.filename);
  const video = files.video && files.video[0] ? '/uploads/' + files.video[0].filename : null;
  let options = [];
  try {
    options = JSON.parse(req.body.poll_options || '[]');
  } catch (e) { options = []; }
  options = options.map(s => String(s).trim()).filter(Boolean).slice(0, 10);
  if (isPoll && options.length < 2) return res.status(400).json({ error: '投票至少需要 2 个选项' });

  const info = db.prepare('INSERT INTO posts (user_id, title, content, topic, images, type, video) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, String(title).trim().slice(0, 100), text || '', t, JSON.stringify(images), isPoll ? 'poll' : 'post', video);
  if (isPoll) {
    db.prepare('INSERT OR REPLACE INTO post_polls (post_id, question) VALUES (?, ?)').run(info.lastInsertRowid, String(req.body.question || title || '').slice(0, 100));
    const st = db.prepare('INSERT INTO post_poll_options (post_id, text, sort_order) VALUES (?, ?, ?)');
    options.forEach((o, i) => st.run(info.lastInsertRowid, o.slice(0, 60), i));
  }
  awardPoints(req.user.id, 10, '发帖');
  const u = db.prepare('SELECT points, level FROM users WHERE id = ?').get(req.user.id);
  res.json({ id: info.lastInsertRowid, points: u.points, level: u.level, gained: 10 });
});

// 帖子详情
app.get('/api/posts/:id', auth, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, u.username, u.avatar, u.role AS user_role,
      u.points AS user_points, u.level AS user_level, u.is_developer AS user_developer,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) comments_count,
      (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id) views_count,
      EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) liked
    FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(req.user ? req.user.id : 0, req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  try { p.images = JSON.parse(p.images || '[]'); } catch { p.images = []; }
  p.poll = pollOf(p.id, req.user ? req.user.id : 0);
  db.prepare('INSERT INTO post_views (post_id, user_id) VALUES (?, ?)').run(p.id, req.user ? req.user.id : null);
  p.comments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.role AS user_role, u.level AS user_level FROM post_comments c
    LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 300
  `).all(p.id);
  res.json(p);
});

// 帖子投票
app.post('/api/posts/:id/vote', requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const optionId = parseInt(req.body.option_id);
  const post = db.prepare("SELECT id, type FROM posts WHERE id = ? AND status = 'published'").get(postId);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const option = db.prepare('SELECT id FROM post_poll_options WHERE id = ? AND post_id = ?').get(optionId, postId);
  if (!option) return res.status(400).json({ error: '选项不存在' });
  const existing = db.prepare('SELECT option_id FROM post_poll_votes WHERE post_id = ? AND user_id = ?').get(postId, req.user.id);
  if (existing) return res.status(400).json({ error: '你已投过票' });
  db.prepare('INSERT INTO post_poll_votes (post_id, option_id, user_id) VALUES (?, ?, ?)').run(postId, optionId, req.user.id);
  res.json({ poll: pollOf(postId, req.user.id) });
});

// 点赞
app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  const existing = db.prepare('SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, req.user.id);
  if (existing) db.prepare('DELETE FROM post_likes WHERE id = ?').run(existing.id);
  else db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, req.user.id);
  res.json({ liked: !existing, likes_count: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id = ?').get(postId).c });
});

// 评论
app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  if (!guardWrite(req, res)) return;
  const { content } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ error: '评论不能为空' });
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  const info = db.prepare('INSERT INTO post_comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(p.id, req.user.id, String(content).trim().slice(0, 500));
  awardPoints(req.user.id, 3, '评论');
  const row = db.prepare('SELECT c.*, u.username, u.avatar, u.role AS user_role, u.level AS user_level FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// 删除帖子
app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  if (p.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(p.id);
  db.prepare('DELETE FROM post_comments WHERE post_id = ?').run(p.id);
  db.prepare('DELETE FROM post_views WHERE post_id = ?').run(p.id);
  db.prepare('DELETE FROM post_poll_votes WHERE post_id = ?').run(p.id);
  db.prepare('DELETE FROM post_poll_options WHERE post_id = ?').run(p.id);
  db.prepare('DELETE FROM post_polls WHERE post_id = ?').run(p.id);
  res.json({ ok: true });
});

// 聊天室
app.get('/api/chat', auth, (req, res) => {
  const after = parseInt(req.query.after || 0);
  const rows = db.prepare(`
    SELECT m.*, u.username, u.avatar FROM chat_messages m
    LEFT JOIN users u ON u.id = m.user_id
    ${after ? 'WHERE m.id > ?' : ''} ORDER BY m.id ${after ? 'ASC' : 'DESC'} LIMIT ${after ? 100 : 60}
  `).all(...(after ? [after] : []));
  res.json({ messages: after ? rows : rows.reverse() });
});

app.post('/api/chat', requireAuth, (req, res) => {
  if (!guardWrite(req, res)) return;
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息不能为空' });
  const info = db.prepare('INSERT INTO chat_messages (user_id, content) VALUES (?, ?)')
    .run(req.user.id, content.slice(0, 500));
  awardPoints(req.user.id, 1, '聊天');
  const row = db.prepare('SELECT m.*, u.username, u.avatar, u.level AS user_level FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// 消息通知：别人评论/点赞我的帖子
app.get('/api/notifications', requireAuth, (req, res) => {
  const comments = db.prepare(`
    SELECT 'comment' AS type, c.id, c.post_id, c.content, c.created_at, u.username, u.avatar,
           p.title AS post_title, p.content AS post_content
    FROM post_comments c JOIN posts p ON p.id = c.post_id
    LEFT JOIN users u ON u.id = c.user_id
    WHERE p.user_id = ? AND (c.user_id IS NULL OR c.user_id != ?)
    ORDER BY c.id DESC LIMIT 30
  `).all(req.user.id, req.user.id);
  const likes = db.prepare(`
    SELECT 'like' AS type, l.id, l.post_id, '' AS content, l.created_at, u.username, u.avatar,
           p.title AS post_title, p.content AS post_content
    FROM post_likes l JOIN posts p ON p.id = l.post_id
    LEFT JOIN users u ON u.id = l.user_id
    WHERE p.user_id = ? AND l.user_id != ?
    ORDER BY l.id DESC LIMIT 30
  `).all(req.user.id, req.user.id);
  const list = [...comments, ...likes].sort((a, b) => b.id - a.id).slice(0, 50);
  res.json({ notifications: list });
});

// 用户主页
app.get('/api/users/:id/profile', auth, (req, res) => {
  const u = db.prepare('SELECT id, username, avatar, role, status, created_at, bio, points, level, is_developer FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  u.posts_count = db.prepare("SELECT COUNT(*) c FROM posts WHERE user_id = ? AND status='published'").get(u.id).c;
  u.likes_received = db.prepare(`SELECT COUNT(*) c FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE p.user_id = ?`).get(u.id).c;
  u.followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(u.id).c;
  u.following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(u.id).c;
  u.is_following = req.user ? !!db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, u.id) : false;

  let friendStatus = 'none';
  if (req.user && req.user.id === u.id) friendStatus = 'self';
  else if (req.user) {
    const f = db.prepare(`SELECT * FROM friendships
      WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`)
      .get(req.user.id, u.id, u.id, req.user.id);
    if (f) {
      if (f.status === 'accepted') friendStatus = 'friend';
      else if (f.requester_id === req.user.id) friendStatus = 'pending_out';
      else { friendStatus = 'pending_in'; u.friend_request_id = f.id; }
    }
  }
  u.friend_status = friendStatus;
  res.json(u);
});

app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  const target = parseInt(req.params.id);
  if (target === req.user.id) return res.status(400).json({ error: '不能关注自己' });
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(target);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const existing = db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, target);
  if (existing) db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
  else db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, target);
  res.json({ following: !existing, followers: db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(target).c });
});

// ===== 好友 =====
function friendPair(a, b) {
  return db.prepare(`SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`).get(a, b, b, a);
}

app.get('/api/friends', requireAuth, (req, res) => {
  const me = req.user.id;
  const friends = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.bio, u.points, u.level, u.is_developer, f.created_at
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
    ORDER BY f.updated_at DESC
  `).all(me, me, me);
  const requests = db.prepare(`
    SELECT f.id, f.requester_id, f.created_at, u.username, u.avatar, u.level
    FROM friendships f JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending' ORDER BY f.id DESC
  `).all(me);
  res.json({ friends, requests });
});

app.post('/api/friends/:id/request', requireAuth, (req, res) => {
  const target = parseInt(req.params.id);
  if (target === req.user.id) return res.status(400).json({ error: '不能添加自己' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(target)) return res.status(404).json({ error: '用户不存在' });
  const f = friendPair(req.user.id, target);
  if (f) {
    if (f.status === 'accepted') return res.status(400).json({ error: '你们已经是好友' });
    if (f.requester_id === req.user.id) return res.status(400).json({ error: '已发送申请，等待对方同意' });
    db.prepare("UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(f.id);
    return res.json({ status: 'friend' });
  }
  db.prepare('INSERT INTO friendships (requester_id, addressee_id) VALUES (?, ?)').run(req.user.id, target);
  res.json({ status: 'pending_out' });
});

app.post('/api/friends/requests/:id/accept', requireAuth, (req, res) => {
  const f = db.prepare("SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'").get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: '申请不存在' });
  db.prepare("UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(f.id);
  res.json({ ok: true });
});

app.post('/api/friends/requests/:id/decline', requireAuth, (req, res) => {
  const f = db.prepare("SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = 'pending'").get(req.params.id, req.user.id);
  if (!f) return res.status(404).json({ error: '申请不存在' });
  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

app.delete('/api/friends/:id', requireAuth, (req, res) => {
  const f = friendPair(req.user.id, parseInt(req.params.id));
  if (f) db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

// ===== 私信 / 会话 =====
app.get('/api/conversations', requireAuth, (req, res) => {
  const me = req.user.id;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.level,
      (SELECT content FROM private_messages m WHERE (m.from_id = ? AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = ?) ORDER BY m.id DESC LIMIT 1) last_message,
      (SELECT created_at FROM private_messages m WHERE (m.from_id = ? AND m.to_id = u.id) OR (m.from_id = u.id AND m.to_id = ?) ORDER BY m.id DESC LIMIT 1) last_time,
      (SELECT COUNT(*) FROM private_messages m WHERE m.from_id = u.id AND m.to_id = ? AND m.read_at IS NULL) unread
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
    ORDER BY last_time DESC, u.username ASC
  `).all(me, me, me, me, me, me, me, me);
  res.json({ conversations: rows });
});

app.get('/api/messages/:id', requireAuth, (req, res) => {
  const other = parseInt(req.params.id);
  const after = parseInt(req.query.after || 0);
  if (!friendPair(req.user.id, other) || friendPair(req.user.id, other).status !== 'accepted') {
    return res.status(403).json({ error: '只能和好友私信' });
  }
  const rows = db.prepare(`
    SELECT m.*, u.username, u.avatar FROM private_messages m
    JOIN users u ON u.id = m.from_id
    WHERE ((m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?))
      ${after ? 'AND m.id > ?' : ''}
    ORDER BY m.id ASC LIMIT 200
  `).all(req.user.id, other, other, req.user.id, ...(after ? [after] : []));
  db.prepare('UPDATE private_messages SET read_at = CURRENT_TIMESTAMP WHERE from_id = ? AND to_id = ? AND read_at IS NULL').run(other, req.user.id);
  res.json({ messages: rows });
});

app.post('/api/messages/:id', requireAuth, (req, res) => {
  if (!guardWrite(req, res)) return;
  const other = parseInt(req.params.id);
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: '消息不能为空' });
  const f = friendPair(req.user.id, other);
  if (!f || f.status !== 'accepted') return res.status(403).json({ error: '只能和好友私信' });
  const info = db.prepare('INSERT INTO private_messages (from_id, to_id, content) VALUES (?, ?, ?)')
    .run(req.user.id, other, content.slice(0, 1000));
  awardPoints(req.user.id, 1, '私信');
  const row = db.prepare('SELECT m.*, u.username, u.avatar FROM private_messages m JOIN users u ON u.id = m.from_id WHERE m.id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// ===== 签到 =====
function settingValue(key, def) {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r ? r.value : def;
}
function checkinReward() {
  return Math.max(1, parseInt(settingValue('checkin_points', '10')) || 10);
}
function checkinStreak(userId, today) {
  const dates = db.prepare('SELECT date FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 400').all(userId).map(r => r.date);
  if (!dates.length) return 0;
  const set = new Set(dates);
  const d = new Date(today + 'T00:00:00');
  if (!set.has(today)) d.setDate(d.getDate() - 1);
  let streak = 0;
  const pad = n => String(n).padStart(2, '0');
  while (true) {
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!set.has(s)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

app.get('/api/checkin', requireAuth, (req, res) => {
  const today = todayStr();
  const todayRow = db.prepare('SELECT * FROM checkins WHERE user_id = ? AND date = ?').get(req.user.id, today);
  const u = db.prepare('SELECT points, level FROM users WHERE id = ?').get(req.user.id);
  const total = db.prepare('SELECT COUNT(*) c FROM checkins WHERE user_id = ?').get(req.user.id).c;
  res.json({
    checked: !!todayRow,
    today_points: todayRow ? todayRow.points : checkinReward(),
    reward: checkinReward(),
    streak: checkinStreak(req.user.id, today),
    total_days: total,
    points: u.points,
    level: u.level
  });
});

app.post('/api/checkin', requireAuth, (req, res) => {
  const today = todayStr();
  const exists = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND date = ?').get(req.user.id, today);
  if (exists) return res.status(400).json({ error: '今天已经签到过了' });
  const reward = checkinReward();
  db.prepare('INSERT INTO checkins (user_id, date, points) VALUES (?, ?, ?)').run(req.user.id, today, reward);
  awardPoints(req.user.id, reward, '签到');
  const u = db.prepare('SELECT points, level FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, gained: reward, points: u.points, level: u.level, streak: checkinStreak(req.user.id, today), checked: true });
});

// ===== 积分商城 =====
app.get('/api/rewards', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, title, description, cost, stock, icon, sort_order FROM rewards WHERE enabled = 1 ORDER BY sort_order, id').all();
  const u = db.prepare('SELECT points, level FROM users WHERE id = ?').get(req.user.id);
  res.json({ rewards: rows, points: u.points, level: u.level });
});

app.post('/api/rewards/:id/redeem', requireAuth, (req, res) => {
  const me = db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id);
  const r = db.prepare('SELECT * FROM rewards WHERE id = ? AND enabled = 1').get(req.params.id);
  if (!r) return res.status(404).json({ error: '商品不存在' });
  if (r.stock === 0) return res.status(400).json({ error: '库存不足' });
  if (me.points < r.cost) return res.status(400).json({ error: '积分不足' });
  db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(r.cost, req.user.id);
  if (r.stock > 0) db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(r.id);
  db.prepare('INSERT INTO redemptions (user_id, reward_id, reward_title, cost) VALUES (?, ?, ?, ?)').run(req.user.id, r.id, r.title, r.cost);
  db.prepare('INSERT INTO points_log (user_id, amount, reason) VALUES (?, ?, ?)').run(req.user.id, -r.cost, '兑换：' + r.title);
  const u = db.prepare('SELECT points, level FROM users WHERE id = ?').get(req.user.id);
  const lv = levelFor(u.points);
  db.prepare('UPDATE users SET level = ? WHERE id = ?').run(lv, req.user.id);
  res.json({ ok: true, points: u.points, level: lv });
});

app.get('/api/me/redemptions', requireAuth, (req, res) => {
  res.json({ redemptions: db.prepare('SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id) });
});

app.get('/api/me/points-log', requireAuth, (req, res) => {
  res.json({ logs: db.prepare('SELECT * FROM points_log WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id) });
});

// ===== 管理员：开发者配置签到/商城 =====
app.get('/api/admin/rewards', requireAdmin, (req, res) => {
  res.json({
    rewards: db.prepare('SELECT * FROM rewards ORDER BY sort_order, id').all(),
    checkin_points: checkinReward(),
    redemptions: db.prepare('SELECT r.*, u.username FROM redemptions r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 100').all()
  });
});

app.put('/api/admin/settings/checkin', requireDeveloper, (req, res) => {
  const points = parseInt(req.body.points);
  if (!points || points < 1 || points > 10000) return res.status(400).json({ error: '积分需在 1-10000 之间' });
  db.prepare("INSERT INTO settings (key, value) VALUES ('checkin_points', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(points));
  res.json({ ok: true, checkin_points: points });
});

app.post('/api/admin/rewards', requireDeveloper, (req, res) => {
  const { title, description = '', cost = 100, stock = -1, icon = '礼' } = req.body;
  if (!title) return res.status(400).json({ error: '名称必填' });
  const info = db.prepare('INSERT INTO rewards (title, description, cost, stock, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(String(title).slice(0, 40), String(description).slice(0, 200), Math.max(1, parseInt(cost) || 100), parseInt(stock), String(icon).slice(0, 2), Date.now());
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/admin/rewards/:id', requireDeveloper, (req, res) => {
  const r = db.prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: '商品不存在' });
  const { title, description, cost, stock, icon, enabled } = req.body;
  db.prepare('UPDATE rewards SET title = ?, description = ?, cost = ?, stock = ?, icon = ?, enabled = ? WHERE id = ?').run(
    title !== undefined ? String(title).slice(0, 40) : r.title,
    description !== undefined ? String(description).slice(0, 200) : r.description,
    cost !== undefined ? Math.max(1, parseInt(cost) || r.cost) : r.cost,
    stock !== undefined ? parseInt(stock) : r.stock,
    icon !== undefined ? String(icon).slice(0, 2) : r.icon,
    enabled !== undefined ? (enabled ? 1 : 0) : r.enabled,
    r.id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/rewards/:id', requireDeveloper, (req, res) => {
  db.prepare('DELETE FROM rewards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 管理员：社区数据
app.get('/api/admin/posts', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.username, u.avatar,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) comments_count,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) likes_count
    FROM posts p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 200
  `).all();
  rows.forEach(r => { try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; } });
  res.json(rows);
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE status='published'").get().c,
    comments: db.prepare('SELECT COUNT(*) c FROM post_comments').get().c,
    messages: db.prepare('SELECT COUNT(*) c FROM chat_messages').get().c,
    banned: db.prepare("SELECT COUNT(*) c FROM users WHERE status='banned'").get().c,
    muted: db.prepare("SELECT COUNT(*) c FROM users WHERE muted_until IS NOT NULL AND muted_until > datetime('now')").get().c,
    pending_reports: db.prepare("SELECT COUNT(*) c FROM reports WHERE status='pending'").get().c,
    today_posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE date(created_at) = date('now', 'localtime')").get().c,
    checkins: db.prepare('SELECT COUNT(*) c FROM checkins').get().c,
    redemptions: db.prepare('SELECT COUNT(*) c FROM redemptions').get().c,
    friends: db.prepare("SELECT COUNT(*) c FROM friendships WHERE status='accepted'").get().c,
    private_messages: db.prepare('SELECT COUNT(*) c FROM private_messages').get().c
  });
});

// 管理员：禁言 / 解除禁言（minutes=0 表示永久）
app.post('/api/admin/users/:id/mute', requireAdmin, (req, res) => {
  const target = parseInt(req.params.id);
  if (target === req.user.id) return res.status(400).json({ error: '不能操作自己' });
  if (developerBlocked(res, target)) return;
  const { minutes = 0, reason = '' } = req.body;
  let until = null;
  if (Number(minutes) > 0) {
    until = new Date(Date.now() + Number(minutes) * 60000);
    until = until.toISOString().slice(0, 19).replace('T', ' ');
  }
  db.prepare('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?')
    .run(until, until ? String(reason).slice(0, 100) : null, target);
  res.json({ ok: true, muted_until: until });
});

// 管理员：发帖授权
app.post('/api/admin/users/:id/can-post', requireAdmin, (req, res) => {
  if (developerBlocked(res, parseInt(req.params.id))) return;
  const can = req.body.can_post ? 1 : 0;
  db.prepare('UPDATE users SET can_post = ? WHERE id = ?').run(can, req.params.id);
  res.json({ ok: true, can_post: can });
});

// 管理员：板块管理
app.post('/api/admin/boards', requireAdmin, (req, res) => {
  const { name, icon = '社', color = '#00B34F', description = '', password = '', age_restricted = 0 } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '板块名称必填' });
  let key = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (!key) key = 'b' + Date.now();
  if (/[\u4e00-\u9fa5]/.test(key)) key = 'b' + Date.now();
  if (boardExists(key)) key = key + Date.now();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM boards').get().m;
  const pwd = String(password || '').trim();
  const info = db.prepare('INSERT INTO boards (key, name, icon, color, description, sort_order, password, require_password, age_restricted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(key, String(name).trim().slice(0, 20), String(icon).slice(0, 2), color, String(description).slice(0, 100), maxOrder + 1, pwd || null, pwd ? 1 : 0, age_restricted ? 1 : 0);
  res.json({ id: info.lastInsertRowid, key });
});

app.put('/api/admin/boards/:id', requireAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '板块不存在' });
  const { name = b.name, icon = b.icon, color = b.color, description = b.description } = req.body;
  let password = b.password;
  let require_password = b.require_password;
  if (req.body.password !== undefined) {
    const pwd = String(req.body.password || '').trim();
    password = pwd || null;
    require_password = pwd ? 1 : 0;
  }
  const age_restricted = req.body.age_restricted !== undefined ? (req.body.age_restricted ? 1 : 0) : b.age_restricted;
  db.prepare('UPDATE boards SET name = ?, icon = ?, color = ?, description = ?, password = ?, require_password = ?, age_restricted = ? WHERE id = ?')
    .run(String(name).slice(0, 20), String(icon).slice(0, 2), color, String(description).slice(0, 100), password, require_password, age_restricted, b.id);
  res.json({ ok: true });
});

app.delete('/api/admin/boards/:id', requireAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '板块不存在' });
  if (db.prepare('SELECT COUNT(*) c FROM posts WHERE topic = ?').get(b.key).c > 0) {
    return res.status(400).json({ error: '板块下还有帖子，无法删除' });
  }
  db.prepare('DELETE FROM boards WHERE id = ?').run(b.id);
  res.json({ ok: true });
});

// 管理员：置顶 / 隐藏帖子
app.post('/api/admin/posts/:id/pin', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id, pinned FROM posts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  const pinned = p.pinned ? 0 : 1;
  db.prepare('UPDATE posts SET pinned = ? WHERE id = ?').run(pinned, p.id);
  res.json({ ok: true, pinned });
});

app.post('/api/admin/posts/:id/hide', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT id, status FROM posts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  const status = p.status === 'published' ? 'hidden' : 'published';
  db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(status, p.id);
  res.json({ ok: true, status });
});

// 举报
app.post('/api/reports', requireAuth, (req, res) => {
  const { target_type = 'post', target_id, reason = '' } = req.body;
  if (!['post', 'comment', 'user'].includes(target_type)) return res.status(400).json({ error: '类型无效' });
  if (!target_id) return res.status(400).json({ error: '缺少目标' });
  const dup = db.prepare("SELECT id FROM reports WHERE target_type=? AND target_id=? AND reporter_id=? AND status='pending'")
    .get(target_type, target_id, req.user.id);
  if (dup) return res.status(400).json({ error: '你已举报过，等待处理' });
  db.prepare('INSERT INTO reports (target_type, target_id, reporter_id, reason) VALUES (?, ?, ?, ?)')
    .run(target_type, target_id, req.user.id, String(reason).slice(0, 200));
  res.json({ ok: true });
});

app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.username AS reporter_name FROM reports r
    LEFT JOIN users u ON u.id = r.reporter_id ORDER BY r.id DESC LIMIT 200
  `).all();
  rows.forEach(r => {
    if (r.target_type === 'post') {
      const p = db.prepare('SELECT p.content, p.title, u.username FROM posts p LEFT JOIN users u ON u.id=p.user_id WHERE p.id=?').get(r.target_id);
      r.target_text = p ? (p.title ? p.title + ' · ' : '') + p.content : '帖子已删除';
      r.target_owner = p ? p.username : '';
    } else if (r.target_type === 'comment') {
      const c = db.prepare('SELECT c.content, u.username FROM post_comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=?').get(r.target_id);
      r.target_text = c ? c.content : '评论已删除';
      r.target_owner = c ? c.username : '';
    } else {
      const u = db.prepare('SELECT username FROM users WHERE id=?').get(r.target_id);
      r.target_text = u ? '用户：' + u.username : '用户已删除';
      r.target_owner = u ? u.username : '';
    }
  });
  res.json(rows);
});

app.post('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { action } = req.body; // dismiss / delete
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: '举报不存在' });
  if (action === 'delete') {
    if (r.target_type === 'post') {
      db.prepare('DELETE FROM posts WHERE id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_comments WHERE post_id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_views WHERE post_id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_poll_votes WHERE post_id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_poll_options WHERE post_id = ?').run(r.target_id);
      db.prepare('DELETE FROM post_polls WHERE post_id = ?').run(r.target_id);
    } else if (r.target_type === 'comment') {
      db.prepare('DELETE FROM post_comments WHERE id = ?').run(r.target_id);
    }
  }
  db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(action === 'delete' ? 'done' : 'dismissed', r.id);
  res.json({ ok: true });
});

// 我的资料（签名 / 密码）
app.post('/api/me/profile', requireAuth, (req, res) => {
  const bio = String(req.body.bio || '').slice(0, 100);
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.user.id);
  res.json({ ok: true, bio });
});

app.post('/api/me/password', requireAuth, (req, res) => {
  const { old_password, new_password } = req.body;
  const u = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(old_password || '', u.password)) return res.status(400).json({ error: '原密码错误' });
  if (!new_password || String(new_password).length < 4) return res.status(400).json({ error: '新密码至少4位' });
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(String(new_password), 10), req.user.id);
  res.json({ ok: true });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, () => {
  console.log(`\n  投票站运行中 → http://localhost:${PORT}\n  种子账号由 SEED_* 环境变量注入（凭据不会出现在日志中）\n`);
  backup.start();
});
