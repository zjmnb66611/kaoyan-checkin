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
    const finalEndDate = endDate || startDate;
    if (!Validate.isValidDate(startDate) || !Validate.isValidDate(finalEndDate) || startDate > finalEndDate) {
      return { ok: false, msg: '日期范围无效' };
    }
    const restDays = getRestDays();
    restDays.push({
      id: DateUtils.uuid(),
      type: 'temporary',
      startDate,
      endDate: finalEndDate,
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
    if (!Validate.isValidDate(startDate) || !Validate.isValidDate(endDate) || startDate > endDate) {
      return { ok: false, msg: '日期范围无效' };
    }
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
    _invalidateCaches();

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
      const tasks = State.get('tasks') || [];
      const leaveDates = [];
      let restoreDate = leave.startDate;
      while (restoreDate <= leave.endDate) {
        leaveDates.push(restoreDate);
        restoreDate = DateUtils.addDays(restoreDate, 1);
      }

      // 只撤回本次请假独有的顺延。若同一天仍被其他休息日或请假覆盖，
      // 该日期的顺延仍应保留，避免撤销一条记录影响另一条有效规则。
      const activeOffDates = new Set([
        ...getEffectiveRestDates(),
        ...getEffectiveLeaveDates()
      ]);
      const reversibleDates = new Set(leaveDates.filter(date => !activeOffDates.has(date)));

      tasks.forEach(task => {
        if (task.deleted || task.status !== 'pending' || reversibleDates.size === 0) return;
        const markers = task.postponedByOffDates || [];
        const reversedCount = markers.filter(date => reversibleDates.has(date)).length;
        if (reversedCount === 0) return;

        task.scheduledDate = DateUtils.addDays(task.scheduledDate, -reversedCount);
        task.postponedByOffDates = markers.filter(date => !reversibleDates.has(date));
        task.updatedAt = DateUtils.nowISO();
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

  // 每个休息/请假日期只应用一次，避免页面刷新或重复设置导致任务不断后移。
  function shiftPendingTasksForOffDates(tasks, offDates) {
    const dates = [...new Set(offDates)]
      .filter(date => date >= DateUtils.today())
      .sort();
    let changed = false;

    dates.forEach(offDate => {
      tasks
        .filter(task => task.scheduledDate >= offDate && task.status === 'pending' && !task.deleted)
        .filter(task => !(task.postponedByOffDates || []).includes(offDate))
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.createdAt.localeCompare(b.createdAt))
        .forEach(task => {
          task.scheduledDate = DateUtils.addDays(task.scheduledDate, 1);
          task.postponedByOffDates = [...new Set([...(task.postponedByOffDates || []), offDate])];
          task.updatedAt = DateUtils.nowISO();
          changed = true;
        });
    });

    return changed;
  }

  function applyActiveOffDayPostponement() {
    const tasks = State.get('tasks') || [];
    const offDates = [...new Set([
      ...getEffectiveRestDates(),
      ...getEffectiveLeaveDates()
    ])];
    const changed = shiftPendingTasksForOffDates(tasks, offDates);
    if (changed) {
      State.set('tasks', tasks);
      State.persist('tasks');
    }
    return { ok: true, changed };
  }

  // 请假和休息日共用同一条级联顺延规则，保证后续计划不会堆叠到同一天。
  function postponeTasksForLeave(startDate, endDate, leaveRecord) {
    applyActiveOffDayPostponement();
    if (leaveRecord) {
      const tasks = State.get('tasks') || [];
      leaveRecord.taskSnapshots.forEach(snapshot => {
        const task = tasks.find(item => item.id === snapshot.taskId);
        if (task) snapshot.newDate = task.scheduledDate;
      });
      const leaves = getLeaves();
      State.set('leaves', leaves);
      State.persist('leaves');
    }
  }

  function applyRestDayPostponement() {
    applyActiveOffDayPostponement();
  }

  // 获取所有有生效的休息日期（展开为具体日期列表）——带缓存
  let _restDatesCache = null;
  let _restDatesCacheKey = '';

  function getEffectiveRestDates(startDate, endDate) {
    const today = DateUtils.today();
    const settings = State.get('settings');
    const from = startDate || DateUtils.addDays(today, -370);
    const defaultEnd = settings.examDate && settings.examDate >= today
      ? settings.examDate
      : DateUtils.addDays(today, 365);
    const to = endDate || defaultEnd;
    // 用 today 和 restDays/leaves 长度做简单缓存键，避免同一天内反复重算
    const cacheKey = from + '|' + to + '|' + getRestDays().filter(r => r.enabled).length + '|' + getLeaves().filter(l => !l.isRevoked).length;
    if (_restDatesCache && _restDatesCacheKey === cacheKey) return _restDatesCache;

    const restDays = getRestDays().filter(r => r.enabled);
    const dates = new Set();

    restDays.forEach(r => {
      if (r.type === 'weekly') {
        // 展开为未来90天的周期日期
        let d = from;
        while (d <= to) {
          if (r.dayOfWeek.includes(DateUtils.getDayOfWeek(d))) {
            dates.add(d);
          }
          d = DateUtils.addDays(d, 1);
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
    getRestDays, getLeaves,
    applyPostponement: applyActiveOffDayPostponement
  };
})();
