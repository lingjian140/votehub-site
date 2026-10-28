'use strict';

/* ===================== 基础状态 ===================== */
const state = {
  token: localStorage.getItem('xm_token') || '',
  user: safeParse(localStorage.getItem('xm_user')) || null,
  home: { topic: 'recommend', sort: 'latest', q: '', page: 1 },
  adminTab: 'stats',
  boards: [],
};
const unlockedBoards = new Set(safeParse(localStorage.getItem('xm_boards')) || []);
const AGE_KEY = 'xm_age_ok';

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function saveAuth(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem('xm_token', token);
  localStorage.setItem('xm_user', JSON.stringify(user));
}
function updateUser(u) {
  state.user = Object.assign({}, state.user, u);
  localStorage.setItem('xm_user', JSON.stringify(state.user));
}
function logout() {
  localStorage.removeItem('xm_token'); localStorage.removeItem('xm_user');
  state.token = ''; state.user = null;
  location.hash = '#/login';
}
function isAdmin() { return state.user && state.user.role === 'admin'; }
function isDev() { return state.user && Number(state.user.is_developer) === 1; }
function myId() { return state.user ? Number(state.user.id) : 0; }

/* ===================== 网络 ===================== */
async function api(path, opts = {}) {
  const headers = {};
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const init = { method: opts.method || 'GET', headers };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || ('请求失败(' + res.status + ')'));
    err.status = res.status;
    throw err;
  }
  return data;
}
function mediaUrl(p) {
  if (!p) return '/img/default-leaf.png';
  return String(p).startsWith('http') ? p : p;
}
function ago(t) {
  if (!t) return '';
  let s = String(t).replace(' ', 'T');
  if (!s.endsWith('Z')) s += 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const day = Math.floor(h / 24);
  if (day < 30) return day + ' 天前';
  return d.toLocaleDateString('zh-CN');
}
function timeText(t) {
  if (!t) return '';
  let s = String(t).replace(' ', 'T');
  if (!s.endsWith('Z')) s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { hour12: false });
}

/* ===================== UI 工具 ===================== */
const app = document.getElementById('app');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

let modalResolve = null;
function openModal(title, bodyHTML, opts = {}) {
  const mask = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');
  okBtn.textContent = opts.okText || '确定';
  cancelBtn.textContent = opts.cancelText || '取消';
  cancelBtn.style.display = opts.hideCancel ? 'none' : '';
  mask.hidden = false;
  return new Promise(resolve => {
    modalResolve = resolve;
    okBtn.onclick = () => { closeModal(); resolve({ ok: true, body: document.getElementById('modal-body') }); };
    cancelBtn.onclick = () => { closeModal(); resolve({ ok: false }); };
  });
}
function closeModal() {
  document.getElementById('modal').hidden = true;
  modalResolve = null;
}
async function confirmDialog(title, message, okText = '确定') {
  const r = await openModal(title, '<div class="sub">' + esc(message) + '</div>', { okText });
  return r.ok;
}
async function promptDialog(title, placeholder, opts = {}) {
  const r = await openModal(title,
    '<input type="' + (opts.password ? 'password' : 'text') + '" id="prompt-input" placeholder="' + esc(placeholder) + '" value="' + esc(opts.value || '') + '">',
    { okText: opts.okText || '确定' });
  if (!r.ok) return null;
  return r.body.querySelector('#prompt-input').value.trim();
}

/* ===================== 顶栏用户区 ===================== */
function renderUserArea() {
  const box = document.getElementById('user-area');
  if (!state.user) {
    box.innerHTML = '<a class="btn small soft" href="#/login">登录</a>';
    return;
  }
  box.innerHTML =
    '<a class="who" href="#/me"><img src="' + esc(mediaUrl(state.user.avatar)) + '" alt="">' +
    '<span class="ellipsis" style="max-width:72px">' + esc(state.user.username) + '</span></a>';
}
function markNav(name) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === name));
}

/* ===================== 路由 ===================== */
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

async function route() {
  renderUserArea();
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const name = parts[0] || 'home';

  if (!state.token && name !== 'login') {
    location.hash = '#/login';
    return;
  }
  if (name === 'login') { markNav(''); return renderLogin(); }

  try {
    switch (name) {
      case 'home': markNav('home'); return await renderHome();
      case 'post': markNav('home'); return await renderPost(parts[1]);
      case 'publish': markNav('publish'); return renderPublish();
      case 'messages': markNav('messages'); return await renderMessages();
      case 'chat': markNav('messages'); return await renderChat();
      case 'pm': markNav('messages'); return await renderPM(parts[1]);
      case 'me': markNav('me'); return await renderMe();
      case 'user': markNav(''); return await renderUserProfile(parts[1]);
      case 'checkin': markNav('me'); return await renderCheckin();
      case 'admin': markNav('me'); return await renderAdmin();
      case 'dev': markNav('me'); return await renderDev();
      default: location.hash = '#/'; return;
    }
  } catch (e) {
    app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">' + esc(e.message || '加载失败') + '</div></div></div>';
  }
}

/* ===================== 登录 ===================== */
function renderLogin() {
  document.getElementById('user-area').innerHTML = '';
  app.innerHTML =
    '<div class="auth-wrap"><div class="auth-card">' +
    '<h1>小木社区</h1><div class="sub">网页版与 App 数据互通，同一账号直接登录</div>' +
    '<div class="auth-tabs"><button class="on" data-mode="login">登录</button><button data-mode="register">注册</button></div>' +
    '<label class="field"><span>用户名</span><input id="auth-user" type="text" placeholder="至少 3 位"></label>' +
    '<label class="field"><span>密码</span><input id="auth-pass" type="password" placeholder="至少 4 位"></label>' +
    '<div id="auth-err" class="sub" style="color:var(--red);margin-bottom:8px"></div>' +
    '<button class="btn primary block" id="auth-submit">登录</button>' +
    '</div></div>';

  let mode = 'login';
  const tabs = app.querySelectorAll('.auth-tabs button');
  const submit = document.getElementById('auth-submit');
  tabs.forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    tabs.forEach(x => x.classList.toggle('on', x === b));
    submit.textContent = mode === 'login' ? '登录' : '注册并登录';
  });
  submit.onclick = async () => {
    const username = document.getElementById('auth-user').value.trim();
    const password = document.getElementById('auth-pass').value;
    const err = document.getElementById('auth-err');
    err.textContent = '';
    if (!username || !password) { err.textContent = '请输入用户名和密码'; return; }
    submit.disabled = true;
    try {
      const data = await api('/api/' + mode, { method: 'POST', body: { username, password } });
      saveAuth(data.token, data.user);
      toast(mode === 'login' ? '登录成功' : '注册成功');
      location.hash = '#/';
    } catch (e) {
      err.textContent = e.message;
    } finally {
      submit.disabled = false;
    }
  };
  document.getElementById('auth-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') submit.click();
  });
}

/* ===================== 板块门禁 ===================== */
async function ensureBoardAccess(board) {
  if (!board) return true;
  if (Number(board.age_restricted) === 1 && localStorage.getItem(AGE_KEY) !== '1') {
    const r = await openModal('年龄提示',
      '「' + esc(board.name) + '」仅限年满 16 岁的用户进入。<br>请确认你的年龄：',
      { okText: '我已满16岁', cancelText: '我未满16岁' });
    if (!r.ok) { toast('未满16岁不可进入该板块'); return false; }
    localStorage.setItem(AGE_KEY, '1');
  }
  if (Number(board.has_password) === 1 && !unlockedBoards.has(board.key)) {
    const pwd = await promptDialog('进入「' + board.name + '」', '请输入板块密码', { password: true });
    if (pwd === null) return false;
    try {
      await api('/api/boards/' + board.id + '/unlock', { method: 'POST', body: { password: pwd } });
      unlockedBoards.add(board.key);
      localStorage.setItem('xm_boards', JSON.stringify(Array.from(unlockedBoards)));
    } catch (e) {
      toast(e.message);
      return false;
    }
  }
  return true;
}

