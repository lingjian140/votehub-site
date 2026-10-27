// ========== 全局状态 ==========
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const state = {
  user: null,
  token: localStorage.getItem('token') || null,
  polls: [],
  page: 1,
  total: 0,
  filter: { sort: 'latest', search: '', status: '', mine: '' }
};

// ========== 工具 ==========
function toast(msg, type = '') {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; document.body.appendChild(t);
  }
  t.className = 'show ' + type;
  t.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', 2400);
}
async function api(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(url, { ...opts, headers: Object.assign(headers, opts.headers || {}) });
  let data; try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
async function apiFormData(url, fd) {
  const headers = state.token ? { Authorization: 'Bearer ' + state.token } : {};
  const res = await fetch(url, { method: 'POST', headers, body: fd });
  let data; try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data;
}
function html(str, ...args) {
  let i = 0;
  return str.replace(/\$\{([^}]+)\}/g, () => String(args[i++])
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
}
function timeAgo(s) {
  if (!s) return '';
  const d = new Date(s), now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
  return d.toLocaleDateString();
}
function fmtTime(s) { return s ? new Date(s).toLocaleString() : '-'; }

// ========== 认证 ==========
async function loadMe() {
  if (!state.token) { state.user = null; renderUser(); return; }
  try {
    const { user } = await api('/api/me');
    state.user = user;
    if (!user) { state.token = null; localStorage.removeItem('token'); }
  } catch {
    state.token = null; localStorage.removeItem('token');
  }
  renderUser();
}
function renderUser() {
  const area = $('#user-area');
  if (!state.user) {
    area.innerHTML = '<a class="btn small" href="#/login">登录</a><a class="btn small ghost" style="background:#eef2ff;color:#4f46e5" href="#/register">注册</a>';
  } else {
    const adminLink = state.user.role === 'admin' ? `<a class="btn small ghost" href="#/admin" style="background:#fef3c7;color:#92400e">管理后台</a>` : '';
    area.innerHTML = `<img class="avatar" src="${state.user.avatar}" onerror="this.src='/img/default-duck.svg'"><a href="#/me">${state.user.username}</a>${adminLink}<button class="btn small" id="logout">退出</button>`;
    $('#logout').onclick = () => { state.token = null; state.user = null; localStorage.removeItem('token'); location.hash = '#/'; };
  }
  // 高亮当前路由
  $$('.nav-links a').forEach(a => {
    const h = location.hash.slice(2) || '/';
    if (a.getAttribute('data-route') === h.split('?')[0]) a.classList.add('active'); else a.classList.remove('active');
  });
}

// ========== 路由 ==========
const routes = {
  '/': renderHome,
  '/create': renderCreate,
  '/p/:id': renderDetail,
  '/login': renderLogin,
  '/register': renderRegister,
  '/me': renderMe,
  '/admin': renderAdmin,
  '/u/:id': renderUserProfile
};
async function router() {
  await loadMe();
  const hash = location.hash.slice(1) || '/';
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr || '');
  const app = $('#app');
  const tplMatch = path.match(/^\/p\/(\d+)$/) || path.match(/^\/u\/(\d+)$/);
  const key = tplMatch ? path.match(/^\/p\//) ? '/p/:id' : '/u/:id' : path;
  const handler = routes[key];
  if (!handler) { app.innerHTML = '<div class="empty"><div class="emoji">🤔</div>页面不存在</div>'; return; }
  app.innerHTML = '<div class="loader">加载中…</div>';
  try {
    await handler(tplMatch ? tplMatch[1] : params, params);
  } catch (e) {
    app.innerHTML = `<div class="empty"><div class="emoji">😵</div>出错了：${e.message}</div>`;
  }
  renderUser();
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

// ========== 模板克隆 ==========
function useTpl(id) {
  const t = document.getElementById(id);
  const wrap = document.createElement('div');
  wrap.innerHTML = t.innerHTML;
  return wrap.firstElementChild;
}

// ========== 首页 ==========
async function renderHome(params, qs) {
  state.filter.mine = qs.get('mine') || '';
  if (qs.get('sort')) state.filter.sort = qs.get('sort');
  state.page = parseInt(qs.get('page')) || 1;

  const page = useTpl('tpl-home');
  $('#app').innerHTML = '';
  $('#app').appendChild(page);

  // 过滤事件
  $('[data-sort]')?.addEventListener('click', e => {
    state.filter.sort = e.target.dataset.sort; state.page = 1; router();
  });
  let searchTimer;
  $('[data-search]')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filter.search = e.target.value; state.page = 1; renderPolls(); }, 300);
  });
  $('[data-filter-status]')?.addEventListener('change', e => { state.filter.status = e.target.value; state.page = 1; renderPolls(); });

  await renderPolls();
}
async function renderPolls() {
  const q = new URLSearchParams({
    sort: state.filter.sort, page: state.page,
    search: state.filter.search, status: state.filter.status, mine: state.filter.mine
  });
  const data = await api('/api/polls?' + q.toString());
  const grid = $('#poll-grid');
  state.polls = data.polls; state.total = data.total;
  if (!data.polls.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="emoji">📭</div>暂无投票，快去创建一个吧！</div>';
  } else {
    grid.innerHTML = data.polls.map(p => {
      const total = p.votes_count;
      return `<div class="poll-card" data-id="${p.id}">
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
          <span class="badge ${p.status}">${p.status === 'active' ? '进行中' : '已结束'}</span>
          ${p.is_multiple ? '<span class="badge multi">多选</span>' : ''}
          ${p.is_anonymous ? '<span class="badge anon">匿名</span>' : ''}
        </div>
        <h3>${p.title}</h3>
        ${p.description ? '<p class="desc">' + p.description + '</p>' : ''}
        <div class="poll-meta">
          <span>🗳️ ${total} 票</span>
          <span>👀 ${p.views_count} 浏览</span>
          <span>💬 ${p.comments_count}</span>
        </div>
        <div class="poll-creator">
          <img src="${p.creator_avatar}" onerror="this.src='/img/default-duck.svg'">
          <a href="#/u/${p.creator_id}">${p.creator_name}</a>
          <span>· ${timeAgo(p.created_at)}</span>
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.poll-card').forEach(c => c.onclick = () => { location.hash = '#/p/' + c.dataset.id; });
  }
  // 分页
  const pager = $('#pager');
  const pages = data.pages;
  if (pages > 1) {
    let html = '';
    for (let i = 1; i <= pages; i++) {
      html += `<button class="${i === state.page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    pager.innerHTML = html;
    pager.querySelectorAll('button').forEach(b => b.onclick = () => { state.page = parseInt(b.dataset.page); renderPolls(); });
  } else { pager.innerHTML = ''; }
}

// ========== 创建投票 ==========
async function renderCreate() {
  if (!state.user) { location.hash = '#/login'; return; }
  const page = useTpl('tpl-create');
  $('#app').innerHTML = ''; $('#app').appendChild(page);
  const list = $('#options-list');
  const addOption = (v = '') => {
    const row = document.createElement('div'); row.className = 'option-row';
    row.innerHTML = `<input name="options" value="${v}" placeholder="选项文本"><button type="button" class="del">✕</button>`;
    row.querySelector('.del').onclick = () => { if (list.children.length > 2) row.remove(); else toast('至少保留2项', 'err'); };
    list.appendChild(row);
  };
  addOption(); addOption();
  $('#add-option').onclick = () => addOption();

  const multiCheck = document.querySelector('input[name=is_multiple]');
  const maxWrap = $('[data-max-wrap]');
  multiCheck.onchange = () => maxWrap.style.display = multiCheck.checked ? '' : 'none';

  $('#create-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const options = [...document.querySelectorAll('input[name=options]')].map(i => i.value).filter(Boolean);
    if (options.length < 2) { toast('至少2个选项', 'err'); return; }
    const payload = {
      title: fd.get('title'),
      description: fd.get('description'),
      is_multiple: multiCheck.checked,
      is_anonymous: fd.get('is_anonymous') ? true : false,
      max_choices: parseInt(fd.get('max_choices')) || options.length,
      start_time: fd.get('start_time') || null,
      end_time: fd.get('end_time') || null,
      options
    };
    try {
      const r = await api('/api/polls', { method: 'POST', body: JSON.stringify(payload) });
      toast('发布成功！', 'ok');
      location.hash = '#/p/' + r.id;
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ========== 详情 ==========
async function renderDetail(id) {
  const poll = await api('/api/polls/' + id);
  if (!state.user) { await loadMe(); }
  const d = $('#app');
  const total = poll.total_votes;
  const myChoiceIds = poll.my_choice_ids || [];
  const hasVoted = myChoiceIds.length > 0;
  const isOwner = state.user && state.user.id === poll.creator_id;
  const isAdmin = state.user && state.user.role === 'admin';
  const editable = isOwner || isAdmin;

  // 时间状态
  let timeState = '';
  const now = new Date();
  if (poll.status === 'closed') timeState = '<span class="badge closed">已结束</span>';
  else if (poll.start_time && new Date(poll.start_time) > now) timeState = '<span class="badge">未开始</span>';
  else if (poll.end_time && new Date(poll.end_time) < now) { poll.status = 'closed'; timeState = '<span class="badge closed">已截止</span>'; }
  else timeState = '<span class="badge active">进行中</span>';

  // 选项渲染
  const canVote = !hasVoted && poll.status === 'active' && (!poll.start_time || new Date(poll.start_time) <= now) && (!poll.end_time || new Date(poll.end_time) >= now);
  const winnerCount = poll.options.reduce((m, o) => Math.max(m, o.votes), 0);

  const optionsHtml = poll.options.map(o => {
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    const isWinner = o.votes === winnerCount && total > 0;
    const checked = myChoiceIds.includes(o.id) ? 'checked' : '';
    const inputType = poll.is_multiple ? 'checkbox' : 'radio';
    const bar = total || hasVoted || !canVote ? `<div class="bar-fill ${isWinner ? 'winner' : ''}" style="width:${pct}%"></div>` : '';
    return `<label class="option ${checked ? 'selected' : ''} ${hasVoted ? 'voted' : ''}">
      ${bar}
      <input type="${inputType}" name="opt" value="${o.id}" ${checked} ${canVote ? '' : 'disabled'}>
      <span class="opt-text">${o.text}</span>
      ${hasVoted || !canVote ? `<span class="opt-stat">${o.votes} 票 · ${pct}%</span>` : ''}
    </label>`;
  }).join('');

  const shareUrl = location.href;
  d.innerHTML = `
  <div class="detail-header card">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
      ${timeState}
      ${poll.is_multiple ? '<span class="badge multi">多选（最多' + (poll.max_choices || poll.options.length) + '项）</span>' : '<span class="badge">单选</span>'}
      ${poll.is_anonymous ? '<span class="badge anon">匿名投票</span>' : ''}
    </div>
    <h2>${poll.title}</h2>
    ${poll.description ? '<div class="note-box"><h4>📝 备注</h4><p>' + poll.description + '</p></div>' : ''}
    <div class="detail-meta">
      <span class="poll-creator">
        <img src="${poll.creator_avatar}" onerror="this.src='/img/default-duck.svg'">
        <a href="#/u/${poll.creator_id}">${poll.creator_name}</a>
      </span>
      <span>🗳️ ${total} 票</span>
      <span>👀 ${poll.views_count} 浏览</span>
      ${poll.start_time ? `<span>🕐 开始：${fmtTime(poll.start_time)}</span>` : ''}
      ${poll.end_time ? `<span>⏰ 截止：${fmtTime(poll.end_time)}</span>` : ''}
    </div>
    <div id="opts">${optionsHtml}</div>
    <div class="detail-actions">
      ${canVote ? `<button class="btn primary" id="vote-btn">🗳️ 提交投票</button>` : hasVoted ? '<span style="color:var(--success)">✓ 你已投票</span>' : '<span style="color:var(--muted)">投票已关闭</span>'}
      <button class="btn" id="copy-link">🔗 复制分享链接</button>
      <button class="btn" id="share-weibo">📣 分享到微博</button>
      ${editable ? `<button class="btn success" id="toggle-status">${poll.status === 'active' ? '🔒 关闭投票' : '🔓 重新开启'}</button>
        <button class="btn danger" id="del-poll">🗑 删除投票</button>
        <button class="btn" id="retract-votes">🧹 清空所有投票</button>
        <a class="btn" href="#/p/${poll.id}/stats" id="view-stats">📊 详细统计</a>` : ''}
    </div>
    <div class="share-link">
      <input readonly value="${shareUrl}" onclick="this.select()">
      <button class="btn small" id="copy-link2">复制</button>
    </div>
  </div>

  <div class="comments card">
    <h3 style="margin-bottom:12px">💬 评论 (${poll.comments.length})</h3>
    ${state.user ? `<form id="comment-form" style="display:flex;gap:8px;margin-bottom:14px">
      <input id="comment-input" placeholder="说点什么…" maxlength="500" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px" required>
      <button class="btn primary" type="submit">发送</button>
    </form>` : '<p style="color:var(--muted);margin-bottom:14px"><a href="#/login">登录</a> 后可发表评论</p>'}
    ${poll.comments.length ? poll.comments.map(c => `
      <div class="comment-item">
        <img src="${c.avatar || '/img/default-duck.svg'}" onerror="this.src='/img/default-duck.svg'">
        <div class="c-body">
          <div class="c-meta"><b>${c.username || '匿名'}</b> · ${timeAgo(c.created_at)}</div>
          <div class="c-content">${c.content}</div>
        </div>
      </div>
    `).join('') : '<p class="empty" style="padding:20px">暂无评论，抢个沙发？</p>'}
  </div>`;

  // 绑定投票
  if (canVote) {
    $('#vote-btn').onclick = async () => {
      const checked = [...document.querySelectorAll('input[name=opt]:checked')].map(i => parseInt(i.value));
      if (!checked.length) { toast('请至少选一项', 'err'); return; }
      try {
        await api(`/api/polls/${poll.id}/vote`, { method: 'POST', body: JSON.stringify({ option_ids: checked }) });
        toast('投票成功！', 'ok');
        renderDetail(id);
      } catch (e) { toast(e.message, 'err'); }
    };
    // 点击选项选中
    document.querySelectorAll('.option').forEach((opt, idx) => {
      opt.addEventListener('click', e => {
        if (!canVote) return;
        if (e.target.tagName === 'INPUT') return;
        const inp = opt.querySelector('input');
        if (poll.is_multiple) {
          inp.checked = !inp.checked;
        } else {
          document.querySelectorAll('.option input').forEach(i => i.checked = false);
          inp.checked = true;
        }
      });
    });
  }

  // 分享
  const copy = async () => { try { await navigator.clipboard.writeText(shareUrl); toast('链接已复制 ✓', 'ok'); } catch { toast('复制失败，请手动复制', 'err'); } };
  $('#copy-link').onclick = copy; $('#copy-link2').onclick = copy;
  $('#share-weibo').onclick = () => window.open(`https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(poll.title)}`, '_blank');

  // 管理员/创建者操作
  if (editable) {
    const ts = $('#toggle-status'); if (ts) ts.onclick = async () => {
      const next = poll.status === 'active' ? 'closed' : 'active';
      await api(`/api/polls/${poll.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      toast('状态已更新', 'ok'); renderDetail(id);
    };
    const dp = $('#del-poll'); if (dp) dp.onclick = async () => {
      if (!confirm('确认删除此投票？此操作不可恢复！')) return;
      await fetch(`/api/polls/${poll.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + state.token } });
      toast('已删除', 'ok'); location.hash = '#/';
    };
    const rv = $('#retract-votes'); if (rv) rv.onclick = async () => {
      if (!confirm('清空所有投票？')) return;
      await api(`/api/polls/${poll.id}/retract`, { method: 'POST' });
      toast('已清空', 'ok'); renderDetail(id);
    };
  }

  // 评论
  const cf = $('#comment-form');
  cf?.addEventListener('submit', async e => {
    e.preventDefault();
    const v = $('#comment-input').value.trim();
    if (!v) return;
    await api(`/api/polls/${poll.id}/comments`, { method: 'POST', body: JSON.stringify({ content: v }) });
    toast('评论成功', 'ok'); renderDetail(id);
  });

  // 统计页
  if (location.hash.endsWith('/stats')) {
    renderStats(id);
  }
}
async function renderStats(id) {
  const s = await api(`/api/polls/${id}/stats`);
  const html = `
  <div class="card">
    <h3>📊 统计 · ${s.poll.title}</h3>
    <p>总投票：${s.total_votes} · 浏览：${s.views}</p>
    <h4 style="margin-top:12px">选项分布</h4>
    ${s.stats.map(o => `<p>${o.text}：<b>${o.votes}</b> 票 (${s.total_votes ? Math.round(o.votes/s.total_votes*100) : 0}%)</p>`).join('')}
    <h4 style="margin-top:16px">投票明细（前 500）</h4>
    <table>
      <thead><tr><th>时间</th><th>选项</th><th>投票人</th></tr></thead>
      <tbody>
        ${s.voters.map(v => `<tr><td>${fmtTime(v.voted_at)}</td><td>${s.stats.find(o => o.id === v.option_id)?.text || '-'}</td><td>${v.username ? v.username : '匿名 (IP: ' + (v.voter_ip || '-') + ')'}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`;
  $('#app').insertAdjacentHTML('beforeend', html);
}

// ========== 登录注册 ==========
async function renderLogin() {
  const page = useTpl('tpl-login');
  $('#app').innerHTML = ''; $('#app').appendChild(page);
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { token, user } = await api('/api/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
      state.token = token; state.user = user;
      localStorage.setItem('token', token);
      toast('欢迎回来 ' + user.username + '！', 'ok');
      location.hash = '#/';
    } catch (err) { toast(err.message, 'err'); }
  };
}
async function renderRegister() {
  const page = useTpl('tpl-register');
  $('#app').innerHTML = ''; $('#app').appendChild(page);
  $('#register-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    if (data.password !== data.confirm) { toast('两次密码不一致', 'err'); return; }
    try {
      const { token, user } = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: data.username, password: data.password }) });
      state.token = token; state.user = user;
      localStorage.setItem('token', token);
      toast('注册成功！', 'ok');
      location.hash = '#/';
    } catch (err) { toast(err.message, 'err'); }
  };
}

// ========== 个人中心 ==========
async function renderMe() {
  if (!state.user) { location.hash = '#/login'; return; }
  const u = await api('/api/users/' + state.user.id);
  const el = useTpl('tpl-me');
  $('#app').innerHTML = ''; $('#app').appendChild(el);
  $('#me-content').innerHTML = `
    <div class="me-header">
      <img class="avatar" src="${state.user.avatar}" onerror="this.src='/img/default-duck.svg'">
      <div>
        <h3>${u.username} ${u.role === 'admin' ? '<span class="badge" style="background:#fef3c7;color:#92400e;margin-left:6px">管理员</span>' : ''}</h3>
        <p style="color:var(--muted);font-size:13px">注册于 ${fmtTime(u.created_at)}</p>
        <div class="avatar-controls">
          <label class="btn small">🖼 上传新头像<input id="avatar-input" type="file" accept="image/*" style="display:none"></label>
          <button class="btn small" id="reset-avatar">↩ 恢复卡达鸭头像</button>
        </div>
      </div>
    </div>
    <hr style="border-color:var(--border);margin:14px 0">
    <h3 style="margin-bottom:10px">我创建的投票（${u.polls.length}）</h3>
    ${u.polls.length ? `<table>
      <thead><tr><th>ID</th><th>标题</th><th>票数</th><th>时间</th><th>操作</th></tr></thead>
      <tbody>${u.polls.map(p => `<tr>
        <td>${p.id}</td>
        <td><a href="#/p/${p.id}">${p.title}</a></td>
        <td>${p.votes_count}</td>
        <td>${timeAgo(p.created_at)}</td>
        <td><a class="btn small" href="#/p/${p.id}/stats">统计</a></td>
      </tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--muted)">还没创建过投票</p>'}
  `;
  $('#avatar-input').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('avatar', f);
    try {
      const { avatar } = await apiFormData('/api/avatar', fd);
      state.user.avatar = avatar;
      localStorage.setItem('token', state.token);
      toast('头像已更新', 'ok'); renderMe();
    } catch (err) { toast(err.message, 'err'); }
  };
  $('#reset-avatar').onclick = async () => {
    const { avatar } = await api('/api/reset-avatar', { method: 'POST' });
    state.user.avatar = avatar; toast('已恢复默认头像', 'ok'); renderMe();
  };
}

// ========== 用户主页 ==========
async function renderUserProfile(id) {
  const u = await api('/api/users/' + id);
  const html = `
    <div class="card">
      <div class="me-header">
        <img class="avatar" src="${u.avatar}" onerror="this.src='/img/default-duck.svg'">
        <div>
          <h3>${u.username}</h3>
          <p style="color:var(--muted);font-size:13px">注册于 ${fmtTime(u.created_at)}</p>
        </div>
      </div>
    </div>
    <h3 style="margin:16px 0 10px">TA 的投票</h3>
    ${u.polls.length ? `<div class="poll-grid">
      ${u.polls.map(p => `<div class="poll-card" onclick="location.hash='#/p/${p.id}'">
        <h3>${p.title}</h3>
        <div class="poll-meta"><span>🗳️ ${p.votes_count} 票</span><span>· ${timeAgo(p.created_at)}</span></div>
      </div>`).join('')}
    </div>` : '<div class="empty">暂无投票</div>'}
  `;
  $('#app').innerHTML = `<div class="container narrow">${html}</div>`;
}

// ========== 管理员 ==========
async function renderAdmin() {
  if (!state.user) { location.hash = '#/login'; return; }
  if (state.user.role !== 'admin') { $('#app').innerHTML = '<div class="empty">需要管理员权限</div>'; return; }
  const users = await api('/api/admin/users');
  const html = `
    <div class="container">
      <h2>管理后台</h2>
      <div class="card">
        <h3>用户管理</h3>
        <table><thead><tr><th>ID</th><th>用户名</th><th>角色</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
          ${users.map(u => `<tr>
            <td>${u.id}</td>
            <td><a href="#/u/${u.id}">${u.username}</a></td>
            <td>${u.role}</td>
            <td>${fmtTime(u.created_at)}</td>
            <td>
              <button class="btn small" data-role="${u.id}">${u.role === 'admin' ? '降为普通用户' : '升为管理员'}</button>
              ${u.id !== state.user.id ? `<button class="btn small danger" data-del="${u.id}">删除</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
  $('#app').innerHTML = html;
  document.querySelectorAll('[data-role]').forEach(b => b.onclick = async () => {
    const id = b.dataset.role;
    const row = users.find(x => x.id === id);
    const nextRole = row.role === 'admin' ? 'user' : 'admin';
    await api(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role: nextRole }) });
    toast('已更新', 'ok'); router();
  });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('确认删除此用户？')) return;
    await api(`/api/admin/users/${b.dataset.del}`, { method: 'DELETE' });
    toast('已删除', 'ok'); router();
  });
}
