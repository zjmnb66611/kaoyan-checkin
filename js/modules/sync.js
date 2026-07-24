/**
 * 云端同步与简易登录模块
 * 使用 localStorage 模拟云端存储，实际部署时可替换为真实后端 API
 */
const SyncModule = (() => {
  // 云端存储 key 前缀
  const CLOUD_PREFIX = 'kaoyan_cloud_';

  function isLoggedIn() {
    return !!State.get('user');
  }

  function getCurrentUser() {
    return State.get('user');
  }

  // ─── 简易登录 / 注册 ───
  function login(username, password) {
    if (!username || !password) return { ok: false, msg: '请输入用户名和密码' };
    if (username.trim().length < 2) return { ok: false, msg: '用户名至少2个字符' };
    if (password.length < 4) return { ok: false, msg: '密码至少4个字符' };

    const users = JSON.parse(localStorage.getItem('kaoyan_users') || '[]');
    const existing = users.find(u => u.username === username);

    if (existing) {
      // 登录
      if (existing.password !== simpleHash(password)) {
        return { ok: false, msg: '密码错误' };
      }
      return doLogin(existing);
    } else {
      // 注册
      const newUser = {
        id: DateUtils.uuid(),
        username,
        password: simpleHash(password),
        createdAt: DateUtils.nowISO()
      };
      users.push(newUser);
      localStorage.setItem('kaoyan_users', JSON.stringify(users));
      return doLogin(newUser);
    }
  }

  function doLogin(user) {
    State.set('user', { id: user.id, username: user.username, loggedInAt: DateUtils.nowISO() });
    State.persist('user');
    // 登录后拉取云端数据
    pullFromCloud();
    return { ok: true, msg: '登录成功', user: State.get('user') };
  }

  function logout() {
    // 先上传本地数据
    pushToCloud();
    State.set('user', null);
    State.persist('user');
    return { ok: true, msg: '已退出登录' };
  }

  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return String(Math.abs(hash));
  }

  // ─── 云端数据操作 ───
  function pushToCloud() {
    if (!isLoggedIn()) return { ok: false, msg: '未登录' };

    const userId = getCurrentUser().id;
    const keys = ['tasks', 'subjects', 'restDays', 'leaves', 'recurringRules', 'settings', 'checkinStats'];

    keys.forEach(k => {
      const localData = State.get(k);
      const cloudKey = CLOUD_PREFIX + userId + '_' + k;

      // 检查云端是否有更新的数据
      const cloudRaw = localStorage.getItem(cloudKey);
      if (cloudRaw) {
        try {
          const cloudData = JSON.parse(cloudRaw);
          const localTime = getLatestModifyTime(localData);
          const cloudTime = getLatestModifyTime(cloudData);
          // 云端更新则以云端为准
          if (cloudTime > localTime) return;
        } catch (e) {}
      }

      localStorage.setItem(cloudKey, JSON.stringify(localData));
    });

    return { ok: true, msg: '数据已上传' };
  }

  function pullFromCloud() {
    if (!isLoggedIn()) return { ok: false, msg: '未登录' };

    const userId = getCurrentUser().id;
    const keys = ['tasks', 'subjects', 'restDays', 'leaves', 'recurringRules', 'settings', 'checkinStats'];
    let updated = 0;

    keys.forEach(k => {
      const cloudKey = CLOUD_PREFIX + userId + '_' + k;
      const cloudRaw = localStorage.getItem(cloudKey);
      if (!cloudRaw) return;

      try {
        const cloudData = JSON.parse(cloudRaw);
        const localData = State.get(k);

        if (k === 'settings' || k === 'checkinStats' || k === 'user') {
          // 对象类型：以时间较新者为准
          const localTime = (localData && localData.updatedAt) || '';
          const cloudTime = cloudData.updatedAt || '';
          if (!localData || cloudTime > localTime) {
            State.set(k, cloudData);
            State.persist(k);
            updated++;
          }
        } else if (Array.isArray(localData)) {
          // 数组类型：合并（云端优先，本地未同步的上传）
          let merged = [...localData];
          let mergedIds = new Set(localData.map(d => d.id));
          let changed = false;

          cloudData.forEach(cloudItem => {
            const localIdx = merged.findIndex(d => d.id === cloudItem.id);
            if (localIdx === -1) {
              merged.push(cloudItem);
              changed = true;
            } else {
              const localTime = merged[localIdx].updatedAt || '';
              const cloudTime = cloudItem.updatedAt || '';
              if (cloudTime > localTime) {
                merged[localIdx] = cloudItem;
                changed = true;
              }
            }
          });

          // 删除标记同步
          merged = merged.filter(d => !d.deleted);

          if (changed) {
            State.set(k, merged);
            State.persist(k);
            updated++;
          }
        }
      } catch (e) {}
    });

    if (updated > 0) {
      document.dispatchEvent(new CustomEvent('task:changed'));
    }

    return { ok: true, msg: `已同步 ${updated} 项数据`, updated };
  }

  function syncAll() {
    const pushResult = pushToCloud();
    const pullResult = pullFromCloud();
    return { ok: true, push: pushResult, pull: pullResult };
  }

  function getLatestModifyTime(data) {
    if (!data) return '';
    if (data.updatedAt) return data.updatedAt;
    if (Array.isArray(data)) {
      let max = '';
      data.forEach(d => {
        if (d.updatedAt && d.updatedAt > max) max = d.updatedAt;
      });
      return max;
    }
    return '';
  }

  // ─── 自动同步 ───
  let autoSyncTimer = null;

  function startAutoSync(intervalMs = 30000) {
    stopAutoSync();
    autoSyncTimer = setInterval(() => {
      if (isLoggedIn()) pushToCloud();
    }, intervalMs);
  }

  function stopAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  // 监听本地数据变更，实时缓存到云端
  document.addEventListener('task:changed', () => {
    if (isLoggedIn()) {
      // 延迟上传避免频繁写入
      clearTimeout(autoSyncTimer);
      autoSyncTimer = setTimeout(() => pushToCloud(), 2000);
    }
  });

  return {
    isLoggedIn, getCurrentUser, login, logout,
    pushToCloud, pullFromCloud, syncAll,
    startAutoSync, stopAutoSync
  };
})();
