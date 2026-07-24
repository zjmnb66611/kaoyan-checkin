/**
 * hash 路由 + 主入口
 */
const App = (() => {
  // 当前页面
  let currentPage = 'home';
  let currentCalendarView = 'month';
  let currentCalendarDate = DateUtils.today();

  function init() {
    // 检查是否需要顺延昨日未完成任务
    TaskModule.postponeUncompletedTasks(DateUtils.addDays(DateUtils.today(), -1));

    // 更新打卡统计
    CheckinModule.updateCheckinStats();

    // 路由监听
    window.addEventListener('hashchange', handleRoute);
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

    // 初始化时不重复渲染（handleRoute 会调用）
  }

  function handleRoute() {
    const hash = location.hash || '#/home';
    const page = hash.replace('#/', '') || 'home';

    // 更新导航 active
    document.querySelectorAll('.nav-item').forEach(el => {
      DOM.toggleClass(el, 'active', el.dataset.page === page || (page === 'home' && el.dataset.page === 'home'));
    });

    // 切换页面容器
    document.querySelectorAll('.page-container').forEach(el => el.style.display = 'none');

    switch (page) {
      case 'home':
        currentPage = 'home';
        const homeEl = document.getElementById('page-home');
        if (homeEl) homeEl.style.display = '';
        renderHome();
        break;
      case 'calendar':
        currentPage = 'calendar';
        const calEl = document.getElementById('page-calendar');
        if (calEl) calEl.style.display = '';
        renderCalendar();
        break;
      case 'review':
        currentPage = 'review';
        const revEl = document.getElementById('page-review');
        if (revEl) revEl.style.display = '';
        renderReview();
        break;
      case 'settings':
        currentPage = 'settings';
        const setEl = document.getElementById('page-settings');
        if (setEl) setEl.style.display = '';
        renderSettings();
        break;
      default:
        location.hash = '#/home';
    }
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
           <div class="text-center text-stone-400 text-xs mt-1">目标日期：${settings.examDate}</div>
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
                 <span>${sp.name}</span>
                 <span>${sp.rate}%</span>
               </div>
               <div class="w-full bg-stone-100 rounded-full h-1.5">
                 <div class="h-1.5 rounded-full transition-all duration-500" style="width:${sp.rate}%;background-color:${sp.color}"></div>
               </div>
             </div>
           `).join('')}
         </div>`;

    const viewModeClass = settings.viewMode === 'compact' ? 'space-y-1' : 'space-y-3';

    el.innerHTML = `
      <!-- 搜索栏 -->
      <div class="px-4 pt-3 pb-2">
        <div class="relative">
          <i class="fa fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm"></i>
          <input type="text" id="search-input" placeholder="搜索任务..."
            class="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition-all">
        </div>
      </div>

	      <!-- 今日任务列表 -->
      <div class="px-4 mt-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-stone-800">
            📋 今日任务
            <span class="text-sm text-stone-400 font-normal ml-2">${DateUtils.getDayName(today)}</span>
          </h2>
          <div class="flex items-center gap-2">
            <button id="batch-import-btn" class="text-xs text-amber-600 font-medium hover:text-amber-700 transition-all active:scale-95 flex items-center gap-1">
              <i class="fa fa-upload"></i> 批量导入
            </button>
            <span class="text-xs text-stone-400">${completedCount}/${todayTasks.length}</span>
            <span class="text-xs font-bold text-amber-600">${completionRate}%</span>
          </div>
        </div>

        ${todayTasks.length === 0
          ? `<div class="text-center py-10 text-stone-400">
               <div class="text-4xl mb-3">📝</div>
               <p class="text-sm">今天还没有任务，点击右下角 + 添加吧</p>
             </div>`
          : `<div class="${viewModeClass}" id="task-list">
               ${todayTasks.map(t => renderTaskCard(t, subjects)).join('')}
             </div>`
        }
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
    `;

    // 事件绑定
    bindHomeEvents();
  }

  function bindHomeEvents() {
    // 搜索
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        const results = TaskModule.searchTasks(e.target.value);
        const taskList = document.getElementById('task-list');
        if (taskList && results.length > 0) {
          const subjects = SubjectModule.getAll();
          taskList.innerHTML = results.map(t => renderTaskCard(t, subjects)).join('');
        }
      });
    }

    // 批量导入
    const batchImportBtn = document.getElementById('batch-import-btn');
    if (batchImportBtn) {
      batchImportBtn.addEventListener('click', () => {
        Modal.show({
          title: '📥 批量导入任务',
          bodyHTML: `
            <div class="space-y-3 text-left">
              <div>
                <label class="text-xs text-stone-500 block mb-1">粘贴任务数据（每行一个任务）</label>
                <textarea id="batch-import-text" rows="6" placeholder="格式：日期,科目,任务内容&#10;示例：&#10;2026-07-25,英语,背50个单词&#10;2026-07-25,政治,复习马原第一章&#10;2026-07-26,数学分析,做课后习题" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none font-mono text-xs"></textarea>
                <p class="text-xs text-stone-400 mt-1">支持格式：<code>日期,科目,内容</code> 或 <code>日期,内容</code>（科目可选）</p>
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" id="batch-skip-invalid" checked class="rounded">
                <label for="batch-skip-invalid" class="text-xs text-stone-500">跳过格式错误的行</label>
              </div>
            </div>
          `,
          confirmText: '导入',
          onConfirm: () => {
            const rawText = document.getElementById('batch-import-text').value;
            const skipInvalid = document.getElementById('batch-skip-invalid').checked;
            const result = importBatchTasks(rawText, skipInvalid);
            if (result.ok) {
              Toast.success(`成功导入 ${result.added} 个任务`);
              if (result.skipped > 0) Toast.warning(`跳过 ${result.skipped} 条无效数据`);
            } else {
              Toast.error(result.msg);
            }
          }
        });
      });
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
  }

  function renderTaskCard(task, subjects) {
    const sub = subjects.find(s => s.id === task.subjectId);
    const subColor = sub ? sub.color : '#a8a29e';
    const subName = sub ? sub.name : '';
    const isCompleted = task.status === 'completed';
    const settings = State.get('settings');
    const checkboxLeft = settings.taskStyle !== 'checkbox-right';

    const checkboxHTML = `<div class="task-checkbox flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${isCompleted ? 'bg-emerald-400 border-emerald-400' : 'border-stone-300 hover:border-amber-400'}" data-task-id="${task.id}">
      ${isCompleted ? '<i class="fa fa-check text-white text-xs"></i>' : ''}
    </div>`;

    const contentClass = settings.viewMode === 'compact' ? 'py-2.5' : 'py-4';
    const cardClass = `task-card bg-white rounded-xl border ${isCompleted ? 'border-emerald-100 bg-emerald-50/30' : 'border-stone-100'} ${contentClass} flex items-center gap-3 px-3 transition-all duration-300 hover:shadow-sm`;

    if (checkboxLeft) {
      return `
        <div class="${cardClass}" data-task-id="${task.id}">
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
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              ${subName ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full text-white font-medium" style="background-color:${subColor}">${subName}</span>` : ''}
            </div>
            <p class="text-sm text-stone-700 task-content ${isCompleted ? 'line-through text-stone-400' : ''}">${Validate.sanitizeHTML(task.content)}</p>
          </div>
          ${checkboxHTML}
        </div>`;
    }
  }

  // ═══ 日历渲染 ═══
  function renderCalendar() {
    const el = document.getElementById('page-calendar');
    if (!el) return;

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

      const day = new Date(d).getDate();

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
          <span class="font-bold text-stone-700">${DateUtils.getFullMonthName(currentCalendarDate)}</span>
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

  function bindCalendarEvents() {
    document.getElementById('cal-prev').addEventListener('click', () => {
      const d = new Date(currentCalendarDate);
      d.setMonth(d.getMonth() - 1);
      currentCalendarDate = DateUtils.formatDate(d);
      renderCalendar();
    });

    document.getElementById('cal-next').addEventListener('click', () => {
      const d = new Date(currentCalendarDate);
      d.setMonth(d.getMonth() + 1);
      currentCalendarDate = DateUtils.formatDate(d);
      renderCalendar();
    });

    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCalendarView = btn.dataset.view;
        renderCalendar();
      });
    });

    // 点击日期显示任务
    DOM.delegate(document.getElementById('page-calendar'), 'click', '.calendar-cell', function() {
      const date = this.dataset.date;
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
          <div class="${settings.viewMode === 'compact' ? 'space-y-1' : 'space-y-2'}">
            ${tasks.map(t => renderTaskCard(t, subjects)).join('')}
          </div>
        `;
      }
    });
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
              <span class="text-xs text-stone-500 review-subject-label truncate">${sp.name}</span>
              <div class="flex-1 bg-stone-100 rounded-full h-1.5">
                <div class="h-1.5 rounded-full" style="width:${sp.rate}%;background-color:${sp.color}"></div>
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
                  <span class="text-stone-400">${n.date}</span> ${n.note}
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

    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

    el.innerHTML = `
      <div class="px-4 pt-3 pb-20 md:pb-4 space-y-4">
        <h2 class="text-lg font-bold text-stone-800">⚙️ 设置</h2>

        <!-- 科目管理 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">📚 科目管理</h3>
          <div id="subject-list" class="space-y-2 mb-3">
            ${subjects.map(s => `
              <div class="flex items-center gap-2 text-sm py-1" data-subject-id="${s.id}">
                <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color:${s.color}"></span>
                <span class="flex-1 text-stone-700 truncate">${s.name}</span>
                ${s.isPreset ? '<span class="text-[10px] text-stone-400 flex-shrink-0">预置</span>' : `<button class="text-xs text-orange-400 hover:text-orange-600 flex-shrink-0 delete-subject" data-id="${s.id}">删除</button>`}
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
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm text-stone-600">未完成任务自动顺延至次日</span>
            <div class="relative">
              <input type="checkbox" class="sr-only toggle-input" id="auto-postpone" ${settings.autoPostpone ? 'checked' : ''}>
              <div class="toggle-bg w-11 h-6 rounded-full transition-all ${settings.autoPostpone ? 'bg-amber-400' : 'bg-stone-300'}"></div>
              <div class="toggle-dot absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.autoPostpone ? 'translate-x-5' : ''}"></div>
            </div>
          </label>
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
            <button id="add-temp-rest-btn" class="text-xs text-amber-600 font-medium">+ 新增</button>
          </div>
          ${tempRests.length === 0 ? '<p class="text-xs text-stone-400">暂无临时休息日</p>' : tempRests.map(r => `
            <div class="flex items-center justify-between text-sm py-1">
              <span class="text-stone-600">${r.startDate}${r.endDate !== r.startDate ? ' ~ ' + r.endDate : ''}</span>
              <button class="text-xs text-orange-400 remove-temp-rest" data-id="${r.id}">取消</button>
            </div>
          `).join('')}
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
          <input type="date" id="exam-date-input" value="${settings.examDate}" class="w-full px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300">
        </div>

        <!-- 断卡预警 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🔔 断卡预警</h3>
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm text-stone-600">每日 ${settings.breakWarningTime} 后检查打卡</span>
            <div class="relative">
              <input type="checkbox" class="sr-only toggle-input" id="break-warning" ${settings.breakWarning ? 'checked' : ''}>
              <div class="toggle-bg w-11 h-6 rounded-full transition-all ${settings.breakWarning ? 'bg-amber-400' : 'bg-stone-300'}"></div>
              <div class="toggle-dot absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${settings.breakWarning ? 'translate-x-5' : ''}"></div>
            </div>
          </label>
        </div>

        <!-- 视图偏好 -->
        <div class="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm">
          <h3 class="font-bold text-stone-800 text-sm mb-3">🎨 视图偏好</h3>
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm text-stone-600">任务列表模式</span>
            <select id="view-mode-select" class="text-sm border border-stone-200 rounded-lg px-2 py-1">
              <option value="compact" ${settings.viewMode === 'compact' ? 'selected' : ''}>紧凑模式</option>
              <option value="comfortable" ${settings.viewMode === 'comfortable' ? 'selected' : ''}>宽松模式</option>
            </select>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-stone-600">勾选框位置</span>
            <select id="task-style-select" class="text-sm border border-stone-200 rounded-lg px-2 py-1">
              <option value="checkbox-left" ${settings.taskStyle === 'checkbox-left' ? 'selected' : ''}>居左</option>
              <option value="checkbox-right" ${settings.taskStyle === 'checkbox-right' ? 'selected' : ''}>居右</option>
            </select>
          </div>
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

  function bindSettingsEvents() {
    // 添加科目
    const addSubjectBtn = document.getElementById('add-subject-btn');
    if (addSubjectBtn) {
      addSubjectBtn.addEventListener('click', () => {
        const input = document.getElementById('new-subject-name');
        if (input && input.value.trim()) {
          SubjectModule.add(input.value.trim());
          Toast.success('科目添加成功');
          renderSettings();
        }
      });
    }

    // 删除科目
    document.querySelectorAll('.delete-subject').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.confirm({
          title: '删除科目',
          body: '删除后该科目下的任务将保留但不再显示科目标签，确认删除？',
          confirmText: '删除',
          onConfirm: () => {
            SubjectModule.remove(btn.dataset.id);
            Toast.success('科目已删除');
            renderSettings();
          }
        });
      });
    });

    // 自动顺延开关
    const postponeToggle = document.getElementById('auto-postpone');
    if (postponeToggle) {
      postponeToggle.addEventListener('change', () => {
        State.update('settings', { autoPostpone: postponeToggle.checked });
        State.persist('settings');
      });
    }

    // 周期休息日按钮
    document.querySelectorAll('.weekly-rest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = parseInt(btn.dataset.day);
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
    });

    // 临时休息日
    const addTempRest = document.getElementById('add-temp-rest-btn');
    if (addTempRest) {
      addTempRest.addEventListener('click', () => {
        const start = prompt('请输入起始日期 (YYYY-MM-DD)：', DateUtils.today());
        if (!start) return;
        const end = prompt('请输入结束日期（单日可留空）：', start) || start;
        RestModule.addTemporaryRest(start, end);
        Toast.success('临时休息日已添加');
        renderSettings();
      });
    }

    document.querySelectorAll('.remove-temp-rest').forEach(btn => {
      btn.addEventListener('click', () => {
        RestModule.removeTemporaryRest(btn.dataset.id);
        Toast.success('临时休息日已取消');
        renderSettings();
      });
    });

    // 请假
    const addLeave = document.getElementById('add-leave-btn');
    if (addLeave) {
      addLeave.addEventListener('click', () => {
        const start = prompt('请输入请假起始日期 (YYYY-MM-DD)：', DateUtils.today());
        if (!start) return;
        const end = prompt('请输入请假结束日期：', start) || start;
        RestModule.addLeave(start, end);
        Toast.success('请假已记录，任务已顺延');
        renderSettings();
      });
    }

    document.querySelectorAll('.revoke-leave').forEach(btn => {
      btn.addEventListener('click', () => {
        Modal.show({
          title: '撤销请假',
          body: '请选择撤销方式：',
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
          onConfirm: () => {} // 按钮自己处理
        });

        setTimeout(() => {
          document.querySelector('.revoke-keep')?.addEventListener('click', () => {
            RestModule.revokeLeave(btn.dataset.id, 'keep_postponed');
            Modal.close();
            Toast.success('请假已撤销（保持顺延状态）');
            renderSettings();
          });
          document.querySelector('.revoke-restore')?.addEventListener('click', () => {
            RestModule.revokeLeave(btn.dataset.id, 'restore_original');
            Modal.close();
            Toast.success('请假已撤销（任务已还原）');
            renderSettings();
          });
        }, 100);
      });
    });

    // 考研日期
    const examInput = document.getElementById('exam-date-input');
    if (examInput) {
      examInput.addEventListener('change', () => {
        State.update('settings', { examDate: examInput.value });
        State.persist('settings');
        Toast.success('考研日期已更新');
      });
    }

    // 断卡预警开关
    const breakWarningToggle = document.getElementById('break-warning');
    if (breakWarningToggle) {
      breakWarningToggle.addEventListener('change', () => {
        State.update('settings', { breakWarning: breakWarningToggle.checked });
        State.persist('settings');
      });
    }

    // 视图偏好
    const viewMode = document.getElementById('view-mode-select');
    if (viewMode) {
      viewMode.addEventListener('change', () => {
        State.update('settings', { viewMode: viewMode.value });
        State.persist('settings');
        renderHome();
      });
    }

    const taskStyle = document.getElementById('task-style-select');
    if (taskStyle) {
      taskStyle.addEventListener('change', () => {
        State.update('settings', { taskStyle: taskStyle.value });
        State.persist('settings');
        renderHome();
      });
    }

    // 重置全部数据
    const resetBtn = document.getElementById('reset-all-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
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
    }
  }

  return { init, handleRoute, renderHome, renderCalendar, renderReview, renderSettings };
})();

