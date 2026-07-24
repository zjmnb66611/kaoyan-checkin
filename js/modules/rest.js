/**
 * 休息日 + 请假模块
 */
const RestModule = (() => {
  function getRestDays() { return State.get('restDays') || []; }
  function getLeaves() { return State.get('leaves') || []; }

  // 缓存失效
  function _invalidateCaches() {
    _restDatesCache = null;
    _restDatesCacheKey = '';
    _leaveDatesCache = null;
    _leaveDatesCacheKey = '';
  }

  // 周期性周休息日
  function setWeeklyRestDays(daysOfWeek, enabled = true) {
    // daysOfWeek: [0,6] 0=周日
    let restDays = getRestDays();
    const existing = restDays.find(r => r.type === 'weekly');
    if (existing) {
      existing.dayOfWeek = daysOfWeek;
      existing.enabled = enabled;
    } else {
      restDays.push({
        id: DateUtils.uuid(),
        type: 'weekly',
        dayOfWeek: daysOfWeek,
        enabled,
        createdAt: DateUtils.nowISO()
      });
    }
    State.set('restDays', restDays);
    State.persist('restDays');
    _invalidateCaches();
    applyRestDayPostponement();
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function getWeeklyRestDays() {
    const w = getRestDays().find(r => r.type === 'weekly' && r.enabled);
    return w ? w.dayOfWeek : [];
  }

  // 临时休息日
  function addTemporaryRest(startDate, endDate) {
    const restDays = getRestDays();
    restDays.push({
      id: DateUtils.uuid(),
      type: 'temporary',
      startDate,
      endDate: endDate || startDate,
      enabled: true,
      createdAt: DateUtils.nowISO()
    });
    State.set('restDays', restDays);
    State.persist('restDays');
    _invalidateCaches();
    applyRestDayPostponement();
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function removeTemporaryRest(id) {
    let restDays = getRestDays();
    restDays = restDays.filter(r => r.id !== id);
    State.set('restDays', restDays);
    State.persist('restDays');
    _invalidateCaches();
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function cancelAllTemporaryRests() {
    const restDays = getRestDays().filter(r => r.type !== 'temporary');
    State.set('restDays', restDays);
    State.persist('restDays');
    _invalidateCaches();
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  // 请假
  function addLeave(startDate, endDate) {
    const leaves = getLeaves();
    // 保存请假时受影响的任务快照
    const tasks = TaskModule.getTasks();
    const taskSnapshots = [];
    let d = startDate;
    const allOff = new Set(getEffectiveRestDates());
    while (d <= endDate) {
      if (!allOff.has(d)) {
        tasks.filter(t => t.scheduledDate === d && !t.deleted).forEach(t => {
          taskSnapshots.push({ taskId: t.id, originalDate: d, newDate: null });
        });
      }
      d = DateUtils.addDays(d, 1);
    }

    leaves.push({
      id: DateUtils.uuid(),
      startDate, endDate,
      isRevoked: false,
      restoreMode: null,
      taskSnapshots,
      createdAt: DateUtils.nowISO()
    });
    State.set('leaves', leaves);
    State.persist('leaves');

    // 顺延任务
    postponeTasksForLeave(startDate, endDate, leaves[leaves.length - 1]);
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function revokeLeave(id, restoreMode) {
    // restoreMode: 'keep_postponed' | 'restore_original'
    const leaves = getLeaves();
    const leave = leaves.find(l => l.id === id);
    if (!leave) return { ok: false, msg: '请假记录不存在' };

    leave.isRevoked = true;
    leave.restoreMode = restoreMode;
    _invalidateCaches();

    if (restoreMode === 'restore_original') {
      const tasks = TaskModule.getTasks();
      leave.taskSnapshots.forEach(snap => {
        const t = tasks.find(t => t.id === snap.taskId);
        if (t && !t.deleted) {
          t.scheduledDate = snap.originalDate;
          t.updatedAt = DateUtils.nowISO();
        }
      });
      State.set('tasks', tasks);
      State.persist('tasks');
    }
    // keep_postponed: 不做任何改动

    State.set('leaves', leaves);
    State.persist('leaves');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  // 计算休息日顺延（将请假日期上未完成任务递进到假期后的工作日）
  function postponeTasksForLeave(startDate, endDate, leaveRecord) {
    const tasks = TaskModule.getTasks();
    const restDates = getEffectiveRestDates();
    const leaveDates = getEffectiveLeaveDates();
    const allOff = new Set([...restDates, ...leaveDates]);

    // 找到假期后第一个工作日起始点，后续逐日递进
    let nextSlot = endDate;
    for (let i = 0; i < 365; i++) {
      nextSlot = DateUtils.addDays(nextSlot, 1);
      if (!allOff.has(nextSlot)) break;
    }

    let d = startDate;
    while (d <= endDate) {
      const dayTasks = tasks.filter(t =>
        t.scheduledDate === d && !t.deleted && t.status === 'pending'
      );
      if (dayTasks.length > 0) {
        // 为不同日期分配不同的工作日，而非全部堆积到同一天
        const target = nextSlot;
        dayTasks.forEach((t) => {
          t.scheduledDate = target;
          t.updatedAt = DateUtils.nowISO();
          if (leaveRecord) {
            const snap = leaveRecord.taskSnapshots.find(s => s.taskId === t.id);
            if (snap) snap.newDate = target;
          }
        });
        // 移动到下一个工作日，供下一天使用
        for (let i = 0; i < 365; i++) {
          nextSlot = DateUtils.addDays(nextSlot, 1);
          if (!allOff.has(nextSlot)) break;
        }
      }
      d = DateUtils.addDays(d, 1);
    }

    State.set('tasks', tasks);
    State.persist('tasks');
  }

  function applyRestDayPostponement() {
    // 对休息日范围内的待完成任务进行顺延
    const tasks = TaskModule.getTasks();
    const restDates = getEffectiveRestDates();
    const leaveDates = getEffectiveLeaveDates();
    const allOff = new Set([...restDates, ...leaveDates]);

    restDates.forEach(restDate => {
      if (restDate >= DateUtils.today()) {
        const dayTasks = tasks.filter(t => t.scheduledDate === restDate && !t.deleted && t.status === 'pending');
        if (dayTasks.length > 0) {
          const nextWorkday = DateUtils.getNextWorkday(restDate, restDates, leaveDates);
          if (nextWorkday) {
            dayTasks.forEach(t => {
              t.scheduledDate = nextWorkday;
              t.updatedAt = DateUtils.nowISO();
            });
          }
        }
      }
    });

    State.set('tasks', tasks);
    State.persist('tasks');
  }

  // 获取所有有生效的休息日期（展开为具体日期列表）——带缓存
  let _restDatesCache = null;
  let _restDatesCacheKey = '';

  function getEffectiveRestDates() {
    // 用 today 和 restDays/leaves 长度做简单缓存键，避免同一天内反复重算
    const cacheKey = DateUtils.today() + '|' + getRestDays().filter(r => r.enabled).length + '|' + getLeaves().filter(l => !l.isRevoked).length;
    if (_restDatesCache && _restDatesCacheKey === cacheKey) return _restDatesCache;

    const restDays = getRestDays().filter(r => r.enabled);
    const dates = new Set();

    restDays.forEach(r => {
      if (r.type === 'weekly') {
        // 展开为未来90天的周期日期
        const today = DateUtils.today();
        for (let i = 0; i < 90; i++) {
          const d = DateUtils.addDays(today, i);
          if (r.dayOfWeek.includes(DateUtils.getDayOfWeek(d))) {
            dates.add(d);
          }
        }
      } else if (r.type === 'temporary' && r.startDate) {
        let d = r.startDate;
        const end = r.endDate || r.startDate;
        while (d <= end) {
          dates.add(d);
          d = DateUtils.addDays(d, 1);
        }
      }
    });

    _restDatesCacheKey = cacheKey;
    _restDatesCache = [...dates];
    return _restDatesCache;
  }

  // 获取所有有效的请假日期——带缓存
  let _leaveDatesCache = null;
  let _leaveDatesCacheKey = '';

  function getEffectiveLeaveDates() {
    const cacheKey = DateUtils.today() + '|' + getLeaves().filter(l => !l.isRevoked).length;
    if (_leaveDatesCache && _leaveDatesCacheKey === cacheKey) return _leaveDatesCache;

    const leaves = getLeaves().filter(l => !l.isRevoked);
    const dates = new Set();
    leaves.forEach(l => {
      let d = l.startDate;
      while (d <= l.endDate) {
        dates.add(d);
        d = DateUtils.addDays(d, 1);
      }
    });

    _leaveDatesCacheKey = cacheKey;
    _leaveDatesCache = [...dates];
    return _leaveDatesCache;
  }

  // 判断某日期是否为休息日或请假（使用 Set O(1) 查找）
  function isRestDay(dateStr) {
    const restSet = new Set(getEffectiveRestDates());
    const leaveSet = new Set(getEffectiveLeaveDates());
    return restSet.has(dateStr) || leaveSet.has(dateStr);
  }

  // 判断某日期是否为请假
  function isLeaveDate(dateStr) {
    return (new Set(getEffectiveLeaveDates())).has(dateStr);
  }

  // 获取日期类型
  function getDateType(dateStr) {
    if (isLeaveDate(dateStr)) return 'leave';
    if (getEffectiveRestDates().includes(dateStr)) return 'rest';
    return 'normal';
  }

  return {
    setWeeklyRestDays, getWeeklyRestDays,
    addTemporaryRest, removeTemporaryRest, cancelAllTemporaryRests,
    addLeave, revokeLeave,
    getEffectiveRestDates, getEffectiveLeaveDates,
    isRestDay, isLeaveDate, getDateType,
    getRestDays, getLeaves
  };
})();
