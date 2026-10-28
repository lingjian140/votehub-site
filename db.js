require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

// 确保 data 目录存在
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

const db = new Database(path.join(dataDir, 'vote.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT '/img/default-duck.png',
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL,
  is_multiple INTEGER DEFAULT 0,
  is_anonymous INTEGER DEFAULT 0,
  max_choices INTEGER DEFAULT 1,
  start_time DATETIME,
  end_time DATETIME,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  voter_id INTEGER,
  voter_ip TEXT,
  voted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
  FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  user_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS poll_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL,
  viewer_id INTEGER,
  viewer_ip TEXT,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

-- ===== 社区 =====
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  topic TEXT DEFAULT 'recommend',
  images TEXT DEFAULT '[]',
  status TEXT DEFAULT 'published',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS post_likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_id INTEGER NOT NULL,
  following_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts(topic, id DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments ON post_comments(post_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages ON chat_messages(id DESC);

-- 板块
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '社',
  color TEXT DEFAULT '#00B34F',
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 举报
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reporter_id INTEGER,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id DESC);
`);

// 旧表兼容：补字段
try { db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN muted_until TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN mute_reason TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN can_post INTEGER DEFAULT 1"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE posts ADD COLUMN pinned INTEGER DEFAULT 0"); } catch (e) {}
try { db.exec("ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'published'"); } catch (e) {}

// 默认头像改为 PNG（Android 端 Glide 不支持 SVG）
try { db.prepare("UPDATE users SET avatar = '/img/default-duck.png' WHERE avatar = '/img/default-duck.svg'").run(); } catch (e) {}

// 种子板块
const seedBoards = [
  ['digital', '数码圈', '数', '#00B34F', '手机、平板、智能穿戴'],
  ['photo', '摄影', '摄', '#3B82F6', '记录生活中的美好瞬间'],
  ['life', '生活', '生', '#F59E0B', '日常闲聊，分享心情'],
  ['game', '游戏', '游', '#8B5CF6', '开黑组队，攻略交流'],
  ['help', '求助', '助', '#EF4444', '遇到问题？大家来帮你'],
];
const boardStmt = db.prepare('INSERT OR IGNORE INTO boards (key, name, icon, color, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
seedBoards.forEach((b, i) => boardStmt.run(b[0], b[1], b[2], b[3], b[4], i));

// 种子数据：每次启动都确保存在（INSERT OR IGNORE 保证幂等）
const adminUser = process.env.SEED_ADMIN_USERNAME;
const adminPass = process.env.SEED_ADMIN_PASSWORD;
if (adminUser && adminPass) {
  db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)')
    .run(adminUser, bcrypt.hashSync(adminPass, 10), 'admin');
}
const userUser = process.env.SEED_USER_USERNAME;
const userPass = process.env.SEED_USER_PASSWORD;
if (userUser && userPass) {
  db.prepare('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)')
    .run(userUser, bcrypt.hashSync(userPass, 10), 'user');
}

module.exports = db;
