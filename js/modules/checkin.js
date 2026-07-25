/**
 * 打卡模块
 */
const CheckinModule = (() => {
  function toggleCheckin(taskId) {
    const task = TaskModule.getTaskById(taskId);
    if (!task) return { ok: false, msg: '任务不存在' };

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    if (newStatus === 'completed' && task.scheduledDate < DateUtils.today() && !task.isCheckinBackfill) {
      return backfillCheckin(taskId);
    }
    // 历史任务必须经过补卡入口，统一执行每周一次的补卡限制。
    const result = TaskModule.updateTask(taskId, {
      status: newStatus,
      isCheckinBackfill: newStatus === 'pending' ? false : !!task.isCheckinBackfill
    });

    if (result.ok) {
      updateCheckinStats();
      if (newStatus === 'completed') {
        document.dispatchEvent(new CustomEvent('checkin:completed', { detail: { taskId } }));
        checkDailyAllDone();
      }
    }
    return result;
  }

  function addCheckinNote(taskId, note) {
    return TaskModule.updateTask(taskId, { checkinNote: note });
  }

  // 补卡
  function backfillCheckin(taskId) {
    const stats = State.get('checkinStats');
    const today = DateUtils.today();
    const resetDate = stats.weeklyMakeupResetDate;

    // 检查是否需要重置
    if (!resetDate || today >= resetDate) {
      stats.weeklyMakeupUsed = 0;
      stats.weeklyMakeupResetDate = DateUtils.addDays(DateUtils.getWeekRange(today).end, 1);
    }

    if (stats.weeklyMakeupUsed >= 1) {
      return { ok: false, msg: '本周补卡次数已用完（每周1次）' };
    }

    const task = TaskModule.getTaskById(taskId);
    if (!task) return { ok: false, msg: '任务不存在' };
    if (task.scheduledDate >= today) return { ok: false, msg: '补卡仅适用于历史日期' };

    const result = TaskModule.updateTask(taskId, {
      status: 'completed',
      isCheckinBackfill: true
    });

    if (result.ok) {
      stats.weeklyMakeupUsed++;
      State.set('checkinStats', stats);
      State.persist('checkinStats');
    }
    return result;
  }

  // 检查当日是否全部完成
  function checkDailyAllDone() {
    const today = DateUtils.today();
    const todayTasks = TaskModule.getTasksByDate(today);
    if (todayTasks.length === 0) return false;

    const allDone = todayTasks.every(t => t.status === 'completed');
    if (allDone) {
      document.dispatchEvent(new CustomEvent('checkin:daily-all-done'));
      return true;
    }
    return false;
  }

  // 更新打卡统计
  function updateCheckinStats() {
    const tasks = TaskModule.getTasks();
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());
    const stats = State.get('checkinStats');

    // 统计所有有过打卡的日期
    const checkedInDates = new Set();
    tasks.filter(t => t.status === 'completed' && !t.deleted).forEach(t => {
      checkedInDates.add(t.scheduledDate);
    });

    // 排除休息日/请假（不计入断卡）
    const allOff = new Set([...restDates, ...leaveDates]);
    const validCheckedInDates = [...checkedInDates].filter(d => !allOff.has(d));
    stats.totalDays = validCheckedInDates.length;

    // 计算连续打卡天数（休息日和请假不计入也不打断连续）
    let consecutive = 0;
    const today = DateUtils.today();
    let checkDate = today;
    // 如果今天是工作日且还没打卡，从昨天开始算
    if (!allOff.has(today) && !checkedInDates.has(today)) {
      checkDate = DateUtils.addDays(today, -1);
    }

    while (true) {
      if (allOff.has(checkDate)) {
        // 休息日/请假：不打断连续，也不计入天数，直接跳过
        checkDate = DateUtils.addDays(checkDate, -1);
        continue;
      }
      if (!validCheckedInDates.includes(checkDate)) break;
      consecutive++;
      checkDate = DateUtils.addDays(checkDate, -1);
    }
    stats.consecutiveDays = consecutive;
    stats.lastCheckinDate = validCheckedInDates.length > 0
      ? [...validCheckedInDates].sort().reverse()[0]
      : '';

    State.set('checkinStats', stats);
    State.persist('checkinStats');
  }

  // 断卡预警检查
  function checkBreakWarning() {
    const settings = State.get('settings');
    if (!settings.breakWarning) return;

    const today = DateUtils.today();
    if (RestModule.isRestDay(today)) return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (currentTime < settings.breakWarningTime) return;

    const todayTasks = TaskModule.getTasksByDate(today);
    if (todayTasks.length === 0) return;

    const hasCheckin = todayTasks.some(t => t.status === 'completed');
    if (!hasCheckin) {
      document.dispatchEvent(new CustomEvent('break-warning'));
    }
  }

  // 获取打卡备注聚合（用于复盘）
  function getCheckinNotes(startDate, endDate) {
    return TaskModule.getTasks()
      .filter(t => t.checkinNote && t.scheduledDate >= startDate && t.scheduledDate <= endDate)
      .map(t => ({ date: t.scheduledDate, content: t.content, note: t.checkinNote, subjectId: t.subjectId }));
  }

  return {
    toggleCheckin, addCheckinNote, backfillCheckin,
    checkDailyAllDone, updateCheckinStats, checkBreakWarning,
    getCheckinNotes
  };
})();