/* ===================== 帖子渲染 ===================== */
function pollHTML(post) {
  const poll = post.poll;
  if (!poll || !poll.options || !poll.options.length) return '';
  const total = Number(poll.total_votes || 0);
  const mine = Number(poll.my_option || 0);
  let h = '<div class="poll">';
  poll.options.forEach(o => {
    const votes = Number(o.votes || 0);
    const pct = total > 0 ? Math.round(votes * 100 / total) : 0;
    h += '<div class="opt' + (mine === Number(o.id) ? ' mine' : '') + '"' +
      (mine === 0 ? ' data-act="vote" data-post="' + post.id + '" data-option="' + o.id + '"' : '') + '>' +
      '<div class="bar" style="width:' + pct + '%"></div>' +
      '<span class="txt">' + esc(o.text) + (mine === Number(o.id) ? ' · 已投' : '') + '</span>' +
      '<span class="votes">' + votes + ' 票 · ' + pct + '%</span></div>';
  });
  h += '<div class="total">共 ' + total + ' 人投票</div></div>';
  return h;
}
function postHTML(p, detail) {
  const images = Array.isArray(p.images) ? p.images : [];
  const media = images.length
    ? '<div class="media-grid' + (images.length === 1 ? ' single' : '') + '">' +
      images.map(src => '<img src="' + esc(mediaUrl(src)) + '" alt="" loading="lazy" data-act="image" data-src="' + esc(mediaUrl(src)) + '">').join('') + '</div>'
    : '';
  const video = p.video
    ? '<div class="video-box"><video src="' + esc(mediaUrl(p.video)) + '" controls playsinline preload="metadata"></video></div>'
    : '';
  const boardName = (state.boards.find(b => b.key === p.topic) || {}).name || '社区';
  const liked = Number(p.liked) === 1 || p.liked === true;
  const content = detail ? esc(p.content) : esc(String(p.content || '').slice(0, 220)) + (String(p.content || '').length > 220 ? '…' : '');

  return '<div class="card post" id="post-' + p.id + '">' +
    '<div class="pad">' +
      '<div class="head">' +
        '<img class="avatar" src="' + esc(mediaUrl(p.avatar)) + '" alt="" data-act="user" data-id="' + p.user_id + '">' +
        '<div class="grow">' +
          '<div class="who" data-act="user" data-id="' + p.user_id + '">' + esc(p.username || '匿名用户') +
            ' <span class="sub">Lv.' + Math.max(1, Number(p.user_level || 1)) + '</span>' +
            (Number(p.user_developer) === 1 ? ' <span class="tag">开发者</span>' : '') +
            (p.user_role === 'admin' && Number(p.user_developer) !== 1 ? ' <span class="tag">管理员</span>' : '') +
          '</div>' +
          '<div class="time">' + ago(p.created_at) + ' · ' + esc(boardName) +
            (Number(p.pinned) === 1 ? ' · <span class="green">置顶</span>' : '') + '</div>' +
        '</div>' +
      '</div>' +
      (p.title ? '<div class="title" data-act="openpost" data-id="' + p.id + '">' + esc(p.title) + '</div>' : '') +
      '<div class="content" data-act="openpost" data-id="' + p.id + '">' + content + '</div>' +
      media + video + pollHTML(p) +
      '<div class="actions">' +
        '<button class="act' + (liked ? ' on' : '') + '" data-act="like" data-id="' + p.id + '">' +
          (liked ? '♥' : '♡') + ' <span data-like-count="' + p.id + '">' + Number(p.likes_count || 0) + '</span></button>' +
        '<button class="act" data-act="openpost" data-id="' + p.id + '">💬 <span>' + Number(p.comments_count || 0) + '</span></button>' +
        '<button class="act" data-act="share" data-id="' + p.id + '">↗ 分享</button>' +
      '</div>' +
    '</div></div>';
}

/* ===================== 首页 ===================== */
async function loadBoards() {
  const data = await api('/api/boards');
  state.boards = Array.isArray(data) ? data : [];
  return state.boards;
}
async function renderHome() {
  const h = state.home;
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  if (!state.boards.length) await loadBoards();

  let posts = [], pages = 1;
  try {
    const data = await api('/api/posts?sort=' + encodeURIComponent(h.sort) +
      '&page=' + h.page + '&topic=' + encodeURIComponent(h.topic) +
      (h.q ? '&q=' + encodeURIComponent(h.q) : ''));
    posts = data.posts || [];
    pages = data.pages || 1;
  } catch (e) { toast(e.message); }

  const chips = '<div class="chips" style="margin-bottom:10px">' +
    '<div class="chip' + (h.topic === 'recommend' ? ' on' : '') + '" data-act="topic" data-key="recommend">推荐</div>' +
    state.boards.map(b => '<div class="chip' + (h.topic === b.key ? ' on' : '') + '" data-act="topic" data-key="' + esc(b.key) + '" data-board="' + b.id + '">' +
      esc(b.name) + (Number(b.count) ? ' ' + b.count : '') + '</div>').join('') +
    '</div>';

  const toolbar = '<div class="row between" style="margin-bottom:10px">' +
    '<div class="row" style="gap:6px">' +
      '<button class="btn small ' + (h.sort === 'latest' ? 'soft' : '') + '" data-act="sort" data-sort="latest">最新</button>' +
      '<button class="btn small ' + (h.sort === 'hot' ? 'soft' : '') + '" data-act="sort" data-sort="hot">最热</button>' +
    '</div>' +
    '<input type="text" id="feed-search" placeholder="搜索帖子…" style="max-width:180px" value="' + esc(h.q) + '">' +
    '</div>';

  const list = posts.length ? posts.map(p => postHTML(p)).join('') : '<div class="card"><div class="empty">这里还没有帖子，去发一条吧</div></div>';
  const more = h.page < pages ? '<button class="btn block" id="load-more" style="margin:12px 0">加载更多</button>' : '';

  app.innerHTML = '<div class="page">' + chips + toolbar + list + more + '</div>';

  const search = document.getElementById('feed-search');
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') { h.q = search.value.trim(); h.page = 1; renderHome(); }
  });
  const moreBtn = document.getElementById('load-more');
  if (moreBtn) moreBtn.onclick = async () => {
    h.page++;
    const data = await api('/api/posts?sort=' + encodeURIComponent(h.sort) + '&page=' + h.page +
      '&topic=' + encodeURIComponent(h.topic) + (h.q ? '&q=' + encodeURIComponent(h.q) : ''));
    const extra = (data.posts || []).map(p => postHTML(p)).join('');
    moreBtn.insertAdjacentHTML('beforebegin', extra);
    if (h.page >= (data.pages || 1)) moreBtn.remove();
  };
}

