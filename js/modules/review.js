/**
 * 复盘模块 - 周度/月度复盘统计
 */
const ReviewModule = (() => {
  function getWeeklyReport(dateStr) {
    const { start, end } = DateUtils.getWeekRange(dateStr || DateUtils.today());
    return generateReport(start, end, 'weekly');
  }

  function getMonthlyReport(dateStr) {
    const { start, end } = DateUtils.getMonthRange(dateStr || DateUtils.today());
    return generateReport(start, end, 'monthly');
  }

  function generateReport(start, end, type) {
    const tasks = TaskModule.getTasks();
    const subjects = State.get('subjects').filter(s => !s.deleted);
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());

    // 周期内任务
    const periodTasks = tasks.filter(t =>
      t.scheduledDate >= start && t.scheduledDate <= end && !t.deleted
    );

    const completedTasks = periodTasks.filter(t => t.status === 'completed');
    const completionRate = periodTasks.length > 0
      ? Math.round((completedTasks.length / periodTasks.length) * 100)
      : 0;

    // 各科进度
    const subjectProgress = subjects.map(sub => {
      const subTasks = periodTasks.filter(t => t.subjectId === sub.id);
      const subCompleted = subTasks.filter(t => t.status === 'completed');
      return {
        subjectId: sub.id,
        name: sub.name,
        color: sub.color,
        total: subTasks.length,
        completed: subCompleted.length,
        rate: subTasks.length > 0 ? Math.round((subCompleted.length / subTasks.length) * 100) : 0
      };
    });

    // 打卡记录
    const checkinRecords = completedTasks.map(t => ({
      date: t.scheduledDate,
      content: t.content,
      subjectId: t.subjectId,
      isBackfill: t.isCheckinBackfill
    })).sort((a, b) => a.date.localeCompare(b.date));

    // 打卡备注汇总
    const checkinNotes = CheckinModule.getCheckinNotes(start, end);

    // 休息日/请假标注
    const offDays = [];
    const allDates = [];
    let d = start;
    while (d <= end) {
      if (restDates.has(d)) offDays.push({ date: d, type: 'rest' });
      if (leaveDates.has(d)) offDays.push({ date: d, type: 'leave' });
      allDates.push(d);
      d = DateUtils.addDays(d, 1);
    }

    // 进度变动（相比上个周期）
    const prevStart = type === 'weekly'
      ? DateUtils.addDays(start, -7)
      : new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1).toISOString().slice(0, 10);
    const prevStartStr = type === 'weekly' ? DateUtils.addDays(start, -7) : prevStart;
    const prevEndStr = DateUtils.addDays(start, -1);

    const prevTasks = tasks.filter(t =>
      t.scheduledDate >= prevStartStr && t.scheduledDate <= prevEndStr && !t.deleted
    );
    const prevCompleted = prevTasks.filter(t => t.status === 'completed');
    const prevRate = prevTasks.length > 0
      ? Math.round((prevCompleted.length / prevTasks.length) * 100)
      : 0;

    return {
      type, start, end,
      totalTasks: periodTasks.length,
      completedTasks: completedTasks.length,
      completionRate,
      prevCompletionRate: prevRate,
      rateChange: completionRate - prevRate,
      subjectProgress,
      checkinRecords,
      checkinNotes,
      offDays,
      tasks: periodTasks
    };
  }

  function getDailyCompletionRate(dateStr) {
    const tasks = TaskModule.getTasksByDate(dateStr);
    if (tasks.length === 0) return null;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return { total: tasks.length, completed, rate: Math.round((completed / tasks.length) * 100) };
  }

  function getOverallSubjectProgress() {
    const subjects = State.get('subjects').filter(s => !s.deleted);
    const allTasks = TaskModule.getTasks();
    return subjects.map(sub => {
      const subTasks = allTasks.filter(t => t.subjectId === sub.id);
      const completed = subTasks.filter(t => t.status === 'completed').length;
      return {
        subjectId: sub.id,
        name: sub.name,
        color: sub.color,
        total: subTasks.length,
        completed,
        rate: subTasks.length > 0 ? Math.round((completed / subTasks.length) * 100) : 0
      };
    });
  }

  return { getWeeklyReport, getMonthlyReport, getDailyCompletionRate, getOverallSubjectProgress };
})();
