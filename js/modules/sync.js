/**
 * 同步模块的安全占位实现。
 *
 * 纯静态站点没有可信的身份验证或服务端数据隔离能力，因此不能在浏览器中
 * 模拟注册、保存密码或伪造跨设备同步。接入 Supabase、Firebase 或自建 API 后，
 * 再替换本模块并在服务端配置认证、权限策略和数据隔离。
 */
const SyncModule = (() => {
  function clearLegacyLocalCredentials() {
    // 清除旧版本遗留的本地账号和会话，避免继续保存弱哈希密码。
    localStorage.removeItem('kaoyan_users');
    if (State.get('user')) {
      State.set('user', null);
      State.persist('user');
    }
  }

  clearLegacyLocalCredentials();

  function unavailable() {
    return {
      ok: false,
      msg: '云端同步尚未配置，请先接入安全的认证和数据服务'
    };
  }

  function isAvailable() { return false; }
  function isLoggedIn() { return false; }
  function getCurrentUser() { return null; }
  function login() { return unavailable(); }
  function logout() { return { ok: true, msg: '当前为本地模式' }; }
  function pushToCloud() { return unavailable(); }
  function pullFromCloud() { return unavailable(); }
  function syncAll() { return unavailable(); }
  function startAutoSync() {}
  function stopAutoSync() {}

  return {
    isAvailable, isLoggedIn, getCurrentUser,
    login, logout, pushToCloud, pullFromCloud, syncAll,
    startAutoSync, stopAutoSync
  };
})();
