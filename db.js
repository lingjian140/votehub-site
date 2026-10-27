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
  avatar TEXT DEFAULT '/img/default-duck.svg',
  role TEXT DEFAULT 'user',
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
`);

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
