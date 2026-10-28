// GitHub 私有仓库备份：启动恢复 + 定时上传
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = process.env.BACKUP_REPO || '';
const TOKEN = process.env.BACKUP_TOKEN || '';
const BRANCH = process.env.BACKUP_BRANCH || 'main';
const FILE = 'backup.tar.gz';
const ROOT = __dirname;

function enabled() {
  return !!(REPO && TOKEN);
}

function curl(args, opts = {}) {
  return execFileSync('curl', ['-sS', '-L', ...args], {
    maxBuffer: 200 * 1024 * 1024,
    ...opts
  });
}

function apiUrl() {
  return `https://api.github.com/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`;
}

// 启动时：本机没有数据库才从私有仓库恢复
function restoreSync() {
  if (!enabled()) return false;
  const dbPath = path.join(ROOT, 'data', 'vote.db');
  if (fs.existsSync(dbPath)) return false;
  const raw = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;
  const tmp = '/tmp/xiaomu-restore.tar.gz';
  try {
    curl(['-fsSL', '-H', `Authorization: Bearer ${TOKEN}`, raw, '-o', tmp]);
    fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'uploads'), { recursive: true });
    execFileSync('tar', ['-xzf', tmp, '-C', ROOT], { stdio: 'pipe' });
    fs.unlinkSync(tmp);
    console.log('[backup] 已从 GitHub 私有仓库恢复数据');
    return true;
  } catch (e) {
    console.log('[backup] 未找到可恢复的备份');
    return false;
  }
}

function backupNow() {
  if (!enabled()) return;
  const dbPath = path.join(ROOT, 'data', 'vote.db');
  if (!fs.existsSync(dbPath)) return;
  try {
    const tmp = '/tmp/xiaomu-backup.tar.gz';
    const entries = ['data/vote.db'];
    ['data/vote.db-wal', 'data/vote.db-shm'].forEach(f => {
      if (fs.existsSync(path.join(ROOT, f))) entries.push(f);
    });
    if (fs.existsSync(path.join(ROOT, 'uploads'))) entries.push('uploads');
    execFileSync('tar', ['-czf', tmp, ...entries], { cwd: ROOT, stdio: 'pipe' });
    const size = fs.statSync(tmp).size;
    if (size > 90 * 1024 * 1024) {
      console.error('[backup] 备份超过 90MB，跳过本次上传');
      return;
    }

    let sha = null;
    try {
      const meta = JSON.parse(curl(['-H', `Authorization: Bearer ${TOKEN}`, apiUrl()]).toString());
      sha = meta.sha || null;
    } catch (e) {}

    const body = {
      message: `backup ${new Date().toISOString()}`,
      content: fs.readFileSync(tmp).toString('base64'),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    const bodyFile = '/tmp/xiaomu-backup.json';
    fs.writeFileSync(bodyFile, JSON.stringify(body));
    curl([
      '-X', 'PUT',
      '-H', `Authorization: Bearer ${TOKEN}`,
      '-H', 'Content-Type: application/json',
      '--data-binary', '@' + bodyFile,
      apiUrl()
    ]);
    fs.unlinkSync(tmp);
    fs.unlinkSync(bodyFile);
    console.log(`[backup] 已上传 ${(size / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.error('[backup] 上传失败：', e.message);
  }
}

function start() {
  if (!enabled()) {
    console.log('[backup] 未配置 BACKUP_REPO/BACKUP_TOKEN，跳过备份');
    return;
  }
  setTimeout(backupNow, 30 * 1000);
  setInterval(backupNow, 3 * 60 * 1000);
  console.log('[backup] 已启用 GitHub 私有仓库备份');
}

module.exports = { restoreSync, backupNow, start, enabled };
