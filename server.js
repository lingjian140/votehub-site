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
  if (/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)) cb(null, true);
  else cb(new Error('只允许图片文件'));
};
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: imageFilter });

// 帖子图片上传（最多 9 张，单张 5MB）
const postStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'post_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
  }
});
const postUpload = multer({ storage: postStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

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
    res.json({ token, user: { id: info.lastInsertRowid, username, role: 'user', avatar: '/img/default-duck.png' } });
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
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run('/img/default-duck.png', req.user.id);
  res.json({ avatar: '/img/default-duck.png' });
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
  const users = db.prepare(`SELECT id, username, role, status, avatar, muted_until, mute_reason, can_post, bio, created_at
    FROM users ORDER BY id DESC`).all();
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


// ===== 社区 =====
function getBoards() {
  const counts = db.prepare("SELECT topic, COUNT(*) c FROM posts WHERE status='published' GROUP BY topic").all();
  const map = {}; counts.forEach(r => map[r.topic] = r.c);
  return db.prepare('SELECT * FROM boards ORDER BY sort_order, id').all()
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
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) comments_count,
      (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id) views_count,
      EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) liked
    FROM posts p LEFT JOIN users u ON u.id = p.user_id
    ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}
  `).all(req.user ? req.user.id : 0, ...params);
  rows.forEach(r => { try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; } });

  const total = db.prepare(`SELECT COUNT(*) c FROM posts p ${where}`).get(...params).c;
  res.json({ posts: rows, total, page: parseInt(page), pages: Math.ceil(total / limit) || 1 });
});

// 发帖
app.post('/api/posts', requireAuth, postUpload.array('images', 9), (req, res) => {
  if (!guardWrite(req, res)) return;
  const { title = '', content = '', topic = 'life' } = req.body;
  const text = String(content).trim();
  if (!text) return res.status(400).json({ error: '内容不能为空' });
  if (text.length > 5000) return res.status(400).json({ error: '内容过长' });
  const t = boardExists(topic) ? topic : db.prepare('SELECT key FROM boards ORDER BY sort_order LIMIT 1').get().key;
  const images = (req.files || []).map(f => '/uploads/' + f.filename);
  const info = db.prepare('INSERT INTO posts (user_id, title, content, topic, images) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, String(title).trim().slice(0, 100), text, t, JSON.stringify(images));
  res.json({ id: info.lastInsertRowid });
});

// 帖子详情
app.get('/api/posts/:id', auth, (req, res) => {
  const p = db.prepare(`
    SELECT p.*, u.username, u.avatar, u.role AS user_role,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) likes_count,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) comments_count,
      (SELECT COUNT(*) FROM post_views v WHERE v.post_id = p.id) views_count,
      EXISTS(SELECT 1 FROM post_likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?) liked
    FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(req.user ? req.user.id : 0, req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  try { p.images = JSON.parse(p.images || '[]'); } catch { p.images = []; }
  db.prepare('INSERT INTO post_views (post_id, user_id) VALUES (?, ?)').run(p.id, req.user ? req.user.id : null);
  p.comments = db.prepare(`
    SELECT c.*, u.username, u.avatar, u.role AS user_role FROM post_comments c
    LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 300
  `).all(p.id);
  res.json(p);
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
  const row = db.prepare('SELECT c.*, u.username, u.avatar, u.role AS user_role FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(info.lastInsertRowid);
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
  const row = db.prepare('SELECT m.*, u.username, u.avatar FROM chat_messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(info.lastInsertRowid);
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
  const u = db.prepare('SELECT id, username, avatar, role, status, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  u.posts_count = db.prepare("SELECT COUNT(*) c FROM posts WHERE user_id = ? AND status='published'").get(u.id).c;
  u.likes_received = db.prepare(`SELECT COUNT(*) c FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE p.user_id = ?`).get(u.id).c;
  u.followers = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(u.id).c;
  u.following = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(u.id).c;
  u.is_following = req.user ? !!db.prepare('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, u.id) : false;
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
    today_posts: db.prepare("SELECT COUNT(*) c FROM posts WHERE date(created_at) = date('now', 'localtime')").get().c
  });
});

// 管理员：禁言 / 解除禁言（minutes=0 表示永久）
app.post('/api/admin/users/:id/mute', requireAdmin, (req, res) => {
  const target = parseInt(req.params.id);
  if (target === req.user.id) return res.status(400).json({ error: '不能操作自己' });
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
  const can = req.body.can_post ? 1 : 0;
  db.prepare('UPDATE users SET can_post = ? WHERE id = ?').run(can, req.params.id);
  res.json({ ok: true, can_post: can });
});

// 管理员：板块管理
app.post('/api/admin/boards', requireAdmin, (req, res) => {
  const { name, icon = '社', color = '#00B34F', description = '' } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: '板块名称必填' });
  let key = String(name).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (!key) key = 'b' + Date.now();
  if (/[\u4e00-\u9fa5]/.test(key)) key = 'b' + Date.now();
  if (boardExists(key)) key = key + Date.now();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM boards').get().m;
  const info = db.prepare('INSERT INTO boards (key, name, icon, color, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, String(name).trim().slice(0, 20), String(icon).slice(0, 2), color, String(description).slice(0, 100), maxOrder + 1);
  res.json({ id: info.lastInsertRowid, key });
});

app.put('/api/admin/boards/:id', requireAdmin, (req, res) => {
  const b = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '板块不存在' });
  const { name = b.name, icon = b.icon, color = b.color, description = b.description } = req.body;
  db.prepare('UPDATE boards SET name = ?, icon = ?, color = ?, description = ? WHERE id = ?')
    .run(String(name).slice(0, 20), String(icon).slice(0, 2), color, String(description).slice(0, 100), b.id);
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
});