/* ===================== 帖子详情 ===================== */
async function renderPost(id) {
  if (!id) { location.hash = '#/'; return; }
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  if (!state.boards.length) await loadBoards();
  const p = await api('/api/posts/' + id);
  const comments = p.comments || [];
  const commentHTML = comments.length
    ? comments.map(c =>
      '<div class="list-item" style="background:transparent;padding-left:0;padding-right:0">' +
      '<img src="' + esc(mediaUrl(c.avatar)) + '" alt="" data-act="user" data-id="' + c.user_id + '">' +
      '<div class="grow"><div class="who">' + esc(c.username || '匿名') +
        ' <span class="sub">Lv.' + Math.max(1, Number(c.user_level || 1)) + '</span></div>' +
        '<div style="font-size:13px;margin-top:2px">' + esc(c.content) + '</div>' +
        '<div class="muted" style="margin-top:2px">' + ago(c.created_at) + '</div></div></div>').join('')
    : '<div class="empty">还没有评论，快来抢沙发</div>';

  app.innerHTML = '<div class="page">' +
    '<div class="row between" style="margin-bottom:8px"><button class="btn small" data-act="back">‹ 返回</button>' +
    '<button class="btn small" data-act="reportpost" data-id="' + p.id + '">举报</button></div>' +
    postHTML(p, true) +
    '<div class="card pad"><div class="section-title" style="margin-top:0">评论 ' + comments.length + '</div>' +
      commentHTML +
      '<div class="chat-input" style="position:static;padding:10px 0 0;border-top:1px solid var(--line);margin-top:10px">' +
        '<input type="text" id="comment-input" placeholder="说点什么…" maxlength="500">' +
        '<button class="btn primary" id="comment-send">发送</button>' +
      '</div>' +
    '</div></div>';

  const send = async () => {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api('/api/posts/' + p.id + '/comments', { method: 'POST', body: { content: text } });
      input.value = '';
      toast('评论成功 +3 积分');
      renderPost(p.id);
    } catch (e) { toast(e.message); }
  };
  document.getElementById('comment-send').onclick = send;
  document.getElementById('comment-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

/* ===================== 发帖 ===================== */
function renderPublish() {
  app.innerHTML = '<div class="page"><div class="card pad">' +
    '<div class="section-title" style="margin-top:0">发布帖子</div>' +
    '<label class="field"><span>标题（可选）</span><input id="pub-title" type="text" maxlength="100" placeholder="起个标题"></label>' +
    '<label class="field"><span>正文</span><textarea id="pub-content" placeholder="分享你的想法…" maxlength="5000"></textarea></label>' +
    '<label class="field"><span>选择板块</span><div class="chips" id="pub-boards"></div></label>' +
    '<div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
      '<label class="btn small">添加图片<input id="pub-images" type="file" accept="image/*" multiple hidden></label>' +
      '<label class="btn small">添加视频<input id="pub-video" type="file" accept="video/*" hidden></label>' +
      '<button class="btn small" id="pub-poll-btn">发起投票</button>' +
    '</div>' +
    '<div id="pub-files" class="sub" style="margin-bottom:8px"></div>' +
    '<div id="pub-poll-box" class="card pad" style="display:none;margin:0 0 12px;box-shadow:none;border:1px solid var(--line)">' +
      '<div class="sub" style="margin-bottom:6px">投票选项（2-10 个）</div><div id="pub-opts"></div>' +
      '<button class="btn small" id="pub-add-opt" style="margin-top:6px">+ 添加选项</button>' +
    '</div>' +
    '<button class="btn primary block" id="pub-submit">发布</button>' +
    '</div></div>';

  let topic = state.boards.length ? state.boards[0].key : 'life';
  let images = [];
  let video = null;
  let pollMode = false;

  const boardBox = document.getElementById('pub-boards');
  if (!state.boards.length) {
    loadBoards().then(() => renderPublish());
    return;
  }
  boardBox.innerHTML = state.boards.map(b =>
    '<div class="chip' + (b.key === topic ? ' on' : '') + '" data-key="' + esc(b.key) + '">' + esc(b.name) + '</div>').join('');
  boardBox.querySelectorAll('.chip').forEach(ch => ch.onclick = () => {
    topic = ch.dataset.key;
    boardBox.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === ch));
  });

  const filesInfo = document.getElementById('pub-files');
  const refreshFiles = () => {
    filesInfo.textContent = (images.length ? '已选 ' + images.length + ' 张图片 ' : '') + (video ? '已选视频：' + video.name : '');
  };
  document.getElementById('pub-images').onchange = e => {
    images = Array.from(e.target.files).slice(0, 9);
    refreshFiles();
  };
  document.getElementById('pub-video').onchange = e => {
    video = e.target.files[0] || null;
    refreshFiles();
  };

  const pollBox = document.getElementById('pub-poll-box');
  const optsBox = document.getElementById('pub-opts');
  const addOpt = () => {
    if (optsBox.children.length >= 10) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = '选项 ' + (optsBox.children.length + 1);
    inp.style.marginBottom = '6px';
    optsBox.appendChild(inp);
  };
  addOpt(); addOpt();
  document.getElementById('pub-poll-btn').onclick = e => {
    pollMode = !pollMode;
    pollBox.style.display = pollMode ? '' : 'none';
    e.target.textContent = pollMode ? '取消投票' : '发起投票';
    e.target.classList.toggle('soft', pollMode);
  };
  document.getElementById('pub-add-opt').onclick = addOpt;

  document.getElementById('pub-submit').onclick = async e => {
    const btn = e.target;
    const title = document.getElementById('pub-title').value.trim();
    const content = document.getElementById('pub-content').value.trim();
    const options = pollMode ? Array.from(optsBox.querySelectorAll('input')).map(i => i.value.trim()).filter(Boolean) : [];
    if (pollMode && options.length < 2) { toast('投票至少需要 2 个选项'); return; }
    if (!pollMode && !content) { toast('说点什么再发布吧'); return; }

    const fd = new FormData();
    fd.append('title', title);
    fd.append('content', content);
    fd.append('topic', topic);
    if (pollMode) {
      fd.append('type', 'poll');
      fd.append('question', title);
      fd.append('poll_options', JSON.stringify(options));
    }
    images.forEach(f => fd.append('images', f));
    if (video) fd.append('video', video);

    btn.disabled = true; btn.textContent = '发布中…';
    try {
      const data = await api('/api/posts', { method: 'POST', form: fd });
      if (data.points !== undefined) updateUser({ points: data.points, level: data.level });
      toast('发布成功 +10 积分');
      location.hash = '#/post/' + data.id;
    } catch (err) {
      toast(err.message);
      btn.disabled = false; btn.textContent = '发布';
    }
  };
}