// ─── 批量导入解析函数 ───
function importBatchTasks(rawText, skipInvalid) {
  if (!rawText || !rawText.trim()) return { ok: false, msg: '请输入任务数据' };

  const lines = rawText.trim().split('\n').filter(l => l.trim());
  const subjects = SubjectModule.getAll();
  const taskList = [];
  let skipped = 0;

  // 创建科目名称 → ID 的映射
  const subjectMap = {};
  subjects.forEach(s => { subjectMap[s.name] = s.id; });

  lines.forEach((line, idx) => {
    // 按逗号分隔（支持中文逗号）
    const parts = line.split(/[,，]/);
    if (parts.length < 2) {
      if (!skipInvalid) throw { skipped, line: idx + 1 };
      skipped++;
      return;
    }

    let date, subjectId = '', content;

    if (parts.length >= 3) {
      // 格式：日期,科目,内容
      date = parts[0].trim();
      const subjectName = parts[1].trim();
      content = parts.slice(2).join(',').trim();

      // 查找科目
      if (subjectName && subjectMap[subjectName]) {
        subjectId = subjectMap[subjectName];
      } else if (subjectName) {
        // 尝试模糊匹配
        const matched = subjects.find(s => s.name.includes(subjectName) || subjectName.includes(s.name));
        if (matched) subjectId = matched.id;
      }
    } else {
      // 格式：日期,内容
      date = parts[0].trim();
      content = parts[1].trim();
    }

    // 校验日期
    if (!Validate.isValidDate(date)) {
      if (!skipInvalid) throw { skipped, line: idx + 1, reason: `第${idx + 1}行日期格式无效: ${date}` };
      skipped++;
      return;
    }

    // 校验内容
    if (!Validate.isValidTask(content)) {
      if (!skipInvalid) throw { skipped, line: idx + 1, reason: `第${idx + 1}行任务内容无效` };
      skipped++;
      return;
    }

    taskList.push({ subjectId, content, scheduledDate: date });
  });

  if (taskList.length === 0) {
    return { ok: false, msg: '没有可导入的有效数据' };
  }

  const result = TaskModule.addTaskBatch(taskList);
  result.skipped = skipped;
  return result;
}

// ─── 启动 ───
document.addEventListener('DOMContentLoaded', () => App.init());
