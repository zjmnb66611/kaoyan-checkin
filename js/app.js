/**
 * hash 路由 + 主入口
 */
const App = (() => {
  // 当前页面
  let currentPage = 'home';
  let currentCalendarView = 'month';
  let currentCalendarDate = DateUtils.today();

  function escapeText(value) {
    return Validate.sanitizeHTML(String(value ?? ''));
  }

  function safeColor(value) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value || '') ? value : '#a8a29e';
  }

  function init() {
    // 刷新周期性任务
    RecurringModule.refresh();

    // 昨日有未完成任务时，后续待完成计划整体顺延一天。
    TaskModule.postponeUncompletedTasks(DateUtils.addDays(DateUtils.today(), -1));

    // 统一处理已配置的休息日/请假日，确保后续计划按序后移且不会重复后移。
    RestModule.applyPostponement();

    // 更新打卡统计
    CheckinModule.updateCheckinStats();

    // 路由监听
    window.addEventListener('hashchange', handleRoute);
    renderGlobalSearch();
    _setupGlobalSearchDelegates();
    handleRoute();

    // 断卡预警定时检查
    setInterval(() => CheckinModule.checkBreakWarning(), 60000);
    // 首次延迟检查
    setTimeout(() => CheckinModule.checkBreakWarning(), 3000);

    // 全局事件监听
    document.addEventListener('task:changed', () => {
      CheckinModule.updateCheckinStats();
      if (currentPage === 'home') renderHome();
      if (currentPage === 'calendar') renderCalendar();
      if (currentPage === 'review') renderReview();
      if (currentPage === 'settings') renderSettings();
    });

    document.addEventListener('checkin:daily-all-done', () => {
      Modal.motivation(() => {});
    });

    document.addEventListener('break-warning', () => {
      Modal.breakWarning(() => {
        location.hash = '#/home';
      });
    });

    document.addEventListener('checkin:completed', () => {
      // 可以在这里播放音效或动画
    });

    // 设置页全局委托（只注册一次，不受 innerHTML 替换影响）
    _setupSettingsDelegates();

    // 初始化时不重复渲染（handleRoute 会调用）
  }

  let _settingsDelegatesDone = false;
  function _setupSettingsDelegates() {
    if (_settingsDelegatesDone) return;
    _settingsDelegatesDone = true;

    const settingsEl = document.getElementById('page-settings');
    if (!settingsEl) { _settingsDelegatesDone = false; return; }

    // 利用 DOM.delegate 做委托，只绑定一次，不受 innerHTML 影响
    DOM.delegate(settingsEl, 'click', '#add-subject-btn', function() {
      const input = document.getElementById('new-subject-name');
      if (!input || !input.value.trim()) {
        Toast.warning('请输入科目名称');
        return;
      }
      try {
        SubjectModule.add(input.value.trim());
        input.value = '';
        Toast.success('科目添加成功');
        renderSettings();
      } catch (e) {
        Toast.error('科目添加失败：' + e.message);
      }
    });

    DOM.delegate(settingsEl, 'click', '.delete-subject', function() {
      const btn = this;
      Modal.confirm({
        title: '删除科目',
        body: '删除后该科目下的任务将保留但不再显示科目标签，确认删除？',
        confirmText: '删除',
        onConfirm: () => {
          const result = SubjectModule.remove(btn.dataset.id);
          if (result.ok) {
            Toast.success('科目已删除');
            renderSettings();
          } else {
            Toast.warning(result.msg);
          }
        }
      });
    });

    DOM.delegate(settingsEl, 'click', '.rename-subject', function() {
      const subject = SubjectModule.getById(this.dataset.id);
      if (!subject) return;
      const newName = prompt('请输入新的科目名称：', subject.name);
      if (newName === null) return;
      const trimmedName = newName.trim();
      if (!trimmedName) {
        Toast.warning('科目名称不能为空');
        return;
      }
      const result = SubjectModule.rename(subject.id, trimmedName);
      if (result.ok) {
        Toast.success('科目名称已更新');
        renderSettings();
      } else {
        Toast.error(result.msg);
      }
    });

    DOM.delegate(settingsEl, 'click', '.settings-choice', function() {
      const key = this.dataset.setting;
      let value = this.dataset.value;
      if (key === 'searchExpanded') value = value === 'true';
      State.update('settings', { [key]: value });
      State.persist('settings');
      if (key === 'searchExpanded') renderGlobalSearch();
      if (key === 'viewMode' || key === 'taskStyle') {
        // 首页和日历会保留在 DOM 中；设置改变后主动刷新，切回时立即生效。
        renderHome();
        renderCalendar();
        Toast.success(key === 'viewMode' ? '任务列表密度已更新' : '任务条目样式已更新');
      }
      renderSettings();
    });

    DOM.delegate(settingsEl, 'change', '#break-warning', function() {
      State.update('settings', { breakWarning: this.checked });
      State.persist('settings');
    });

    DOM.delegate(settingsEl, 'change', '#break-warning-time', function() {
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(this.value)) return;
      State.update('settings', { breakWarningTime: this.value });
      State.persist('settings');
    });

    DOM.delegate(settingsEl, 'click', '.weekly-rest-btn', function() {
      const day = parseInt(this.dataset.day);
      let current = RestModule.getWeeklyRestDays();
      if (current.includes(day)) {
        current = current.filter(d => d !== day);
      } else {
        current.push(day);
      }
      RestModule.setWeeklyRestDays(current);
      renderSettings();
      Toast.success('休息日设置已更新');
    });

    DOM.delegate(settingsEl, 'click', '#add-temp-rest-btn', function() {
      DatePicker.range({
        title: '添加临时休息日',
        onConfirm: (start, end) => {
          const result = RestModule.addTemporaryRest(start, end);
          if (!result.ok) { Toast.warning(result.msg); return false; }
          Toast.success('临时休息日已添加，后续计划已顺延');
          renderSettings();
        }
      });
    });

    DOM.delegate(settingsEl, 'click', '#add-temp-rest-batch-btn', function() {
      DatePicker.multiple({
        title: '批量添加临时休息日',
        onConfirm: dates => {
          const results = dates.map(date => RestModule.addTemporaryRest(date, date));
          const failed = results.find(result => !result.ok);
          if (failed) { Toast.warning(failed.msg); return false; }
          Toast.success(`已新增 ${dates.length} 个临时休息日，后续计划已顺延`);
          renderSettings();
        }
      });
    });

    DOM.delegate(settingsEl, 'click', '.remove-temp-rest', function() {
      RestModule.removeTemporaryRest(this.dataset.id);
      Toast.success('临时休息日已取消');
      renderSettings();
    });

    DOM.delegate(settingsEl, 'click', '#cancel-all-temp-rest-btn', function() {
      RestModule.cancelAllTemporaryRests();
      Toast.success('临时休息日已全部取消');
      renderSettings();
    });

    DOM.delegate(settingsEl, 'click', '#add-leave-btn', function() {
      DatePicker.range({
        title: '记录请假',
        onConfirm: (start, end) => {
          const result = RestModule.addLeave(start, end);
          if (!result.ok) { Toast.warning(result.msg); return false; }
          Toast.success('请假已记录，后续计划已顺延');
          renderSettings();
        }
      });
    });

    DOM.delegate(settingsEl, 'click', '.revoke-leave', function() {
      const btn = this;
      Modal.show({
        title: '撤销请假',
        bodyHTML: `
          <p class="text-sm text-stone-600 mb-3">请选择撤销方式：</p>
          <button class="w-full py-2 mb-2 rounded-xl border border-stone-200 text-sm hover:bg-stone-50 transition-all revoke-keep" data-id="${btn.dataset.id}">
            保持任务已顺延状态
          </button>
          <button class="w-full py-2 rounded-xl border border-stone-200 text-sm hover:bg-stone-50 transition-all revoke-restore" data-id="${btn.dataset.id}">
            还原任务至原始日期
          </button>
        `,
        showCancel: true,
        cancelText: '关闭',
        confirmText: '',
        onConfirm: () => {}
      });
      setTimeout(() => {
        const keepBtn = document.querySelector('.revoke-keep');
        const restoreBtn = document.querySelector('.revoke-restore');
        if (keepBtn) keepBtn.addEventListener('click', () => {
          RestModule.revokeLeave(btn.dataset.id, 'keep_postponed');
          Modal.close();
          Toast.success('请假已撤销（保持顺延状态）');
          renderSettings();
        });
        if (restoreBtn) restoreBtn.addEventListener('click', () => {
          RestModule.revokeLeave(btn.dataset.id, 'restore_original');
          Modal.close();
          Toast.success('请假已撤销（任务已还原）');
          renderSettings();
        });
      }, 100);
    });

    DOM.delegate(settingsEl, 'click', '#reset-all-btn', function() {
      Modal.confirm({
        title: '⚠️ 警告',
        body: '将删除所有本地数据，此操作不可撤销！确认继续？',
        confirmText: '确认重置',
        onConfirm: () => {
          const keys = ['tasks','subjects','restDays','leaves','recurringRules','settings','checkinStats','user'];
          keys.forEach(k => localStorage.removeItem('kaoyan_' + k));
          State.loadFromStorage();
          Toast.success('全部数据已重置');
          location.reload();
        }
      });
    });

    DOM.delegate(settingsEl, 'click', '#add-recurring-btn', function() {
      const subjects = SubjectModule.getAll();
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      Modal.show({
        title: '🔁 新建重复任务',
        bodyHTML: `
          <div class="space-y-3 text-left">
            <div>
              <label class="text-xs text-stone-500 block mb-1">科目（可选）</label>
              <select id="recurring-subject" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
                <option value="">选择科目</option>
                ${subjects.map(s => `<option value="${escapeText(s.id)}">${escapeText(s.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="text-xs text-stone-500 block mb-1">重复类型</label>
              <select id="recurring-type" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
                <option value="daily">每日重复</option>
                <option value="weekly">每周固定日期</option>
              </select>
            </div>
            <div id="recurring-weekdays" class="hidden flex flex-wrap gap-1.5">
              ${dayNames.map((name, idx) => `
                <button class="recurring-day-btn px-2 py-1 rounded-full text-xs border border-stone-200 text-stone-500 hover:border-amber-300 transition-all" data-day="${idx}">${name}</button>
              `).join('')}
            </div>
            <div>
              <label class="text-xs text-stone-500 block mb-1">开始日期</label>
              <input type="date" id="recurring-start-date" value="${DateUtils.today()}" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
            </div>
            <div>
              <label class="text-xs text-stone-500 block mb-1">任务内容</label>
              <textarea id="recurring-content" rows="2" placeholder="每天要做的任务内容..." class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none"></textarea>
            </div>
          </div>
        `,
        confirmText: '创建',
        onConfirm: () => {
          const subjectId = document.getElementById('recurring-subject').value;
          const ruleType = document.getElementById('recurring-type').value;
          const startDate = document.getElementById('recurring-start-date').value;
          const content = document.getElementById('recurring-content').value;
          const weekDays = [];
          document.querySelectorAll('.recurring-day-btn.bg-amber-400').forEach(btn2 => {
            weekDays.push(parseInt(btn2.dataset.day));
          });
          if (!content.trim()) { Toast.error('请输入任务内容'); return false; }
          if (!Validate.isValidDate(startDate)) { Toast.error('请选择有效的开始日期'); return false; }
          if (ruleType === 'weekly' && weekDays.length === 0) { Toast.error('请选择至少一天'); return false; }
          const result = RecurringModule.addRule({ subjectId, content, ruleType, weekDays, startDate });
          if (!result.ok) { Toast.error(result.msg); return false; }
          Toast.success('重复任务已创建');
          renderSettings();
        }
      });
      setTimeout(() => {
        const typeSelect = document.getElementById('recurring-type');
        const weekdaysDiv = document.getElementById('recurring-weekdays');
        if (typeSelect && weekdaysDiv) {
          typeSelect.addEventListener('change', () => {
            weekdaysDiv.classList.toggle('hidden', typeSelect.value === 'daily');
          });
        }
        document.querySelectorAll('.recurring-day-btn').forEach(btn_day => {
          btn_day.addEventListener('click', () => {
            btn_day.classList.toggle('bg-amber-400');
            btn_day.classList.toggle('text-white');
            btn_day.classList.toggle('border-amber-400');
            btn_day.classList.toggle('border-stone-200');
            btn_day.classList.toggle('text-stone-500');
          });
        });
      }, 100);
    });

    DOM.delegate(settingsEl, 'click', '.toggle-recurring', function() {
      RecurringModule.toggleRule(this.dataset.id);
      Toast.success('重复任务状态已更新');
      renderSettings();
    });

    DOM.delegate(settingsEl, 'click', '.edit-recurring', function() {
      const rule = RecurringModule.getRules().find(item => item.id === this.dataset.id);
      if (!rule) return;
      const subjects = SubjectModule.getAll();
      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      Modal.show({
        title: '编辑重复任务',
        bodyHTML: `
          <div class="space-y-3 text-left">
            <select id="edit-recurring-subject" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
              <option value="">选择科目</option>
              ${subjects.map(s => `<option value="${escapeText(s.id)}" ${s.id === rule.subjectId ? 'selected' : ''}>${escapeText(s.name)}</option>`).join('')}
            </select>
            <select id="edit-recurring-type" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
              <option value="daily" ${rule.ruleType === 'daily' ? 'selected' : ''}>每日重复</option>
              <option value="weekly" ${rule.ruleType === 'weekly' ? 'selected' : ''}>每周固定日期</option>
            </select>
            <div id="edit-recurring-weekdays" class="${rule.ruleType === 'weekly' ? '' : 'hidden'} flex flex-wrap gap-1.5">
              ${dayNames.map((name, idx) => `
                <button class="edit-recurring-day-btn px-2 py-1 rounded-full text-xs border transition-all ${rule.weekDays.includes(idx) ? 'bg-amber-400 text-white border-amber-400' : 'border-stone-200 text-stone-500'}" data-day="${idx}">${name}</button>
              `).join('')}
            </div>
            <input type="date" id="edit-recurring-start-date" value="${rule.startDate}" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
            <textarea id="edit-recurring-content" rows="2" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none">${Validate.sanitizeHTML(rule.content)}</textarea>
          </div>
        `,
        confirmText: '保存',
        onConfirm: () => {
          const ruleType = document.getElementById('edit-recurring-type').value;
          const weekDays = [...document.querySelectorAll('.edit-recurring-day-btn.bg-amber-400')]
            .map(btn => parseInt(btn.dataset.day));
          const result = RecurringModule.updateRule(rule.id, {
            subjectId: document.getElementById('edit-recurring-subject').value,
            ruleType,
            weekDays,
            startDate: document.getElementById('edit-recurring-start-date').value,
            content: document.getElementById('edit-recurring-content').value
          });
          if (result.ok) {
            Toast.success('重复任务已更新');
            renderSettings();
          } else {
            Toast.error(result.msg);
            return false;
          }
        }
      });
      setTimeout(() => {
        const type = document.getElementById('edit-recurring-type');
        const weekdays = document.getElementById('edit-recurring-weekdays');
        type?.addEventListener('change', () => weekdays?.classList.toggle('hidden', type.value === 'daily'));
        document.querySelectorAll('.edit-recurring-day-btn').forEach(btn => btn.addEventListener('click', () => {
          btn.classList.toggle('bg-amber-400');
          btn.classList.toggle('text-white');
          btn.classList.toggle('border-amber-400');
          btn.classList.toggle('border-stone-200');
          btn.classList.toggle('text-stone-500');
        }));
      }, 100);
    });

    DOM.delegate(settingsEl, 'click', '.delete-recurring', function() {
      RecurringModule.removeRule(this.dataset.id);
      Toast.success('重复任务已删除');
      renderSettings();
    });

    DOM.delegate(settingsEl, 'change', '#auto-postpone', function() {
      State.update('settings', { autoPostpone: this.checked });
      State.persist('settings');
      if (this.checked) {
        TaskModule.postponeUncompletedTasks(DateUtils.addDays(DateUtils.today(), -1));
        Toast.success('\u81ea\u52a8\u987a\u5ef6\u5df2\u5f00\u542f');
      }
    });
    DOM.delegate(settingsEl, 'change', '#exam-date-input', function() {
      if (this.value && !Validate.isValidDate(this.value)) {
        Toast.warning('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u8003\u7814\u65e5\u671f');
        this.value = State.get('settings').examDate;
        return;
      }
      State.update('settings', { examDate: this.value });
      State.persist('settings');
      RecurringModule.refresh();
      Toast.success('考研日期已更新');
    });
  }

  let _globalSearchDelegatesDone = false;
  function renderGlobalSearch() {
    const host = document.getElementById('global-search-host');
    if (!host) return;
    const expanded = !!State.get('settings').searchExpanded;
    host.innerHTML = expanded
      ? `<div class="relative">
           <i class="fa fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm"></i>
           <input type="search" id="global-search-input" autocomplete="off" placeholder="搜索任务内容或打卡备注..."
             class="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition-all">
         </div>
         <div id="global-search-results" class="hidden mt-2 bg-white border border-stone-100 rounded-xl shadow-sm overflow-hidden"></div>`
      : `<button id="global-search-expand-btn" class="w-full flex items-center gap-2 px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-sm text-stone-400 text-left hover:bg-stone-50 transition-all">
           <i class="fa fa-search"></i><span>搜索任务...</span>
         </button>`;
  }

  function renderGlobalSearchResults(query) {
    const panel = document.getElementById('global-search-results');
    if (!panel) return;
    const trimmed = (query || '').trim();
    if (!trimmed) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }

    const results = TaskModule.searchTasks(trimmed).slice(0, 30);
    panel.classList.remove('hidden');
    panel.innerHTML = results.length > 0
      ? results.map(task => `
          <button class="global-search-result w-full text-left px-3 py-2.5 border-b border-stone-50 last:border-b-0 hover:bg-stone-50 transition-all" data-date="${task.scheduledDate}">
            <div class="text-sm text-stone-700 truncate">${Validate.sanitizeHTML(task.content)}</div>
            <div class="text-xs text-stone-400 mt-0.5">${task.scheduledDate}${task.checkinNote ? ' · 有打卡备注' : ''}</div>
          </button>`).join('')
      : '<div class="px-3 py-4 text-center text-sm text-stone-400">未找到匹配的任务</div>';
  }

  function _setupGlobalSearchDelegates() {
    if (_globalSearchDelegatesDone) return;
    const host = document.getElementById('global-search-host');
    if (!host) return;
    _globalSearchDelegatesDone = true;
    DOM.delegate(host, 'click', '#global-search-expand-btn', function() {
      State.update('settings', { searchExpanded: true });
      State.persist('settings');
      renderGlobalSearch();
      document.getElementById('global-search-input')?.focus();
    });
    DOM.delegate(host, 'input', '#global-search-input', function() {
      renderGlobalSearchResults(this.value);
    });
    DOM.delegate(host, 'click', '.global-search-result', function() {
      const date = this.dataset.date;
      if (!date) return;
      currentCalendarDate = date;
      currentCalendarView = 'month';
      history.replaceState(null, '', '#/calendar');
      handleRouteDirect('calendar');
    });
  }

  function handleRoute() {
    const hash = location.hash || '#/home';
    const page = hash.replace('#/', '') || 'home';
    _doRoute(page);
  }

  // 直接路由到指定页面（由导航栏调用，无需读 hash）
  function handleRouteDirect(page) {
    if (!page) return;
    _doRoute(page);
  }

  // 内部路由实现
  function _doRoute(page) {
    // 同步导航栏内部页面追踪（如果有）
    if (window._navSetCurrentPage) window._navSetCurrentPage(page);

    // active 样式已由导航栏 click 事件即时处理，此处仅做兜底
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // 隐掉所有页面容器
    document.querySelectorAll('.page-container').forEach(el => el.style.display = 'none');

    // 清理批量选择
    _clearBatchSelection();

    // 先切换 currentPage，再异步渲染
    currentPage = page;
    const containerId = 'page-' + page;
    const containerEl = document.getElementById(containerId);

    if (containerEl) {
      containerEl.style.display = '';
    }

    // 使用 setTimeout 0 延迟渲染，保证 DOM 状态更新后再计算
    // 不清除已有定时器 — 允许同一页面被重复渲染（如设置页功能操作后 refresh）
    setTimeout(() => {
      switch (page) {
        case 'home': renderHome(); break;
        case 'calendar': renderCalendar(); break;
        case 'review': renderReview(); break;
        case 'settings': renderSettings(); break;
        default: location.hash = '#/home';
      }
    }, 0);
  }

  // ═══ 首页渲染 ═══
  function renderHome() {
    const el = document.getElementById('page-home');
    if (!el) return;
    const today = DateUtils.today();
    const settings = State.get('settings');
    const stats = State.get('checkinStats');
    const subjects = SubjectModule.getAll();

    // 今日任务
    const todayTasks = TaskModule.getTasksByDate(today);
    const completedCount = todayTasks.filter(t => t.status === 'completed').length;
    const completionRate = todayTasks.length > 0 ? Math.round((completedCount / todayTasks.length) * 100) : 0;

    // 倒计时
    const daysUntilExam = DateUtils.diffDays(settings.examDate, today);
    const countdownHTML = settings.countdownCollapsed
      ? `<div class="flex items-center justify-between cursor-pointer" id="countdown-toggle">
           <span class="text-sm font-bold text-stone-700">📅 考研倒计时</span>
           <i class="fa fa-chevron-down text-stone-400"></i>
         </div>`
      : `<div class="cursor-pointer" id="countdown-toggle">
           <div class="flex items-center justify-between">
             <span class="text-sm font-bold text-stone-700">📅 考研倒计时</span>
             <i class="fa fa-chevron-up text-stone-400"></i>
           </div>
           <div class="text-center mt-2">
             <span class="text-4xl font-black text-amber-600">${Math.max(0, daysUntilExam)}</span>
             <span class="text-stone-500 text-sm ml-2">天</span>
           </div>
           <div class="text-center text-stone-400 text-xs mt-1">目标日期：${escapeText(settings.examDate)}</div>
         </div>`;

    // 各科进度
    const subjectProgress = ReviewModule.getOverallSubjectProgress();
    const progressHTML = settings.progressCollapsed
      ? `<div class="flex items-center justify-between cursor-pointer" id="progress-toggle">
           <span class="text-sm font-bold text-stone-700">📊 单科复习进度</span>
           <i class="fa fa-chevron-down text-stone-400"></i>
         </div>`
      : `<div class="cursor-pointer" id="progress-toggle">
           <div class="flex items-center justify-between">
             <span class="text-sm font-bold text-stone-700">📊 单科复习进度</span>
             <i class="fa fa-chevron-up text-stone-400"></i>
           </div>
           ${subjectProgress.map(sp => `
             <div class="mt-2">
               <div class="flex justify-between text-xs text-stone-600 mb-1">
                 <span>${escapeText(sp.name)}</span>
                 <span>${sp.rate}%</span>
               </div>
               <div class="w-full bg-stone-100 rounded-full h-1.5">
                 <div class="h-1.5 rounded-full transition-all duration-500" style="width:${sp.rate}%;background-color:${safeColor(sp.color)}"></div>
               </div>
             </div>
           `).join('')}
         </div>`;

    const viewModeClass = settings.viewMode === 'compact' ? 'space-y-1' : 'space-y-4';

    el.innerHTML = `
	      <!-- 今日任务列表 -->
      <div class="px-4 mt-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-stone-800">
            📋 今日任务
            <span class="text-sm text-stone-400 font-normal ml-2">${DateUtils.getDayName(today)}</span>
          </h2>
          <div class="flex items-center gap-2">
            <button id="batch-mode-btn" class="text-xs text-stone-500 font-medium hover:text-amber-600 transition-all active:scale-95 flex items-center gap-1">
              <i class="fa fa-check-square-o"></i> 批量
            </button>
            <button id="batch-import-btn" class="text-xs text-amber-600 font-medium hover:text-amber-700 transition-all active:scale-95 flex items-center gap-1">
              <i class="fa fa-upload"></i> 导入
            </button>
            <span class="text-xs text-stone-400">${completedCount}/${todayTasks.length}</span>
            <span class="text-xs font-bold text-amber-600">${completionRate}%</span>
          </div>
        </div>

        <!-- 批量操作工具栏（默认隐藏） -->
        <div id="batch-toolbar" class="hidden flex items-center gap-2 mb-2 px-3 py-2 bg-amber-50 rounded-xl border border-amber-200 text-xs">
          <span id="batch-count" class="font-bold text-amber-700">已选 0 项</span>
          <div class="flex-1"></div>
          <button id="batch-complete" class="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all">完成</button>
          <button id="batch-migrate" class="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all">迁移</button>
          <button id="batch-subject" class="px-2 py-1 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all">改科目</button>
          <button id="batch-delete" class="px-2 py-1 rounded-lg bg-red-100 text-red-500 hover:bg-red-200 transition-all">删除</button>
          <button id="batch-cancel" class="px-2 py-1 rounded-lg bg-stone-200 text-stone-600 hover:bg-stone-300 transition-all">取消</button>
        </div>

        <div class="${viewModeClass}" id="task-list">
          ${renderTaskList(todayTasks, subjects, `<div class="text-center py-10 text-stone-400">
            <div class="text-4xl mb-3">📝</div>
            <p class="text-sm">今天还没有任务，点击右下角 + 添加吧</p>
          </div>`)}
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="px-4 mt-4 mb-20 md:mb-4">
        <div class="bg-white rounded-2xl border border-stone-100 p-4 mb-3 shadow-sm" id="countdown-card">
          ${countdownHTML}
        </div>

        <div class="bg-white rounded-2xl border border-stone-100 p-4 mb-3 shadow-sm" id="progress-card">
          ${progressHTML}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm text-center">
            <div class="text-2xl font-black text-amber-600">${stats.totalDays}</div>
            <div class="text-xs text-stone-400 mt-1">累计打卡天数</div>
          </div>
          <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm text-center">
            <div class="text-2xl font-black text-amber-600">${stats.consecutiveDays}</div>
            <div class="text-xs text-stone-400 mt-1">连续打卡天数</div>
          </div>
        </div>
      </div>

      <!-- 悬浮添加按钮 -->
      <button id="fab-add-task" class="fixed bottom-24 right-4 md:bottom-8 md:right-8 w-14 h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-lg flex items-center justify-center text-2xl transition-all active:scale-90 z-50" title="添加任务">
        <i class="fa fa-plus"></i>
      </button>
    `;

    // 事件绑定
    bindHomeEvents();
    mountVirtualTaskLists(el, todayTasks, subjects);

    // 绑定悬浮添加按钮
    const fabBtn = document.getElementById('fab-add-task');
    if (fabBtn) {
      fabBtn.addEventListener('click', () => {
        const subjects = SubjectModule.getAll();
        const today = DateUtils.today();
        Modal.show({
          title: '📝 添加任务',
          bodyHTML: `
            <div class="space-y-3 text-left">
              <div>
                <label class="text-xs text-stone-500 block mb-1">科目（可选）</label>
                <select id="fab-subject" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
                  <option value="">选择科目</option>
                  ${subjects.map(s => '<option value="' + escapeText(s.id) + '">' + escapeText(s.name) + '</option>').join('')}
                </select>
              </div>
              <div>
                <label class="text-xs text-stone-500 block mb-1">任务内容</label>
                <textarea id="fab-content" rows="2" placeholder="今天要做什么..." class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl resize-none"></textarea>
              </div>
              <div>
                <label class="text-xs text-stone-500 block mb-1">日期</label>
                <input type="date" id="fab-date" value="${today}" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">
              </div>
            </div>
          `,
          confirmText: '添加',
          onConfirm: () => {
            const subjectId = document.getElementById('fab-subject').value;
            const content = document.getElementById('fab-content').value;
            const date = document.getElementById('fab-date').value;
            if (!content.trim()) { Toast.error('请输入任务内容'); return false; }
            const result = TaskModule.addTask({ subjectId, content: content.trim(), scheduledDate: date });
            if (result.ok) { Toast.success('任务已添加'); renderHome(); }
            else { Toast.error(result.msg); }
            if (!result.ok) return false;
          }
        });
      });
    }
  }

  function bindHomeEvents() {
    // 批量导入
    const batchImportBtn = document.getElementById('batch-import-btn');
    if (batchImportBtn) {
      const _importClick = () => {
        const subjects = SubjectModule.getAll();
        const subjectOptions = [
          '<option value="">不指定科目</option>',
          ...subjects.map(s => `<option value="${escapeText(s.id)}">${escapeText(s.name)}</option>`)
        ].join('');

        Modal.show({
          title: '📥 批量导入任务',
          bodyHTML: `
            <div class="space-y-3 text-left">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-stone-500 block mb-1">默认日期</label>
                  <input type="date" id="batch-import-date" value="${DateUtils.today()}" class="w-full px-2.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300">
                </div>
                <div>
                  <label class="text-xs text-stone-500 block mb-1">默认科目</label>
                  <select id="batch-import-subject" class="w-full px-2.5 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300">
                    ${subjectOptions}
                  </select>
                </div>
              </div>
              <div>
                <label class="text-xs text-stone-500 block mb-1">任务清单</label>
                <textarea id="batch-import-text" rows="9" placeholder="背 50 个单词&#10;精读一篇阅读&#10;做一套数学卷子" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"></textarea>
              </div>
              <div id="batch-import-preview" class="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500" aria-live="polite">0 个待导入任务</div>
            </div>
          `,
          confirmText: '导入',
          onConfirm: () => {
            const rawText = document.getElementById('batch-import-text').value;
            const defaultDate = document.getElementById('batch-import-date').value;
            const defaultSubjectId = document.getElementById('batch-import-subject').value;
            try {
              const result = importBatchTasks(rawText, { defaultDate, defaultSubjectId });
              if (result.ok) {
                Toast.success('成功导入 ' + result.added + ' 个任务');
                if (result.skipped > 0) Toast.warning('跳过 ' + result.skipped + ' 条无效数据');
                if (currentPage === 'home') renderHome();
              } else {
                Toast.error(result.msg);
                return false;
              }
            } catch (e) {
              Toast.error('导入失败，请检查数据格式');
              return false;
            }
          }
        });

        const updatePreview = () => {
          const rawText = document.getElementById('batch-import-text').value;
          const defaultDate = document.getElementById('batch-import-date').value;
          const defaultSubjectId = document.getElementById('batch-import-subject').value;
          const preview = previewBatchImport(rawText, { defaultDate, defaultSubjectId });
          const previewEl = document.getElementById('batch-import-preview');
          if (!previewEl) return;
          if (!rawText.trim()) {
            previewEl.textContent = '0 个待导入任务';
            previewEl.className = 'rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500';
            return;
          }
          previewEl.textContent = preview.ok
            ? `将导入 ${preview.tasks.length} 个任务${preview.skipped ? `，${preview.skipped} 行将跳过` : ''}`
            : '没有可导入的有效任务';
          previewEl.className = preview.ok
            ? 'rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700'
            : 'rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-600';
        };

        document.getElementById('batch-import-text').addEventListener('input', updatePreview);
        document.getElementById('batch-import-date').addEventListener('change', updatePreview);
        document.getElementById('batch-import-subject').addEventListener('change', updatePreview);
      };
      batchImportBtn.removeEventListener('click', _importClick);
      batchImportBtn.addEventListener('click', _importClick);
    }

    // 折叠
    const countdownToggle = document.getElementById('countdown-toggle');
    if (countdownToggle) {
      countdownToggle.addEventListener('click', () => {
        State.update('settings', { countdownCollapsed: !State.get('settings').countdownCollapsed });
        State.persist('settings');
        renderHome();
      });
    }

    const progressToggle = document.getElementById('progress-toggle');
    if (progressToggle) {
      progressToggle.addEventListener('click', () => {
        State.update('settings', { progressCollapsed: !State.get('settings').progressCollapsed });
        State.persist('settings');
        renderHome();
      });
    }

    // 批量操作模式
    bindBatchMode();
  }

  // ─── 批量操作模式 ───
  // 批量选择状态需要被 index.html 的全局任务委托读取，挂到 window 以保持同一份 Set。
  window._batchSelected = window._batchSelected || new Set();
  const batchSelected = window._batchSelected;

  // batchSelected 存储 key 为 taskId，在页面离开时清空
  function _clearBatchSelection() {
    batchSelected.clear();
    const toolbar = document.getElementById('batch-toolbar');
    if (toolbar) toolbar.classList.add('hidden');
  }

  function bindBatchMode() {
    const batchBtn = document.getElementById('batch-mode-btn');
    const toolbar = document.getElementById('batch-toolbar');
    const countEl = document.getElementById('batch-count');

    if (!batchBtn) return;

    function updateCount() {
      if (countEl) countEl.textContent = `已选 ${batchSelected.size} 项`;
    }

    function exitBatchMode() {
      batchSelected.clear();
      if (toolbar) toolbar.classList.add('hidden');
      document.querySelectorAll('.batch-check').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('bg-amber-400', 'border-amber-400');
        const icon = el.querySelector('i');
        if (icon) icon.classList.add('hidden');
      });
      // 移除选中高亮
      document.querySelectorAll('.task-card').forEach(el => el.classList.remove('ring-2', 'ring-amber-300'));
    }

    // 进入/退出批量模式
    batchBtn.addEventListener('click', () => {
      const isActive = toolbar && !toolbar.classList.contains('hidden');
      if (isActive) {
        exitBatchMode();
      } else {
        if (toolbar) toolbar.classList.remove('hidden');
        document.querySelectorAll('.batch-check').forEach(el => el.classList.remove('hidden'));
        batchSelected.clear();
        updateCount();
      }
    });

    // 取消
    const cancelBtn = document.getElementById('batch-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', exitBatchMode);

    // 任务卡片上的 checkbox 改用批量选择模式
    // 通过委托在全局 click 中处理

    // 批量完成
    const completeBtn = document.getElementById('batch-complete');
    if (completeBtn) completeBtn.addEventListener('click', () => {
      if (batchSelected.size === 0) { Toast.warning('请先选择任务'); return; }
      TaskModule.batchComplete([...batchSelected]);
      Toast.success(`已标记完成 ${batchSelected.size} 个任务`);
      exitBatchMode();
    });

    // 批量迁移
    const migrateBtn = document.getElementById('batch-migrate');
    if (migrateBtn) migrateBtn.addEventListener('click', () => {
      if (batchSelected.size === 0) { Toast.warning('请先选择任务'); return; }
      DatePicker.single({
        title: '批量迁移日期',
        onConfirm: targetDate => {
          const result = TaskModule.batchMigrate([...batchSelected], targetDate);
          if (!result.ok) { Toast.warning(result.msg); return false; }
          Toast.success(`已迁移 ${batchSelected.size} 个任务至 ${result.targetDate || targetDate}`);
          exitBatchMode();
        }
      });
    });

    // 批量改科目
    const subjectBtn = document.getElementById('batch-subject');
    if (subjectBtn) subjectBtn.addEventListener('click', () => {
      if (batchSelected.size === 0) { Toast.warning('请先选择任务'); return; }
      const subjects = SubjectModule.getAll();
      const options = subjects.map(s => `<option value="${escapeText(s.id)}">${escapeText(s.name)}</option>`).join('');
      Modal.show({
        title: '📚 批量修改科目',
        bodyHTML: `<select id="batch-subject-select" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl">${options}</select>`,
        confirmText: '修改',
        onConfirm: () => {
          const subjectId = document.getElementById('batch-subject-select').value;
          TaskModule.batchChangeSubject([...batchSelected], subjectId);
          Toast.success(`已修改 ${batchSelected.size} 个任务科目`);
          exitBatchMode();
        }
      });
    });

    // 批量删除
    const deleteBtn = document.getElementById('batch-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (batchSelected.size === 0) { Toast.warning('请先选择任务'); return; }
      Modal.confirm({
        title: '⚠️ 批量删除',
        body: `确认删除 ${batchSelected.size} 个任务？此操作不可撤销。`,
        confirmText: '确认删除',
        onConfirm: () => {
          TaskModule.batchDelete([...batchSelected]);
          Toast.success(`已删除 ${batchSelected.size} 个任务`);
          exitBatchMode();
        }
      });
    });
  }

  function renderTaskList(tasks, subjects, emptyHTML) {
    if (tasks.length === 0) return emptyHTML;
    if (tasks.length <= 50) return tasks.map(t => renderTaskCard(t, subjects, { animate: true })).join('');
    const rowHeight = State.get('settings').viewMode === 'compact' ? 68 : 96;
    return `<div class="task-virtual-list" data-row-height="${rowHeight}">
      <div class="task-virtual-spacer" style="height:${tasks.length * rowHeight}px">
        <div class="task-virtual-content"></div>
      </div>
    </div>`;
  }

  function mountVirtualTaskLists(root, tasks, subjects) {
    const lists = root.matches?.('.task-virtual-list')
      ? [root]
      : [...root.querySelectorAll('.task-virtual-list')];
    lists.forEach(list => {
      list._virtualTasks = tasks;
      list._virtualSubjects = subjects;
      const rowHeight = Number(list.dataset.rowHeight) || 78;
      const renderRange = () => {
        const content = list.querySelector('.task-virtual-content');
        if (!content) return;
        const viewportHeight = list.clientHeight || 420;
        const start = Math.max(0, Math.floor(list.scrollTop / rowHeight) - 5);
        const end = Math.min(tasks.length, Math.ceil((list.scrollTop + viewportHeight) / rowHeight) + 5);
        content.innerHTML = tasks.slice(start, end).map((task, index) => `
          <div class="task-virtual-row" style="top:${(start + index) * rowHeight}px;height:${rowHeight - 4}px">
            ${renderTaskCard(task, subjects, { animate: false })}
          </div>`).join('');
      };
      if (!list._virtualBound) {
        list._virtualBound = true;
        list.addEventListener('scroll', renderRange, { passive: true });
      }
      renderRange();
    });
  }

  function renderTaskCard(task, subjects, options = {}) {
    const sub = subjects.find(s => s.id === task.subjectId);
    const subColor = sub ? safeColor(sub.color) : '#a8a29e';
    const subName = sub ? Validate.sanitizeHTML(sub.name) : '';
    const isCompleted = task.status === 'completed';
    const settings = State.get('settings');
    const checkboxLeft = settings.taskStyle !== 'checkbox-right';

    // 批量选择复选框
    const batchCheckHTML = `<div class="batch-check hidden flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all duration-150 border-stone-300 hover:border-amber-400" data-task-id="${task.id}">
      <i class="fa fa-check text-[8px] text-amber-500 hidden"></i>
    </div>`;

    const checkboxHTML = `<div class="task-checkbox flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${isCompleted ? 'bg-emerald-400 border-emerald-400' : 'border-stone-300 hover:border-amber-400'}" data-task-id="${task.id}">
      ${isCompleted ? '<i class="fa fa-check text-white text-xs"></i>' : ''}
    </div>`;

    const contentClass = settings.viewMode === 'compact' ? 'py-2' : 'py-5';
    const animationClass = options.animate === false ? '' : 'task-card-enter';
    const cardClass = `task-card ${animationClass} bg-white rounded-xl border ${isCompleted ? 'border-emerald-100 bg-emerald-50/30' : 'border-stone-100'} ${contentClass} flex items-center gap-3 px-3 transition-all duration-300 hover:shadow-sm`;

    if (checkboxLeft) {
      return `
        <div class="${cardClass}" data-task-id="${task.id}">
          ${batchCheckHTML}
          ${checkboxHTML}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              ${subName ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium" style="background-color:${subColor}">${subName}</span>` : ''}
              ${task.isCheckinBackfill ? '<span class="text-[10px] text-amber-500">补卡</span>' : ''}
            </div>
            <p class="text-sm text-stone-700 task-content ${isCompleted ? 'line-through text-stone-400' : ''}">${Validate.sanitizeHTML(task.content)}</p>
            ${task.checkinNote ? `<p class="text-xs text-stone-400 mt-1">📝 ${Validate.sanitizeHTML(task.checkinNote)}</p>` : ''}
          </div>
          <i class="fa fa-ellipsis-v text-stone-300 text-xs cursor-pointer task-more" data-task-id="${task.id}"></i>
        </div>`;
    } else {
      return `
        <div class="${cardClass}" data-task-id="${task.id}">
          ${batchCheckHTML}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              ${subName ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium" style="background-color:${subColor}">${subName}</span>` : ''}
              ${task.isCheckinBackfill ? '<span class="text-[10px] text-amber-500">补卡</span>' : ''}
            </div>
            <p class="text-sm text-stone-700 task-content ${isCompleted ? 'line-through text-stone-400' : ''}">${Validate.sanitizeHTML(task.content)}</p>
            ${task.checkinNote ? `<p class="text-xs text-stone-400 mt-1">📝 ${Validate.sanitizeHTML(task.checkinNote)}</p>` : ''}
          </div>
          <i class="fa fa-ellipsis-v text-stone-300 text-xs cursor-pointer task-more" data-task-id="${task.id}"></i>
          ${checkboxHTML}
        </div>`;
    }
  }

  // ═══ 日历渲染 ═══
  function renderCalendar() {
    const el = document.getElementById('page-calendar');
    if (!el) return;

    // 如果是周视图但没有实现，回退到月视图
    if (currentCalendarView === 'week') {
      // 周视图：显示本周的 7 天
      const weekDays = DateUtils.getWeekDays(currentCalendarDate);
      renderWeekCalendar(el, weekDays);
      return;
    }

    renderMonthCalendar(el);
  }

  function renderMonthCalendar(el) {
    const [y, m] = currentCalendarDate.split('-').map(Number);
    const { days, startDow } = DateUtils.getMonthDays(y, m - 1);
    const today = DateUtils.today();

    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const dayNamesHTML = dayNames.map(d => `<div class="text-center text-xs font-medium text-stone-400 py-2">${d}</div>`).join('');

    const allTaskDates = new Set(TaskModule.getAllDatesWithTasks());
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());

    // 空白填充
    let cellsHTML = '';
    for (let i = 0; i < startDow; i++) {
      cellsHTML += '<div class="h-10"></div>';
    }

    days.forEach(d => {
      if (!d) return;
      const isToday = d === today;
      const hasTask = allTaskDates.has(d);
      const isRest = restDates.has(d);
      const isLeave = leaveDates.has(d);
      const tasks = TaskModule.getTasksByDate(d);
      const allDone = tasks.length > 0 && tasks.every(t => t.status === 'completed');

      let bgClass = 'hover:bg-stone-50';
      if (isLeave) bgClass = 'bg-rose-50 hover:bg-rose-100';
      else if (isRest) bgClass = 'bg-blue-50 hover:bg-blue-100';
      if (isToday) bgClass += ' ring-2 ring-amber-400';

      const day = DateUtils.parseLocal(d).getDate();

      cellsHTML += `
        <div class="calendar-cell h-10 flex flex-col items-center justify-center rounded-lg cursor-pointer relative text-sm ${bgClass} transition-all" data-date="${d}">
          <span class="${isToday ? 'font-black text-amber-600' : 'text-stone-700'}">${day}</span>
          <div class="flex gap-0.5 absolute bottom-0.5">
            ${hasTask ? (allDone ? '<div class="w-1 h-1 rounded-full bg-emerald-400"></div>' : '<div class="w-1 h-1 rounded-full bg-amber-400"></div>') : ''}
            ${isRest ? '<div class="w-1 h-1 rounded-full bg-blue-400"></div>' : ''}
            ${isLeave ? '<div class="w-1 h-1 rounded-full bg-rose-400"></div>' : ''}
          </div>
        </div>`;
    });

    const titleLabel = currentCalendarView === 'month'
      ? DateUtils.getFullMonthName(currentCalendarDate)
      : `${DateUtils.getWeekRange(currentCalendarDate).start} ~ ${DateUtils.getWeekRange(currentCalendarDate).end}`;

    el.innerHTML = `
      <div class="px-4 pt-3">
        <!-- 视图切换 -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-stone-800">📅 日历</h2>
          <div class="flex bg-stone-100 rounded-lg p-0.5 text-sm">
            <button class="cal-view-btn px-3 py-1 rounded-md transition-all ${currentCalendarView === 'month' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500'}" data-view="month">月</button>
            <button class="cal-view-btn px-3 py-1 rounded-md transition-all ${currentCalendarView === 'week' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500'}" data-view="week">周</button>
          </div>
        </div>

        <!-- 月份切换 -->
        <div class="flex items-center justify-between mb-3">
          <button class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-100 transition-all" id="cal-prev"><i class="fa fa-chevron-left text-stone-500 text-xs"></i></button>
          <span class="font-bold text-stone-700">${titleLabel}</span>
          <button class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-100 transition-all" id="cal-next"><i class="fa fa-chevron-right text-stone-500 text-xs"></i></button>
        </div>

        <!-- 日历网格 -->
        <div class="grid grid-cols-7 gap-1">
          ${dayNamesHTML}
          ${cellsHTML}
        </div>

        <!-- 图例 -->
        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-4 text-xs text-stone-400 justify-center">
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block flex-shrink-0"></span>有任务</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0"></span>已完成</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-blue-400 inline-block flex-shrink-0"></span>休息日</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-rose-400 inline-block flex-shrink-0"></span>请假</span>
        </div>

        <!-- 选中日期的任务列表 -->
        <div id="cal-task-detail" class="mt-4 mb-20"></div>
      </div>
    `;

    bindCalendarEvents();
  }

  function renderWeekCalendar(el, weekDays) {
    const today = DateUtils.today();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const allTaskDates = new Set(TaskModule.getAllDatesWithTasks());
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());

    let cellsHTML = weekDays.map(d => {
      const isToday = d === today;
      const hasTask = allTaskDates.has(d);
      const isRest = restDates.has(d);
      const isLeave = leaveDates.has(d);
      const tasks = TaskModule.getTasksByDate(d);
      const allDone = tasks.length > 0 && tasks.every(t => t.status === 'completed');
      const dayNum = DateUtils.parseLocal(d).getDate();

      let bgClass = 'hover:bg-stone-50';
      if (isLeave) bgClass = 'bg-rose-50 hover:bg-rose-100';
      else if (isRest) bgClass = 'bg-blue-50 hover:bg-blue-100';
      if (isToday) bgClass += ' ring-2 ring-amber-400';

      return `
        <div class="calendar-cell h-16 flex flex-col items-center justify-center rounded-lg cursor-pointer relative text-sm ${bgClass} transition-all" data-date="${d}">
          <span class="${isToday ? 'font-black text-amber-600' : 'text-stone-700'}">${dayNum}</span>
          <span class="text-[10px] text-stone-400">${dayNames[DateUtils.getDayOfWeek(d)]}</span>
          <div class="flex gap-0.5 absolute bottom-1">
            ${hasTask ? (allDone ? '<div class="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>' : '<div class="w-1.5 h-1.5 rounded-full bg-amber-400"></div>') : ''}
            ${isRest ? '<div class="w-1.5 h-1.5 rounded-full bg-blue-400"></div>' : ''}
            ${isLeave ? '<div class="w-1.5 h-1.5 rounded-full bg-rose-400"></div>' : ''}
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="px-4 pt-3">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-stone-800">📅 日历</h2>
          <div class="flex bg-stone-100 rounded-lg p-0.5 text-sm">
            <button class="cal-view-btn px-3 py-1 rounded-md transition-all ${currentCalendarView === 'month' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500'}" data-view="month">月</button>
            <button class="cal-view-btn px-3 py-1 rounded-md transition-all ${currentCalendarView === 'week' ? 'bg-white shadow-sm font-medium text-stone-800' : 'text-stone-500'}" data-view="week">周</button>
          </div>
        </div>

        <div class="flex items-center justify-between mb-3">
          <button class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-100 transition-all" id="cal-prev"><i class="fa fa-chevron-left text-stone-500 text-xs"></i></button>
          <span class="font-bold text-stone-700">${weekDays[0]} ~ ${weekDays[6]}</span>
          <button class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-100 transition-all" id="cal-next"><i class="fa fa-chevron-right text-stone-500 text-xs"></i></button>
        </div>

        <div class="grid grid-cols-7 gap-1">
          ${dayNames.map(n => `<div class="text-center text-xs font-medium text-stone-400 py-2">${n}</div>`).join('')}
          ${cellsHTML}
        </div>

        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-4 text-xs text-stone-400 justify-center">
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block flex-shrink-0"></span>有任务</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0"></span>已完成</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-blue-400 inline-block flex-shrink-0"></span>休息日</span>
          <span class="flex items-center gap-1 whitespace-nowrap"><span class="w-2 h-2 rounded-full bg-rose-400 inline-block flex-shrink-0"></span>请假</span>
        </div>

        <div id="cal-task-detail" class="mt-4 mb-20"></div>
      </div>
    `;

    bindCalendarEvents();
  }

  function bindCalendarEvents() {
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');

    if (prevBtn) prevBtn.onclick = () => {
      const d = DateUtils.parseLocal(currentCalendarDate);
      if (currentCalendarView === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      currentCalendarDate = DateUtils.formatDate(d);
      renderCalendar();
    };

    if (nextBtn) nextBtn.onclick = () => {
      const d = DateUtils.parseLocal(currentCalendarDate);
      if (currentCalendarView === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      currentCalendarDate = DateUtils.formatDate(d);
      renderCalendar();
    };

    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.onclick = () => {
        currentCalendarView = btn.dataset.view;
        renderCalendar();
      };
    });

    // 日历单元格点击委托（使用一次性标记避免重复绑定）
    const cal = document.getElementById('page-calendar');
    if (cal && !cal._calBound) {
      cal._calBound = true;
      cal.addEventListener('click', function(e) {
        const cell = e.target.closest('.calendar-cell');
        if (!cell) return;
        const date = cell.dataset.date;
        const tasks = TaskModule.getTasksByDate(date);
        const detail = document.getElementById('cal-task-detail');
        if (!detail) return;

        const subjects = SubjectModule.getAll();
        if (tasks.length === 0) {
          detail.innerHTML = `<div class="text-center py-6 text-stone-400 text-sm">${date} 无任务</div>`;
        } else {
          const settings = State.get('settings');
          detail.innerHTML = `
            <div class="text-sm font-bold text-stone-700 mb-2">📋 ${date} ${DateUtils.getDayName(date)} (${tasks.length}个任务)</div>
            <div class="${settings.viewMode === 'compact' ? 'space-y-1' : 'space-y-4'}">
              ${tasks.map(t => renderTaskCard(t, subjects)).join('')}
            </div>
          `;
        }
      });
    }
  }

  // ═══ 复盘页 ═══
  function renderReview() {
    const el = document.getElementById('page-review');
    if (!el) return;

    const weekly = ReviewModule.getWeeklyReport();
    const monthly = ReviewModule.getMonthlyReport();
    const subjects = SubjectModule.getAll();

    function renderReport(report, label) {
      return `
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">${label}复盘 (${report.start} ~ ${report.end})</h3>

          <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="text-center">
              <div class="text-xl font-black text-amber-600">${report.completionRate}%</div>
              <div class="text-xs text-stone-400">任务完成率</div>
            </div>
            <div class="text-center">
              <div class="text-xl font-black text-stone-700">${report.completedTasks}/${report.totalTasks}</div>
              <div class="text-xs text-stone-400">完成/总任务</div>
            </div>
            <div class="text-center">
              <div class="text-xl font-black ${report.rateChange >= 0 ? 'text-emerald-500' : 'text-orange-500'}">${report.rateChange >= 0 ? '+' : ''}${report.rateChange}%</div>
              <div class="text-xs text-stone-400">较上周期</div>
            </div>
          </div>

          <!-- 各科进度 -->
          <div class="text-xs font-medium text-stone-600 mb-2">各科完成情况</div>
          ${report.subjectProgress.filter(sp => sp.total > 0).map(sp => `
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs text-stone-500 review-subject-label truncate">${escapeText(sp.name)}</span>
              <div class="flex-1 bg-stone-100 rounded-full h-1.5">
                <div class="h-1.5 rounded-full" style="width:${sp.rate}%;background-color:${safeColor(sp.color)}"></div>
              </div>
              <span class="text-xs text-stone-400 w-10 text-right">${sp.rate}%</span>
            </div>
          `).join('')}

          ${report.offDays.length > 0 ? `
            <div class="mt-3 pt-3 border-t border-stone-100">
              <div class="text-xs text-stone-500">休息日/请假：${report.offDays.map(d => `${d.date}(${d.type === 'leave' ? '请假' : '休息'})`).join('、')}</div>
            </div>
          ` : ''}

          ${report.checkinNotes.length > 0 ? `
            <div class="mt-3 pt-3 border-t border-stone-100">
              <div class="text-xs font-medium text-stone-600 mb-2">📝 打卡备注汇总</div>
              ${report.checkinNotes.map(n => `
                <div class="text-xs text-stone-500 mb-1">
                  <span class="text-stone-400">${n.date}</span> ${Validate.sanitizeHTML(n.note)}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    el.innerHTML = `
      <div class="px-4 pt-3 pb-20 md:pb-4 space-y-4">
        <h2 class="text-lg font-bold text-stone-800">📊 复盘统计</h2>
        ${renderReport(weekly, '周度')}
        ${renderReport(monthly, '月度')}
      </div>
    `;
  }

  // ═══ 设置页 ═══
  function renderSettings() {
    const el = document.getElementById('page-settings');
    if (!el) return;

    const settings = State.get('settings');
    const subjects = SubjectModule.getAll();
    const weeklyRest = RestModule.getWeeklyRestDays();
    const tempRests = RestModule.getRestDays().filter(r => r.type === 'temporary');
    const leaves = RestModule.getLeaves().filter(l => !l.isRevoked);
    const previewTask = {
      id: 'settings-display-preview',
      subjectId: '',
      content: '示例任务：完成一篇英语阅读',
      status: 'pending',
      deleted: false,
      checkinNote: ''
    };
    const displayPreview = `
      <div class="mt-3 pt-3 border-t border-stone-100 pointer-events-none" aria-label="任务条目样式预览">
        <div class="text-xs text-stone-400 mb-2">效果预览</div>
        <div class="${settings.viewMode === 'compact' ? 'space-y-1' : 'space-y-4'}">
          ${renderTaskCard(previewTask, [], { animate: false })}
          ${renderTaskCard({ ...previewTask, id: 'settings-display-preview-2', content: '示例任务：整理数学错题' }, [], { animate: false })}
        </div>
      </div>`;

    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    el.innerHTML = `
      <div class="px-4 pt-3 pb-20 md:pb-4 space-y-4">
        <h2 class="text-lg font-bold text-stone-800">⚙️ 设置</h2>

        <!-- 科目管理 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">📚 科目管理</h3>
          <div id="subject-list" class="space-y-1 mb-3">
            ${subjects.map(s => `
              <div class="flex items-center gap-2 text-sm py-1.5 px-1 rounded-lg cursor-move hover:bg-stone-50 transition-all subject-drag-item" data-subject-id="${escapeText(s.id)}" draggable="true">
                <span class="cursor-grab text-stone-300"><i class="fa fa-bars text-xs"></i></span>
                <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:${safeColor(s.color)}"></span>
                <span class="flex-1 text-stone-700 truncate">${escapeText(s.name)}</span>
                ${s.isPreset ? '<span class="text-[10px] text-stone-400 flex-shrink-0">预置</span>' : ''}
                <button class="text-xs text-stone-400 hover:text-amber-600 flex-shrink-0 rename-subject" data-id="${escapeText(s.id)}">重命名</button>
                ${s.isPreset ? '' : `<button class="text-xs text-orange-400 hover:text-orange-600 flex-shrink-0 delete-subject" data-id="${escapeText(s.id)}">删除</button>`}
              </div>
            `).join('')}
          </div>
          <div class="flex gap-2">
            <input type="text" id="new-subject-name" placeholder="新科目名称" class="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300">
            <button id="add-subject-btn" class="px-4 py-2 bg-amber-500 text-white text-sm rounded-xl hover:bg-amber-600 transition-all active:scale-95">添加</button>
          </div>
        </div>

        <!-- 任务顺延规则 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🔄 任务顺延规则</h3>
          <div class="flex items-center justify-between cursor-pointer" id="postpone-toggle">
            <span class="text-sm text-stone-600">未完成时，后续计划整体顺延一天</span>
            <div class="relative pointer-events-none">
              <input type="checkbox" id="auto-postpone" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0" ${settings.autoPostpone ? 'checked' : ''}>
              <div class="toggle-bg w-11 h-6 rounded-full transition-all ${settings.autoPostpone ? 'bg-amber-400' : 'bg-stone-300'}"></div>
              <div class="toggle-dot absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.autoPostpone ? 'translate-x-5' : ''}"></div>
            </div>
          </div>
        </div>

        <!-- 显示与提醒 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">显示与提醒</h3>
          <div class="space-y-3 text-sm">
            <div>
              <div class="text-stone-600 mb-1.5">任务列表密度</div>
              <div class="flex gap-2">
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${settings.viewMode === 'compact' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="viewMode" data-value="compact">紧凑</button>
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${settings.viewMode === 'comfortable' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="viewMode" data-value="comfortable">宽松</button>
              </div>
            </div>
            <div>
              <div class="text-stone-600 mb-1.5">任务条目样式</div>
              <div class="flex gap-2">
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${settings.taskStyle === 'checkbox-left' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="taskStyle" data-value="checkbox-left">勾选框居左</button>
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${settings.taskStyle === 'checkbox-right' ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="taskStyle" data-value="checkbox-right">勾选框居右</button>
              </div>
            </div>
            ${displayPreview}
            <div class="flex items-center justify-between">
              <span class="text-stone-600">每日 ${settings.breakWarningTime || '22:00'} 断卡预警</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="break-warning" class="sr-only peer" ${settings.breakWarning ? 'checked' : ''}>
                <span class="w-10 h-5 bg-stone-300 rounded-full peer-checked:bg-amber-400 transition-all"></span>
                <span class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-5"></span>
              </label>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-stone-600">预警时间</span>
              <input type="time" id="break-warning-time" value="${settings.breakWarningTime || '22:00'}" class="px-2 py-1.5 text-xs border border-stone-200 rounded-lg">
            </div>
            <div>
              <div class="text-stone-600 mb-1.5">搜索框显示方式</div>
              <div class="flex gap-2">
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${!settings.searchExpanded ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="searchExpanded" data-value="false">点击展开</button>
                <button class="settings-choice flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${settings.searchExpanded ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-stone-200 text-stone-500'}" data-setting="searchExpanded" data-value="true">固定展示</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 周期休息日 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🏖️ 周期休息日</h3>
          <div class="flex flex-wrap gap-1.5" id="weekly-rest-selector">
            ${dayNames.map((name, idx) => `
              <button class="weekly-rest-btn px-2 py-1.5 rounded-full text-xs border transition-all ${weeklyRest.includes(idx) ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-stone-200 text-stone-500'}" data-day="${idx}">${name}</button>
            `).join('')}
          </div>
        </div>

        <!-- 临时休息日 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-stone-800 text-sm">📅 临时休息日</h3>
            <div class="flex items-center gap-2">
              <button id="add-temp-rest-batch-btn" class="text-xs text-stone-500 font-medium">批量新增</button>
              <button id="add-temp-rest-btn" class="text-xs text-amber-600 font-medium">+ 新增</button>
            </div>
          </div>
          ${tempRests.length === 0 ? '<p class="text-xs text-stone-400">暂无临时休息日</p>' : tempRests.map(r => `
            <div class="flex items-center justify-between text-sm py-1">
              <span class="text-stone-600">${r.startDate}${r.endDate !== r.startDate ? ' ~ ' + r.endDate : ''}</span>
              <button class="text-xs text-orange-400 remove-temp-rest" data-id="${r.id}">取消</button>
            </div>
          `).join('')}
          ${tempRests.length > 1 ? '<button id="cancel-all-temp-rest-btn" class="mt-2 text-xs text-orange-500">批量取消全部临时休息日</button>' : ''}
        </div>

        <!-- 请假管理 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-stone-800 text-sm">🏥 请假管理</h3>
            <button id="add-leave-btn" class="text-xs text-amber-600 font-medium">+ 新增</button>
          </div>
          ${leaves.length === 0 ? '<p class="text-xs text-stone-400">暂无请假记录</p>' : leaves.map(l => `
            <div class="flex items-center justify-between text-sm py-1">
              <span class="text-stone-600">${l.startDate} ~ ${l.endDate}</span>
              <button class="text-xs text-orange-400 revoke-leave" data-id="${l.id}">撤销</button>
            </div>
          `).join('')}
        </div>

        <!-- 考研日期 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🗓️ 考研日期</h3>
          <input type="date" id="exam-date-input" value="${escapeText(settings.examDate)}" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300">
        </div>
        <!-- 周期性重复任务 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🔁 周期性重复任务</h3>
          <div id="recurring-list" class="space-y-1 mb-3">
            ${RecurringModule.getRules().length === 0 ? '<p class="text-xs text-stone-400">暂无重复任务</p>' : RecurringModule.getRules().map(r => {
              const sub = SubjectModule.getAll().find(s => s.id === r.subjectId);
              const typeLabel = r.ruleType === 'daily' ? '每日' : '每周' + r.weekDays.map(d => dayNames[d]).join('、');
              return `
                <div class="flex items-center justify-between text-sm py-1.5 px-1 rounded-lg hover:bg-stone-50">
                  <div class="flex-1 min-w-0">
                    <span class="text-stone-700 truncate block">${escapeText(r.content)}</span>
                    <span class="text-[10px] text-stone-400">${typeLabel}${sub ? ' · ' + escapeText(sub.name) : ''} ${r.enabled ? '' : '(已暂停)'}</span>
                  </div>
                  <div class="flex gap-1 flex-shrink-0">
                    <button class="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-500 edit-recurring" data-id="${r.id}">编辑</button>
                    <button class="text-xs px-2 py-1 rounded-lg ${r.enabled ? 'bg-stone-100 text-stone-500' : 'bg-emerald-100 text-emerald-600'} toggle-recurring" data-id="${r.id}">${r.enabled ? '暂停' : '启用'}</button>
                    <button class="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-400 delete-recurring" data-id="${r.id}">删除</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="flex gap-2">
            <button id="add-recurring-btn" class="text-xs text-amber-600 font-medium hover:text-amber-700 transition-all">+ 新建重复任务</button>
          </div>
        </div>

        <!-- 数据存储 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-2">💾 本地数据</h3>
          <p class="text-xs text-stone-500">当前数据仅保存在此浏览器。接入安全的认证和数据库服务后，才能启用跨设备同步。</p>
        </div>

        <!-- 重置 -->
        <div class="bg-white rounded-2xl border border-red-100 p-4 shadow-sm">
          <button id="reset-all-btn" class="w-full py-2.5 bg-red-50 text-red-500 rounded-xl text-sm font-medium hover:bg-red-100 transition-all active:scale-95">
            🗑️ 一键重置全部数据
          </button>
        </div>
      </div>
    `;

    bindSettingsEvents();
  }

  function addSettingsInlineHandlers() {
    // 任务顺延开关 — 给外层 div 加点击
    var pt = document.getElementById('postpone-toggle');
    if (pt) pt.onclick = function() {
      var cb = document.getElementById('auto-postpone');
      cb.checked = !cb.checked;

      // 同步更新视觉 toggle 样式（避免仅更新隐藏 checkbox 导致视觉无反馈）
      var toggleBg = pt.querySelector('.toggle-bg');
      var toggleDot = pt.querySelector('.toggle-dot');
      if (toggleBg) {
        toggleBg.classList.toggle('bg-amber-400', cb.checked);
        toggleBg.classList.toggle('bg-stone-300', !cb.checked);
      }
      if (toggleDot) toggleDot.classList.toggle('translate-x-5', cb.checked);

      cb.dispatchEvent(new Event('change', {bubbles: true}));
    };

    var ap = document.getElementById('auto-postpone');
    if (ap) ap.onchange = function() {
      State.update('settings', { autoPostpone: this.checked });
      State.persist('settings');
    };

    var ei = document.getElementById('exam-date-input');
    if (ei) ei.onchange = function() {
      if (this.value && !Validate.isValidDate(this.value)) {
        this.value = State.get('settings').examDate;
        Toast.warning('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u8003\u7814\u65e5\u671f');
        return;
      }
      State.update('settings', { examDate: this.value });
      State.persist('settings');
      RecurringModule.refresh();
      Toast.success('考研日期已更新');
    };
  }

  function bindSettingsEvents() {
    bindSubjectDrag();
    addSettingsInlineHandlers();
  }

  // ─── 科目拖拽排序逻辑 ───
  function bindSubjectDrag() {
    const list = document.getElementById('subject-list');
    if (!list) return;

    const items = list.querySelectorAll('.subject-drag-item');

    items.forEach(item => {
      const dragHandle = item.querySelector('.cursor-grab');
      if (!dragHandle) return;

      item.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('opacity-50', 'bg-amber-50');
        e.dataTransfer.setData('text/plain', item.dataset.subjectId);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('opacity-50', 'bg-amber-50');
        // 清除所有高亮
        items.forEach(i => i.classList.remove('border-t-2', 'border-amber-400'));
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('dragenter', e => {
        e.preventDefault();
        items.forEach(i => i.classList.remove('border-t-2', 'border-amber-400'));
        item.classList.add('border-t-2', 'border-amber-400');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('border-t-2', 'border-amber-400');
      });

      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('border-t-2', 'border-amber-400');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId) return;

        // 获取当前排序
        const currentItems = [...list.querySelectorAll('.subject-drag-item')];
        const orderedIds = currentItems.map(el => el.dataset.subjectId);

        // 取出被拖拽的，插入到目标位置之前
        const fromIdx = orderedIds.indexOf(draggedId);
        const toIdx = orderedIds.indexOf(item.dataset.subjectId);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        orderedIds.splice(fromIdx, 1);
        orderedIds.splice(toIdx, 0, draggedId);

        SubjectModule.reorder(orderedIds);
        Toast.success('科目排序已更新');
        renderSettings();
      });
    });
  }

  return { init, handleRoute, handleRouteDirect, renderHome, renderCalendar, renderReview, renderSettings };
})();

// ─── 批量导入解析函数 ───
function parseBatchImportDate(value) {
  const raw = String(value || '').trim().replace(/[年月.。/]/g, '-').replace(/日/g, '');
  const year = Number(DateUtils.today().slice(0, 4));
  let match = raw.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})$/);
  if (match) {
    const date = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
    return Validate.isValidDate(date) ? date : null;
  }

  match = raw.match(/^(\d{1,2})-(\d{1,2})$/) || raw.match(/^(\d{2})(\d{2})$/);
  if (!match) return null;
  const date = `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  return Validate.isValidDate(date) ? date : null;
}

function findImportSubjectId(subjectName, subjects) {
  const name = String(subjectName || '').trim();
  if (!name) return '';
  const exact = subjects.find(s => s.id === name || s.name === name);
  if (exact) return exact.id;
  const similar = subjects.find(s => s.name.includes(name) || name.includes(s.name));
  return similar ? similar.id : '';
}

function previewBatchImport(rawText, options = {}) {
  const subjects = SubjectModule.getAll();
  const defaultDate = Validate.isValidDate(options.defaultDate) ? options.defaultDate : DateUtils.today();
  const defaultSubjectId = subjects.some(s => s.id === options.defaultSubjectId) ? options.defaultSubjectId : '';
  const tasks = [];
  let skipped = 0;
  let activeDate = defaultDate;

  String(rawText || '').replace(/\r\n?/g, '\n').split('\n').forEach(rawLine => {
    let line = rawLine.trim();
    if (!line) return;

    const dateHeader = parseBatchImportDate(line.replace(/[：:]+$/, ''));
    if (dateHeader) {
      activeDate = dateHeader;
      return;
    }

    const columns = line.split(/[|｜]/).map(part => part.trim());
    let subjectId = defaultSubjectId;
    let content = line;

    if (columns.length >= 3) {
      const lineDate = parseBatchImportDate(columns[0]);
      if (lineDate) activeDate = lineDate;
      subjectId = findImportSubjectId(columns[1], subjects) || defaultSubjectId;
      content = columns.slice(2).join(' | ');
    } else if (columns.length === 2) {
      const lineDate = parseBatchImportDate(columns[0]);
      const lineSubjectId = findImportSubjectId(columns[0], subjects);
      if (lineDate) {
        activeDate = lineDate;
        content = columns[1];
      } else if (lineSubjectId) {
        subjectId = lineSubjectId;
        content = columns[1];
      }
    }

    content = content.replace(/^\s*(?:[-*+•]|\d+[.)、])\s*/, '');
    const tag = content.match(/^[【\[「《]([^】\]」》]+)[】\]」》]\s*/);
    if (tag) {
      const taggedSubjectId = findImportSubjectId(tag[1], subjects);
      if (taggedSubjectId) {
        subjectId = taggedSubjectId;
        content = content.slice(tag[0].length);
      }
    }

    if (!Validate.isValidTask(content)) {
      skipped++;
      return;
    }
    tasks.push({ subjectId, content: content.trim(), scheduledDate: activeDate });
  });

  return {
    ok: tasks.length > 0,
    tasks,
    skipped,
    msg: tasks.length > 0 ? '' : '没有可导入的有效任务'
  };
}

function importBatchTasks(rawText, options = {}) {
  const preview = previewBatchImport(rawText, options);
  if (!preview.ok) return { ok: false, msg: preview.msg, skipped: preview.skipped };

  const result = TaskModule.addTaskBatch(preview.tasks);
  result.skipped = preview.skipped;
  return result;
}

// ─── 启动 ───
document.addEventListener('DOMContentLoaded', () => App.init());
