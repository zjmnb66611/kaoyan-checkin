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
    // 注意：此哈希仅用于 web 前端本地标识，非加密安全用途。
    // 实际部署时应替换为后端 bcrypt/argon2
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

      // 逐项合并而非整键覆盖，避免丢失云端较新的单条数据
      const cloudRaw = localStorage.getItem(cloudKey);
      if (cloudRaw) {
        try {
          const cloudData = JSON.parse(cloudRaw);
          // 数组类型：逐 id 比较 updatedAt，以较新者为准
          if (Array.isArray(localData) && Array.isArray(cloudData)) {
            const merged = mergeArrays(localData, cloudData);
            localStorage.setItem(cloudKey, JSON.stringify(merged));
            return;
          }
          // 对象类型：以 updatedAt 较新者为准
          const localTime = (localData && localData.updatedAt) || '';
          const cloudTime = (cloudData && cloudData.updatedAt) || '';
          if (cloudTime > localTime) return; // 云端更新，不上传
        } catch (e) {}
      }

      localStorage.setItem(cloudKey, JSON.stringify(localData));
    });

    return { ok: true, msg: '数据已上传' };
  }

  function mergeArrays(localArr, cloudArr) {
    const mergedMap = new Map();
    localArr.forEach(item => { if (item && item.id) mergedMap.set(item.id, item); });
    cloudArr.forEach(item => {
      if (!item || !item.id) return;
      const local = mergedMap.get(item.id);
      if (!local) {
        mergedMap.set(item.id, item);
      } else {
        const localTime = local.updatedAt || '';
        const cloudTime = item.updatedAt || '';
        if (cloudTime > localTime) mergedMap.set(item.id, item);
      }
    });
    return [...mergedMap.values()];
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
          // 数组类型：逐 id 合并（以较新者为准）
          const merged = mergeArrays(localData, cloudData)
            .filter(d => !d.deleted);

          // 检查是否有实际变化
          const localIds = new Set(localData.map(d => d.id));
          const mergedIds = new Set(merged.map(d => d.id));
          const hasNew = merged.some(d => !localIds.has(d.id));
          const hasUpdate = localData.some(d => {
            const mc = merged.find(m => m.id === d.id);
            return mc && (mc.updatedAt || '') > (d.updatedAt || '');
          });

          if (hasNew || hasUpdate) {
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

  // ─── 自动同步 ───
  let _syncIntervalId = null;
  let _debounceTimerId = null;

  function startAutoSync(intervalMs = 30000) {
    stopAutoSync();
    _syncIntervalId = setInterval(() => {
      if (isLoggedIn()) pushToCloud();
    }, intervalMs);
  }

  function stopAutoSync() {
    if (_syncIntervalId) {
      clearInterval(_syncIntervalId);
      _syncIntervalId = null;
    }
    if (_debounceTimerId) {
      clearTimeout(_debounceTimerId);
      _debounceTimerId = null;
    }
  }

  // 监听本地数据变更，实时上传到云端（2 秒 debounce）
  document.addEventListener('task:changed', () => {
    if (isLoggedIn()) {
      clearTimeout(_debounceTimerId);
      _debounceTimerId = setTimeout(() => pushToCloud(), 2000);
    }
  });

  return {
    isLoggedIn, getCurrentUser, login, logout,
    pushToCloud, pullFromCloud, syncAll,
    startAutoSync, stopAutoSync
  };
})();
