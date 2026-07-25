/**
 * 状态管理 - 简易 Observer 模式
 */
const State = (() => {
  let _state = {
    tasks: [],
    subjects: [],
    restDays: [],
    leaves: [],
    recurringRules: [],
    settings: {
      examDate: '2026-12-25',
      autoPostpone: true,
      breakWarning: true,
      breakWarningTime: '22:00',
      viewMode: 'compact',
      taskStyle: 'checkbox-left',
      countdownCollapsed: false,
      progressCollapsed: false,
      searchExpanded: false
    },
    checkinStats: {
      totalDays: 0,
      consecutiveDays: 0,
      weeklyMakeupUsed: 0,
      weeklyMakeupResetDate: '',
      lastCheckinDate: '',
      dailyCompletion: {}
    },
    user: null
  };

  const _listeners = {};

  function get(key) {
    return key ? _state[key] : _state;
  }

  function set(key, value) {
    const old = _state[key];
    _state[key] = value;
    notify(key, value, old);
  }

  function update(key, partial) {
    const old = { ..._state[key] };
    if (typeof _state[key] === 'object' && !Array.isArray(_state[key])) {
      _state[key] = { ..._state[key], ...partial };
    } else {
      _state[key] = partial;
    }
    notify(key, _state[key], old);
  }

  function subscribe(key, fn) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(fn);
    return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); };
  }

  function notify(key, val, old) {
    (_listeners[key] || []).forEach(fn => fn(val, old));
    (_listeners['*'] || []).forEach(fn => fn(key, val, old));
  }

  function loadFromStorage() {
    const keys = ['tasks','subjects','restDays','leaves','recurringRules','settings','checkinStats','user'];
    const arrayKeys = ['tasks','subjects','restDays','leaves','recurringRules'];
    const objectKeys = ['settings','checkinStats'];

    keys.forEach(k => {
      const raw = localStorage.getItem('kaoyan_' + k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // 类型校验：避免错误形状的数据导致后续代码崩溃
          if (arrayKeys.includes(k) && !Array.isArray(parsed)) {
            console.warn('State: 数据形状异常，已重置 ' + k, parsed);
            return; // 保留默认值
          }
          if (objectKeys.includes(k) && (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null)) {
            console.warn('State: 数据形状异常，已重置 ' + k, parsed);
            return;
          }
          if (k === 'settings' || k === 'checkinStats') {
            _state[k] = { ..._state[k], ...parsed };
          } else {
            _state[k] = parsed;
          }
        } catch (e) { /* 解析失败，保留默认值 */ }
      }
    });
  }

  function saveToStorage(key) {
    localStorage.setItem('kaoyan_' + key, JSON.stringify(_state[key]));
  }

  function persist(key) {
    saveToStorage(key);
    notify(key, _state[key], null);
  }

  // 初始化
  loadFromStorage();

  // 确保预置科目存在
  if (!_state.subjects || _state.subjects.length === 0) {
    _state.subjects = [
      { id: 'preset-english', name: '英语', color: '#E07B5A', icon: 'fa-book', sortOrder: 0, isPreset: true },
      { id: 'preset-politics', name: '政治', color: '#C0392B', icon: 'fa-flag', sortOrder: 1, isPreset: true },
      { id: 'preset-math-analysis', name: '数学分析', color: '#2980B9', icon: 'fa-calculator', sortOrder: 2, isPreset: true },
      { id: 'preset-advanced-algebra', name: '高等代数', color: '#8E44AD', icon: 'fa-superscript', sortOrder: 3, isPreset: true },
      { id: 'preset-probability', name: '概率论', color: '#16A085', icon: 'fa-pie-chart', sortOrder: 4, isPreset: true }
    ];
    saveToStorage('subjects');
  }

  return { get, set, update, subscribe, persist, loadFromStorage, saveToStorage };
})();