/* ===================== 消息 / 聊天 / 私信 ===================== */
async function renderMessages() {
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  const [friends, convs] = await Promise.all([
    api('/api/friends').catch(() => ({ friends: [], requests: [] })),
    api('/api/conversations').catch(() => ({ conversations: [] })),
  ]);
  const requests = friends.requests || [];
  const flist = friends.friends || [];
  const conversations = convs.conversations || [];

  const reqHTML = requests.length ? requests.map(r =>
    '<div class="list-item">' +
      '<img src="' + esc(mediaUrl(r.avatar)) + '" alt="" data-act="user" data-id="' + r.requester_id + '">' +
      '<div class="grow"><div class="who">' + esc(r.username) + ' <span class="sub">Lv.' + Math.max(1, Number(r.level || 1)) + '</span></div>' +
      '<div class="muted">请求添加你为好友</div></div>' +
      '<div class="ops"><button class="btn small primary" data-act="accept" data-id="' + r.id + '">同意</button>' +
      '<button class="btn small" data-act="decline" data-id="' + r.id + '">拒绝</button></div>' +
    '</div>').join('') : '<div class="empty">暂无好友申请</div>';

  const convHTML = conversations.length ? conversations.map(c =>
    '<div class="list-item" data-act="pm" data-id="' + c.id + '">' +
      '<img src="' + esc(mediaUrl(c.avatar)) + '" alt="">' +
      '<div class="grow"><div class="who">' + esc(c.username) + ' <span class="sub">Lv.' + Math.max(1, Number(c.level || 1)) + '</span>' +
      (Number(c.unread) ? ' <span class="chip on" style="padding:1px 7px;font-size:10px">' + c.unread + '</span>' : '') + '</div>' +
      '<div class="muted ellipsis">' + esc(c.last_message || '开始聊天吧') + '</div></div>' +
      '<div class="muted">' + (c.last_time ? ago(c.last_time) : '') + '</div></div>').join('')
    : '<div class="empty">还没有好友会话，去帖子下点别人头像加好友</div>';

  app.innerHTML = '<div class="page">' +
    '<div class="card pad">' +
      '<div class="row between"><div class="section-title" style="margin:0">好友申请 ' + requests.length + '</div>' +
      '<button class="btn small primary" data-act="chatroom">社区聊天室</button></div>' +
      '<div style="margin-top:6px">' + reqHTML + '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="pad" style="padding-bottom:6px"><div class="section-title" style="margin:0">好友 / 私信</div></div>' +
      convHTML +
    '</div>' +
    '<div class="card">' +
      '<div class="pad" style="padding-bottom:6px"><div class="section-title" style="margin:0">我的好友 ' + flist.length + '</div></div>' +
      (flist.length ? flist.map(f =>
        '<div class="list-item" data-act="user" data-id="' + f.id + '">' +
          '<img src="' + esc(mediaUrl(f.avatar)) + '" alt="">' +
          '<div class="grow"><div class="who">' + esc(f.username) + ' <span class="sub">Lv.' + Math.max(1, Number(f.level || 1)) + '</span></div>' +
          '<div class="muted ellipsis">' + esc(f.bio || '这个人很懒') + '</div></div>' +
          '<button class="btn small soft" data-act="pm" data-id="' + f.id + '" data-stop="1">私信</button></div>').join('')
        : '<div class="empty">还没有好友</div>') +
    '</div>' +
    '<div class="card">' +
      '<div class="pad" style="padding-bottom:6px"><div class="section-title" style="margin:0">通知</div></div>' +
      '<div id="notif-box"><div class="empty">加载中…</div></div>' +
    '</div></div>';

  try {
    const n = await api('/api/notifications');
    const list = n.notifications || [];
    document.getElementById('notif-box').innerHTML = list.length ? list.map(x =>
      '<div class="list-item" data-act="openpost" data-id="' + x.post_id + '">' +
        '<img src="' + esc(mediaUrl(x.avatar)) + '" alt="">' +
        '<div class="grow"><div class="who">' + esc(x.username || '系统') + '</div>' +
        '<div class="muted ellipsis">' + (x.type === 'like' ? '赞了你的帖子' : '评论：' + esc(x.content || '')) + '</div>' +
        '<div class="muted ellipsis">' + esc(x.post_title || '') + ' · ' + ago(x.created_at) + '</div></div></div>').join('')
      : '<div class="empty">暂时没有新通知</div>';
  } catch (e) { document.getElementById('notif-box').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}

async function renderChat() {
  app.innerHTML = '<div class="page"><div class="card" style="overflow:hidden">' +
    '<div class="pad row between" style="border-bottom:1px solid var(--line)"><b>社区聊天室</b>' +
    '<button class="btn small" data-act="back">返回</button></div>' +
    '<div class="chat-list" id="chat-list"></div>' +
    '<div class="chat-input"><input type="text" id="chat-text" placeholder="说点什么…" maxlength="500">' +
    '<button class="btn primary" id="chat-send">发送</button></div>' +
    '</div></div>';
  const list = document.getElementById('chat-list');
  let lastId = 0;
  const paint = msgs => {
    list.innerHTML = msgs.map(m =>
      '<div class="msg' + (Number(m.user_id) === myId() ? ' mine' : '') + '">' +
        (Number(m.user_id) === myId() ? '' : '<img src="' + esc(mediaUrl(m.avatar)) + '" alt="" data-act="user" data-id="' + m.user_id + '">') +
        '<div><div class="muted" style="margin-bottom:2px;' + (Number(m.user_id) === myId() ? 'text-align:right' : '') + '">' +
        esc(m.username) + ' · ' + ago(m.created_at) + '</div>' +
        '<div class="bubble">' + esc(m.content) + '</div></div></div>').join('') || '<div class="empty">还没有人说话</div>';
    list.scrollTop = list.scrollHeight;
  };
  const load = async () => {
    const data = await api('/api/chat' + (lastId ? '?after=' + lastId : ''));
    const msgs = data.messages || [];
    if (!lastId) paint(msgs);
    else if (msgs.length) {
      msgs.forEach(m => { list.insertAdjacentHTML('beforeend', '<div class="msg' + (Number(m.user_id) === myId() ? ' mine' : '') + '">' +
        (Number(m.user_id) === myId() ? '' : '<img src="' + esc(mediaUrl(m.avatar)) + '" alt="">') +
        '<div><div class="muted" style="margin-bottom:2px">' + esc(m.username) + ' · ' + ago(m.created_at) + '</div>' +
        '<div class="bubble">' + esc(m.content) + '</div></div></div>'); });
      list.scrollTop = list.scrollHeight;
    }
    if (msgs.length) lastId = msgs[msgs.length - 1].id;
  };
  await load().catch(e => toast(e.message));
  const timer = setInterval(() => load().catch(() => {}), 4000);
  window.__chatTimer && clearInterval(window.__chatTimer);
  window.__chatTimer = timer;

  const send = async () => {
    const input = document.getElementById('chat-text');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api('/api/chat', { method: 'POST', body: { content: text } });
      input.value = '';
      await load();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('chat-send').onclick = send;
  document.getElementById('chat-text').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

async function renderPM(id) {
  const otherId = Number(id);
  app.innerHTML = '<div class="page"><div class="card" style="overflow:hidden">' +
    '<div class="pad row between" style="border-bottom:1px solid var(--line)"><b>私信</b>' +
    '<button class="btn small" data-act="back">返回</button></div>' +
    '<div class="chat-list" id="pm-list"></div>' +
    '<div class="chat-input"><input type="text" id="pm-text" placeholder="发消息…" maxlength="1000">' +
    '<button class="btn primary" id="pm-send">发送</button></div>' +
    '</div></div>';
  const list = document.getElementById('pm-list');
  let lastId = 0;
  const timer = setInterval(() => load().catch(() => {}), 4000);
  window.__pmTimer && clearInterval(window.__pmTimer);
  window.__pmTimer = timer;
  const paint = msgs => {
    list.innerHTML = msgs.map(m => msgHTML(m)).join('') || '<div class="empty">还没有消息，打个招呼吧</div>';
    list.scrollTop = list.scrollHeight;
  };
  const msgHTML = m => '<div class="msg' + (Number(m.from_id) === myId() ? ' mine' : '') + '">' +
    (Number(m.from_id) === myId() ? '' : '<img src="' + esc(mediaUrl(m.avatar)) + '" alt="" data-act="user" data-id="' + m.from_id + '">') +
    '<div><div class="muted" style="margin-bottom:2px">' + esc(m.username) + ' · ' + ago(m.created_at) + '</div>' +
    '<div class="bubble">' + esc(m.content) + '</div></div></div>';
  const load = async () => {
    const data = await api('/api/messages/' + otherId + (lastId ? '?after=' + lastId : ''));
    const msgs = data.messages || [];
    if (!lastId) paint(msgs);
    else if (msgs.length) {
      msgs.forEach(m => list.insertAdjacentHTML('beforeend', msgHTML(m)));
      list.scrollTop = list.scrollHeight;
    }
    if (msgs.length) lastId = msgs[msgs.length - 1].id;
  };
  await load().catch(e => { list.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });

  const send = async () => {
    const input = document.getElementById('pm-text');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api('/api/messages/' + otherId, { method: 'POST', body: { content: text } });
      input.value = '';
      await load();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('pm-send').onclick = send;
  document.getElementById('pm-text').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
}

/* ===================== 我的 ===================== */
async function renderMe() {
  const me = await api('/api/me');
  const u = me.user || state.user;
  if (!u) { logout(); return; }
  updateUser(u);
  app.innerHTML = '<div class="page">' +
    '<div class="profile-hero">' +
      '<div class="row"><img class="avatar" src="' + esc(mediaUrl(u.avatar)) + '" alt="">' +
        '<div class="grow"><h2>' + esc(u.username) + '</h2>' +
        '<div style="font-size:12px;opacity:.9">Lv.' + Math.max(1, Number(u.level || 1)) + ' · ' + Number(u.points || 0) + ' 积分' +
        (Number(u.is_developer) === 1 ? ' · 开发者' : u.role === 'admin' ? ' · 管理员' : '') + '</div></div>' +
      '</div>' +
      '<div class="stats" id="me-stats"><div><b>-</b><span>帖子</span></div><div><b>-</b><span>获赞</span></div><div><b>-</b><span>粉丝</span></div><div><b>-</b><span>关注</span></div></div>' +
    '</div>' +
    '<div class="menu">' +
      '<div class="menu-item" data-act="checkin">🎁 签到 · 积分商城<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="myposts">📝 我的帖子<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="mylikes">❤️ 我赞过的<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="avatar">🖼️ 更换头像<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="resetavatar">🍃 使用默认树叶头像<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="bio">✏️ 修改签名<span class="arrow">›</span></div>' +
      '<div class="menu-item" data-act="pwd">🔒 修改密码<span class="arrow">›</span></div>' +
      (isAdmin() ? '<div class="menu-item" data-act="admin">🛠️ 管理后台<span class="arrow">›</span></div>' : '') +
      (isDev() ? '<div class="menu-item" data-act="dev">⚙️ 开发者设置（签到/商城）<span class="arrow">›</span></div>' : '') +
      '<a class="menu-item" href="/download/xiaomu-community.apk" download>📱 下载安卓 App<span class="arrow">›</span></a>' +
      '<div class="menu-item danger" data-act="logout">退出登录</div>' +
    '</div></div>';

  api('/api/users/' + u.id + '/profile').then(p => {
    const s = document.getElementById('me-stats');
    if (!s) return;
    s.innerHTML = '<div><b>' + (p.posts_count || 0) + '</b><span>帖子</span></div>' +
      '<div><b>' + (p.likes_received || 0) + '</b><span>获赞</span></div>' +
      '<div><b>' + (p.followers || 0) + '</b><span>粉丝</span></div>' +
      '<div><b>' + (p.following || 0) + '</b><span>关注</span></div>';
  }).catch(() => {});
}

/* ===================== 他人主页 ===================== */
async function renderUserProfile(id) {
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  if (!state.boards.length) await loadBoards();
  const p = await api('/api/users/' + id + '/profile');
  const self = Number(p.id) === myId();
  const fs = p.friend_status;

  let friendBtn = '';
  if (!self) {
    if (fs === 'friend') friendBtn = '<button class="btn small soft" data-act="pm" data-id="' + p.id + '">私信</button>';
    else if (fs === 'pending_out') friendBtn = '<button class="btn small" disabled>已申请</button>';
    else if (fs === 'pending_in') friendBtn = '<button class="btn small primary" data-act="acceptreq" data-id="' + p.friend_request_id + '">同意好友申请</button>';
    else friendBtn = '<button class="btn small primary" data-act="addfriend" data-id="' + p.id + '">加好友</button>';
  }

  app.innerHTML = '<div class="page">' +
    '<div class="row between" style="margin-bottom:8px"><button class="btn small" data-act="back">‹ 返回</button>' +
      '<button class="btn small ' + (p.is_following ? 'soft' : '') + '" data-act="follow" data-id="' + p.id + '">' + (p.is_following ? '已关注' : '+ 关注') + '</button></div>' +
    '<div class="profile-hero">' +
      '<div class="row"><img class="avatar" src="' + esc(mediaUrl(p.avatar)) + '" alt="">' +
        '<div class="grow"><h2>' + esc(p.username) + '</h2>' +
        '<div style="font-size:12px;opacity:.9">Lv.' + Math.max(1, Number(p.level || 1)) + ' · ' + Number(p.points || 0) + ' 积分' +
        (Number(p.is_developer) === 1 ? ' · 开发者' : p.role === 'admin' ? ' · 管理员' : '') + '</div>' +
        '<div style="font-size:12px;opacity:.85;margin-top:3px">' + esc(p.bio || '这个人很懒，什么都没留下') + '</div></div>' +
      '</div>' +
      '<div class="stats">' +
        '<div><b>' + (p.posts_count || 0) + '</b><span>帖子</span></div>' +
        '<div><b>' + (p.likes_received || 0) + '</b><span>获赞</span></div>' +
        '<div><b>' + (p.followers || 0) + '</b><span>粉丝</span></div>' +
        '<div><b>' + (p.following || 0) + '</b><span>关注</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="row" style="gap:8px;margin:10px 0">' + friendBtn +
      (self ? '<a class="btn small" href="#/checkin">签到商城</a>' : '') + '</div>' +
    '<div class="section-title">TA 的帖子</div>' +
    '<div id="user-posts"><div class="card"><div class="empty">加载中…</div></div></div></div>';

  const data = await api('/api/posts?sort=latest&user_id=' + p.id + '&page=1');
  const posts = data.posts || [];
  document.getElementById('user-posts').innerHTML = posts.length
    ? posts.map(x => postHTML(x)).join('')
    : '<div class="card"><div class="empty">还没有发布帖子</div></div>';
}

/* ===================== 签到 / 商城 ===================== */
async function renderCheckin() {
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  const [ci, rw] = await Promise.all([api('/api/checkin'), api('/api/rewards')]);
  updateUser({ points: ci.points, level: ci.level });

  const rewards = rw.rewards || [];
  app.innerHTML = '<div class="page">' +
    '<div class="points-hero"><div class="row between"><div><b>Lv.' + Math.max(1, Number(ci.level || 1)) + '</b>' +
      '<div style="font-size:12px;opacity:.9">' + Number(ci.points || 0) + ' 积分 · 累计签到 ' + Number(ci.total_days || 0) + ' 天</div></div>' +
      '<div style="text-align:right;font-size:12px;opacity:.9">连续签到<br><b style="font-size:19px">' + Number(ci.streak || 0) + ' 天</b></div></div></div>' +
    '<div class="card pad row between" style="margin-top:10px">' +
      '<div><b>' + (ci.checked ? '今日已签到' : '每日签到') + '</b>' +
      '<div class="muted" style="margin-top:2px">' + (ci.checked ? '明天再来吧' : '可得 ' + ci.reward + ' 积分') + '</div></div>' +
      '<button class="btn primary" id="ci-btn" ' + (ci.checked ? 'disabled' : '') + '>' + (ci.checked ? '已签到' : '立即签到') + '</button>' +
    '</div>' +
    '<div class="section-title">积分商城</div>' +
    '<div class="card">' + (rewards.length ? rewards.map(r =>
      '<div class="reward"><div class="icon">' + esc(r.icon || '礼') + '</div>' +
      '<div class="grow"><div style="font-weight:600">' + esc(r.title) + '</div>' +
      '<div class="muted">' + esc(r.description || '') + '</div>' +
      '<div class="green" style="font-size:12px;margin-top:2px">' + r.cost + ' 积分' +
        (Number(r.stock) >= 0 ? ' · 剩 ' + r.stock : '') + '</div></div>' +
      '<button class="btn small primary" data-act="redeem" data-id="' + r.id + '" data-title="' + esc(r.title) + '" data-cost="' + r.cost + '" ' +
        (Number(r.stock) === 0 ? 'disabled' : '') + '>' + (Number(r.stock) === 0 ? '已兑完' : '兑换') + '</button></div>').join('')
      : '<div class="empty">暂无可兑换商品</div>') + '</div></div>';

  document.getElementById('ci-btn').onclick = async () => {
    try {
      const r = await api('/api/checkin', { method: 'POST', body: {} });
      updateUser({ points: r.points, level: r.level });
      toast('签到成功，+' + r.gained + ' 积分');
      renderCheckin();
    } catch (e) { toast(e.message); }
  };
}

/* ===================== 管理后台 ===================== */
async function renderAdmin() {
  if (!isAdmin()) { toast('需要管理员权限'); location.hash = '#/me'; return; }
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  const tabs = [['stats', '数据概览'], ['users', '用户'], ['boards', '板块'], ['posts', '帖子'], ['reports', '举报']];
  let h = '<div class="page"><div class="row between" style="margin-bottom:8px">' +
    '<button class="btn small" data-act="back">‹ 返回</button><b>管理后台</b><span></span></div>' +
    '<div class="tabs">' + tabs.map(t => '<div class="chip' + (state.adminTab === t[0] ? ' on' : '') + '" data-act="admintab" data-tab="' + t[0] + '">' + t[1] + '</div>').join('') + '</div>' +
    '<div id="admin-body"><div class="card"><div class="empty">加载中…</div></div></div></div>';
  app.innerHTML = h;
  await renderAdminBody();
}

async function renderAdminBody() {
  const box = document.getElementById('admin-body');
  if (!box) return;
  const tab = state.adminTab;
  try {
    if (tab === 'stats') {
      const s = await api('/api/admin/stats');
      const items = [
        ['用户总数', s.users], ['帖子总数', s.posts], ['评论总数', s.comments],
        ['聊天消息', s.messages], ['今日发帖', s.today_posts], ['封禁用户', s.banned],
        ['禁言用户', s.muted], ['待处理举报', s.pending_reports],
      ];
      box.innerHTML = '<div class="card pad" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        items.map(i => '<div style="background:#F7F8FA;border-radius:12px;padding:12px">' +
          '<div class="muted">' + i[0] + '</div><div style="font-size:20px;font-weight:800;margin-top:2px">' + (i[1] || 0) + '</div></div>').join('') + '</div>';
      return;
    }
    if (tab === 'users') {
      const list = await api('/api/admin/users');
      box.innerHTML = '<div class="card">' + list.map(u =>
        '<div class="list-item"><img src="' + esc(mediaUrl(u.avatar)) + '" alt="">' +
        '<div class="grow"><div class="who">' + esc(u.username) + ' <span class="sub">Lv.' + Math.max(1, Number(u.level || 1)) + ' · ' + Number(u.points || 0) + '分</span>' +
          (Number(u.is_developer) === 1 ? ' <span class="tag">开发者</span>' : u.role === 'admin' ? ' <span class="tag">管理员</span>' : '') +
          (u.status === 'banned' ? ' <span class="tag" style="color:#E5484D;background:#FDECEC">封禁</span>' : '') + '</div>' +
        '<div class="muted">ID ' + u.id + (u.can_post === 0 ? ' · 无发言权限' : '') + '</div></div>' +
        '<button class="btn small" data-act="userops" data-id="' + u.id + '">管理</button></div>').join('') + '</div>';
      return;
    }
    if (tab === 'boards') {
      const list = await api('/api/boards');
      state.boards = list;
      box.innerHTML = '<div class="row between" style="margin-bottom:8px"><span></span><button class="btn small primary" data-act="newboard">+ 新建板块</button></div>' +
        '<div class="card">' + list.map(b =>
          '<div class="list-item"><div style="width:38px;height:38px;border-radius:50%;background:' + esc(b.color || '#00B34F') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">' + esc(b.icon || '社') + '</div>' +
          '<div class="grow"><div class="who">' + esc(b.name) + (Number(b.age_restricted) ? ' <span class="tag">16+</span>' : '') +
            (Number(b.has_password) ? ' <span class="tag">🔒密码</span>' : '') + '</div>' +
          '<div class="muted">' + Number(b.count || 0) + ' 篇帖子 · ' + esc(b.key) + '</div></div>' +
          '<div class="ops"><button class="btn small" data-act="editboard" data-id="' + b.id + '">编辑</button>' +
          '<button class="btn small danger" data-act="delboard" data-id="' + b.id + '" data-name="' + esc(b.name) + '">删除</button></div></div>').join('') + '</div>';
      return;
    }
    if (tab === 'posts') {
      const list = await api('/api/admin/posts');
      box.innerHTML = '<div class="card">' + list.map(p =>
        '<div class="list-item"><div class="grow">' +
        '<div class="who">' + esc(p.title || (p.content || '').slice(0, 24)) + '</div>' +
        '<div class="muted">' + esc(p.username || '') + ' · 赞 ' + (p.likes_count || 0) + ' · 评 ' + (p.comments_count || 0) +
          (Number(p.pinned) ? ' · 置顶' : '') + (p.status === 'hidden' ? ' · 已隐藏' : '') + '</div></div>' +
        '<div class="ops"><button class="btn small" data-act="pinpost" data-id="' + p.id + '">' + (Number(p.pinned) ? '取消置顶' : '置顶') + '</button>' +
        '<button class="btn small" data-act="hidepost" data-id="' + p.id + '">' + (p.status === 'hidden' ? '恢复' : '隐藏') + '</button>' +
        '<button class="btn small danger" data-act="delpost" data-id="' + p.id + '">删除</button></div></div>').join('') + '</div>';
      return;
    }
    const list = await api('/api/admin/reports');
    box.innerHTML = '<div class="card">' + (list.length ? list.map(r =>
      '<div class="list-item"><div class="grow"><div class="who">' + esc(r.reason || '举报') + ' · ' + esc(r.target_type) + ' #' + r.target_id + '</div>' +
      '<div class="muted">' + esc(r.username || '') + ' · ' + ago(r.created_at) + (r.status !== 'pending' ? ' · 已处理' : '') + '</div></div>' +
      '<div class="ops"><button class="btn small primary" data-act="report" data-id="' + r.id + '" data-mode="delete">删除内容</button>' +
      '<button class="btn small" data-act="report" data-id="' + r.id + '" data-mode="dismiss">忽略</button></div></div>').join('')
      : '<div class="empty">暂无举报</div>') + '</div>';
  } catch (e) {
    box.innerHTML = '<div class="card"><div class="empty">' + esc(e.message) + '</div></div>';
  }
}

/* ===================== 开发者设置 ===================== */
async function renderDev() {
  if (!isDev()) { toast('需要开发者权限'); location.hash = '#/me'; return; }
  app.innerHTML = '<div class="page"><div class="card pad"><div class="empty">加载中…</div></div></div>';
  const data = await api('/api/admin/rewards');
  const rewards = data.rewards || [];
  const redemptions = data.redemptions || [];
  app.innerHTML = '<div class="page">' +
    '<div class="row between" style="margin-bottom:8px"><button class="btn small" data-act="back">‹ 返回</button><b>开发者设置</b><span></span></div>' +
    '<div class="card pad">' +
      '<div class="row between"><div><b>每日签到积分</b><div class="muted">修改后所有用户签到按新值发放</div></div>' +
      '<div class="row" style="gap:6px"><input type="number" id="ci-points" style="width:90px" value="' + Number(data.checkin_points || 10) + '">' +
      '<button class="btn small primary" id="ci-save">保存</button></div></div>' +
    '</div>' +
    '<div class="row between" style="margin:10px 0 8px"><div class="section-title" style="margin:0">商城商品</div>' +
      '<button class="btn small primary" data-act="newreward">+ 新增商品</button></div>' +
    '<div class="card">' + (rewards.length ? rewards.map(r =>
      '<div class="reward"><div class="icon">' + esc(r.icon || '礼') + '</div>' +
      '<div class="grow"><div style="font-weight:600">' + esc(r.title) + (Number(r.enabled) ? '' : ' · 已下架') + '</div>' +
      '<div class="muted">' + esc(r.description || '') + '</div>' +
      '<div class="green" style="font-size:12px;margin-top:2px">' + r.cost + ' 积分 · ' + (Number(r.stock) < 0 ? '不限库存' : '库存 ' + r.stock) + '</div></div>' +
      '<div class="ops"><button class="btn small" data-act="editreward" data-id="' + r.id + '">编辑</button>' +
      '<button class="btn small danger" data-act="delreward" data-id="' + r.id + '" data-title="' + esc(r.title) + '">删除</button></div></div>').join('')
      : '<div class="empty">暂无商品</div>') + '</div>' +
    '<div class="section-title">最近兑换</div>' +
    '<div class="card pad">' + (redemptions.length ? redemptions.map(r =>
      '<div class="sub" style="padding:5px 0">· ' + esc(r.username || '用户') + ' 兑换了「' + esc(r.reward_title) + '」-' + r.cost + ' 积分 · ' + timeText(r.created_at) + '</div>').join('')
      : '<div class="empty">暂无兑换记录</div>') + '</div>' +
    '</div>';

  document.getElementById('ci-save').onclick = async () => {
    const points = Number(document.getElementById('ci-points').value);
    try {
      await api('/api/admin/settings/checkin', { method: 'PUT', body: { points } });
      toast('签到积分已更新');
    } catch (e) { toast(e.message); }
  };
}

/* ===================== 通用事件 ===================== */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;

  if (act === 'back') { history.length > 1 ? history.back() : (location.hash = '#/'); return; }
  if (act === 'topic') {
    const key = el.dataset.key;
    const board = state.boards.find(b => b.key === key);
    if (board) {
      const ok = await ensureBoardAccess(board);
      if (!ok) return;
    }
    state.home.topic = key; state.home.page = 1;
    renderHome();
    return;
  }
  if (act === 'sort') { state.home.sort = el.dataset.sort; state.home.page = 1; renderHome(); return; }
  if (act === 'user') { if (id) location.hash = '#/user/' + id; return; }
  if (act === 'openpost') { if (id) location.hash = '#/post/' + id; return; }
  if (act === 'image') { window.open(el.dataset.src, '_blank'); return; }
  if (act === 'share') {
    const url = location.origin + '/#/post/' + id;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else { navigator.clipboard.writeText(url).then(() => toast('链接已复制')).catch(() => toast(url)); }
    return;
  }
  if (act === 'like') {
    try {
      const r = await api('/api/posts/' + id + '/like', { method: 'POST', body: {} });
      const count = document.querySelector('[data-like-count="' + id + '"]');
      if (count) count.textContent = r.likes_count;
      el.classList.toggle('on', !!r.liked);
      el.innerHTML = (r.liked ? '♥' : '♡') + ' <span data-like-count="' + id + '">' + r.likes_count + '</span>';
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'vote') {
    try {
      await api('/api/posts/' + el.dataset.post + '/vote', { method: 'POST', body: { option_id: Number(el.dataset.option) } });
      toast('投票成功');
      route();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'follow') {
    try {
      const r = await api('/api/users/' + id + '/follow', { method: 'POST', body: {} });
      el.textContent = r.following ? '已关注' : '+ 关注';
      el.classList.toggle('soft', !!r.following);
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'addfriend') {
    try {
      await api('/api/friends/' + id + '/request', { method: 'POST', body: {} });
      toast('好友申请已发送');
      route();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'acceptreq') {
    try {
      await api('/api/friends/requests/' + id + '/accept', { method: 'POST', body: {} });
      toast('已添加为好友');
      route();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'accept' || act === 'decline') {
    try {
      await api('/api/friends/requests/' + id + '/' + act, { method: 'POST', body: {} });
      route();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'pm') {
    e.stopPropagation();
    location.hash = '#/pm/' + id;
    return;
  }
  if (act === 'chatroom') { location.hash = '#/chat'; return; }
  if (act === 'checkin') { location.hash = '#/checkin'; return; }
  if (act === 'myposts') {
    state.home = { topic: 'recommend', sort: 'latest', q: '', page: 1, userId: myId() };
    location.hash = '#/';
    return;
  }
  if (act === 'mylikes') { location.hash = '#/'; state.home.likedBy = myId(); return; }
  if (act === 'admin') { location.hash = '#/admin'; return; }
  if (act === 'dev') { location.hash = '#/dev'; return; }
  if (act === 'logout') {
    const ok = await confirmDialog('退出登录', '确定要退出当前账号吗？', '退出');
    if (ok) logout();
    return;
  }
  if (act === 'avatar') {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      const fd = new FormData();
      fd.append('avatar', inp.files[0]);
      try {
        const r = await api('/api/avatar', { method: 'POST', form: fd });
        updateUser({ avatar: r.avatar });
        toast('头像已更新');
        route();
      } catch (err) { toast(err.message); }
    };
    inp.click();
    return;
  }
  if (act === 'resetavatar') {
    try {
      const r = await api('/api/reset-avatar', { method: 'POST', body: {} });
      updateUser({ avatar: r.avatar });
      toast('已使用默认树叶头像');
      route();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'bio') {
    const bio = await promptDialog('修改签名', '一句话介绍自己', { value: state.user.bio || '' });
    if (bio === null) return;
    try {
      await api('/api/me/profile', { method: 'POST', body: { bio } });
      updateUser({ bio });
      toast('签名已更新');
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'pwd') {
    const r = await openModal('修改密码',
      '<label class="field"><span>原密码</span><input type="password" id="old-pwd"></label>' +
      '<label class="field"><span>新密码（至少4位）</span><input type="password" id="new-pwd"></label>');
    if (!r.ok) return;
    const oldp = r.body.querySelector('#old-pwd').value;
    const newp = r.body.querySelector('#new-pwd').value;
    try {
      await api('/api/me/password', { method: 'POST', body: { old_password: oldp, new_password: newp } });
      toast('密码已修改');
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'redeem') {
    const cost = Number(el.dataset.cost);
    const ok = await confirmDialog('兑换「' + el.dataset.title + '」', '将消耗 ' + cost + ' 积分，确认兑换？', '确认兑换');
    if (!ok) return;
    try {
      const r = await api('/api/rewards/' + id + '/redeem', { method: 'POST', body: {} });
      updateUser({ points: r.points, level: r.level });
      toast('兑换成功，请联系管理员领取奖励');
      renderCheckin();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'reportpost') {
    const ok = await confirmDialog('举报帖子', '确定举报该帖子吗？我们会尽快处理。', '举报');
    if (!ok) return;
    try {
      await api('/api/reports', { method: 'POST', body: { target_type: 'post', target_id: Number(id), reason: '用户举报' } });
      toast('举报成功，等待处理');
    } catch (err) { toast(err.message); }
    return;
  }

  /* ---- 管理后台 ---- */
  if (act === 'admintab') { state.adminTab = el.dataset.tab; renderAdmin(); return; }
  if (act === 'newboard') { return boardDialog(null); }
  if (act === 'editboard') {
    const b = (state.boards || []).find(x => Number(x.id) === Number(id));
    return boardDialog(b);
  }
  if (act === 'delboard') {
    if (!await confirmDialog('删除板块', '确定删除「' + el.dataset.name + '」？'+'', '删除')) return;
    try { await api('/api/admin/boards/' + id, { method: 'DELETE' }); toast('已删除'); renderAdmin(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (act === 'pinpost') {
    try { await api('/api/admin/posts/' + id + '/pin', { method: 'POST', body: {} }); renderAdminBody(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (act === 'hidepost') {
    try { await api('/api/admin/posts/' + id + '/hide', { method: 'POST', body: {} }); renderAdminBody(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (act === 'delpost') {
    if (!await confirmDialog('删除帖子', '删除后评论和点赞也会一起删除，确定删除？', '删除')) return;
    try { await api('/api/posts/' + id, { method: 'DELETE' }); toast('已删除'); renderAdminBody(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (act === 'report') {
    try {
      await api('/api/admin/reports/' + id, { method: 'POST', body: { action: el.dataset.mode } });
      toast('已处理'); renderAdminBody();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === 'userops') { return userOps(Number(id)); }

  /* ---- 开发者 ---- */
  if (act === 'newreward') { return rewardDialog(null); }
  if (act === 'editreward') {
    const data = await api('/api/admin/rewards');
    const r = (data.rewards || []).find(x => Number(x.id) === Number(id));
    return rewardDialog(r);
  }
  if (act === 'delreward') {
    if (!await confirmDialog('删除商品', '确定删除「' + el.dataset.title + '」？', '删除')) return;
    try { await api('/api/admin/rewards/' + id, { method: 'DELETE' }); toast('已删除'); renderDev(); }
    catch (err) { toast(err.message); }
    return;
  }
});

/* ---- 管理后台弹窗 ---- */
async function userOps(id) {
  const users = await api('/api/admin/users');
  const u = users.find(x => Number(x.id) === id);
  if (!u) return;
  if (Number(u.is_developer) === 1) {
    return confirmDialog(u.username, '开发者账号，管理员不可封禁、禁言或删除。', '知道了');
  }
  const actions = [
    { k: 'ban', label: u.status === 'banned' ? '解封账号' : '封禁账号' },
    { k: 'mute', label: '禁言 1 小时' },
    { k: 'unmute', label: '解除禁言' },
    { k: 'canpost', label: u.can_post === 0 ? '允许发言' : '禁止发言' },
    { k: 'role', label: u.role === 'admin' ? '取消管理员' : '设为管理员' },
    { k: 'del', label: '删除用户' },
  ];
  const body = '<div class="sub" style="margin-bottom:8px">' + esc(u.username) + ' · ID ' + u.id + '</div>' +
    actions.map(a => '<div class="list-item"><div class="grow">' + a.label + '</div><button class="btn small" data-op="' + a.k + '">执行</button></div>').join('');
  const r = await openModal('用户管理', body, { okText: '关闭', hideCancel: true });
  if (!r.ok) return;
  const clickOp = async ev => {
    const btn = ev.target.closest('[data-op]');
    if (!btn) return;
    const k = btn.dataset.op;
    try {
      if (k === 'ban') await api('/api/admin/users/' + id + '/ban', { method: 'POST', body: { ban: u.status !== 'banned' } });
      else if (k === 'mute') await api('/api/admin/users/' + id + '/mute', { method: 'POST', body: { minutes: 60, reason: '管理员操作' } });
      else if (k === 'unmute') await api('/api/admin/users/' + id + '/mute', { method: 'POST', body: { minutes: 0, reason: '' } });
      else if (k === 'canpost') await api('/api/admin/users/' + id + '/can-post', { method: 'POST', body: { can_post: u.can_post === 0 } });
      else if (k === 'role') await api('/api/admin/users/' + id + '/role', { method: 'POST', body: { role: u.role === 'admin' ? 'user' : 'admin' } });
      else if (k === 'del') {
        const yes = await confirmDialog('删除用户', '确定删除「' + u.username + '」？操作不可恢复。', '删除');
        if (!yes) return;
        await api('/api/admin/users/' + id, { method: 'DELETE' });
      }
      toast('已执行');
      document.getElementById('modal').hidden = true;
      renderAdminBody();
    } catch (err) { toast(err.message); }
  };
  document.getElementById('modal-body').onclick = clickOp;
}

async function boardDialog(board) {
  const edit = !!board;
  const b = board || {};
  const r = await openModal(edit ? '编辑板块' : '新建板块',
    '<label class="field"><span>板块名称</span><input id="bd-name" value="' + esc(b.name || '') + '" maxlength="20"></label>' +
    '<label class="field"><span>图标文字（1个字）</span><input id="bd-icon" value="' + esc(b.icon || '社') + '" maxlength="1"></label>' +
    '<label class="field"><span>板块简介</span><input id="bd-desc" value="' + esc(b.description || '') + '" maxlength="100"></label>' +
    '<label class="field"><span>背景色</span><input id="bd-color" value="' + esc(b.color || '#00B34F') + '"></label>' +
    '<label class="row" style="gap:6px;margin-bottom:6px"><input type="checkbox" id="bd-age" style="width:auto"' + (Number(b.age_restricted) ? ' checked' : '') + '> 仅限年满16岁用户进入</label>' +
    '<label class="row" style="gap:6px;margin-bottom:6px"><input type="checkbox" id="bd-pwd-on" style="width:auto"' + (Number(b.has_password) ? ' checked' : '') + '> 需要密码才能访问</label>' +
    '<label class="field"><span>板块密码</span><input id="bd-pwd" type="text" placeholder="' + (edit ? '留空表示不修改' : '设置访问密码') + '"></label>',
    { okText: '保存' });
  if (!r.ok) return;
  const g = s => r.body.querySelector(s);
  const name = g('#bd-name').value.trim();
  if (!name) { toast('板块名称必填'); return; }
  const pwdOn = g('#bd-pwd-on').checked;
  const pwd = g('#bd-pwd').value.trim();
  if (!edit && pwdOn && !pwd) { toast('请输入板块密码'); return; }
  const payload = {
    name, icon: g('#bd-icon').value.trim() || '社',
    description: g('#bd-desc').value.trim(), color: g('#bd-color').value.trim() || '#00B34F',
    age_restricted: g('#bd-age').checked ? 1 : 0,
  };
  if (!pwdOn) payload.password = '';
  else if (pwd) payload.password = pwd;
  try {
    if (edit) await api('/api/admin/boards/' + b.id, { method: 'PUT', body: payload });
    else await api('/api/admin/boards', { method: 'POST', body: payload });
    toast('已保存');
    await loadBoards();
    renderAdmin();
  } catch (e) { toast(e.message); }
}

async function rewardDialog(reward) {
  const edit = !!reward;
  const r = reward || {};
  const res = await openModal(edit ? '编辑商品' : '新增商品',
    '<label class="field"><span>商品名称</span><input id="rw-title" value="' + esc(r.title || '') + '" maxlength="40"></label>' +
    '<label class="field"><span>商品说明</span><input id="rw-desc" value="' + esc(r.description || '') + '" maxlength="200"></label>' +
    '<label class="field"><span>图标文字（1个字）</span><input id="rw-icon" value="' + esc(r.icon || '礼') + '" maxlength="2"></label>' +
    '<label class="field"><span>所需积分</span><input id="rw-cost" type="number" value="' + Number(r.cost || 100) + '"></label>' +
    '<label class="field"><span>库存（-1 表示不限）</span><input id="rw-stock" type="number" value="' + Number(r.stock === undefined ? -1 : r.stock) + '"></label>' +
    '<label class="row" style="gap:6px"><input type="checkbox" id="rw-enabled" style="width:auto"' + (r.enabled === undefined || Number(r.enabled) ? ' checked' : '') + '> 上架可兑换</label>',
    { okText: '保存' });
  if (!res.ok) return;
  const g = s => res.body.querySelector(s);
  const title = g('#rw-title').value.trim();
  if (!title) { toast('商品名称必填'); return; }
  const payload = {
    title, description: g('#rw-desc').value.trim(), icon: g('#rw-icon').value.trim() || '礼',
    cost: Math.max(1, Number(g('#rw-cost').value) || 100),
    stock: Number(g('#rw-stock').value),
    enabled: g('#rw-enabled').checked ? 1 : 0,
  };
  try {
    if (edit) await api('/api/admin/rewards/' + r.id, { method: 'PUT', body: payload });
    else await api('/api/admin/rewards', { method: 'POST', body: payload });
    toast('已保存');
    renderDev();
  } catch (e) { toast(e.message); }
}

/* 清理私聊轮询 */
window.addEventListener('hashchange', () => {
  if (window.__chatTimer) { clearInterval(window.__chatTimer); window.__chatTimer = null; }
  if (window.__pmTimer) { clearInterval(window.__pmTimer); window.__pmTimer = null; }
});
