/**
 * 任务管理模块
 */
const TaskModule = (() => {
  // 底层读取（不过滤 deleted），仅用于需要修改 state 的场景
  function _getRaw() { return State.get('tasks'); }
  // 公开读取（过滤 deleted），用于 UI 渲染
  function getTasks() { return State.get('tasks').filter(t => !t.deleted); }

  function getTaskById(id) { return getTasks().find(t => t.id === id); }

  function getTasksByDate(date) {
    return getTasks().filter(t => t.scheduledDate === date);
  }

  function getTasksBySubject(subjectId) {
    return getTasks().filter(t => t.subjectId === subjectId);
  }

  function normalizeScheduledDate(date) {
    if (!Validate.isValidDate(date)) return null;
    // 手动创建、导入和迁移任务时，用户明确选择的日期优先。
    // 休息日只在设置休息日时顺延已有任务，避免“添加今日任务”被静默移到未来日期。
    return date;
  }

  function addTask({ subjectId, content, scheduledDate, source = 'manual', recurringRuleId = null }) {
    if (!Validate.isValidTask(content)) return { ok: false, msg: '任务内容不能为空' };

    const requestedDate = scheduledDate || DateUtils.today();
    const normalizedDate = normalizeScheduledDate(requestedDate);
    if (!normalizedDate) return { ok: false, msg: '任务日期无效' };

    const task = {
      id: DateUtils.uuid(),
      subjectId: subjectId || '',
      content: content.trim(),
      scheduledDate: normalizedDate,
      originalDate: requestedDate,
      isUserScheduledOnOffDay: source === 'manual' && RestModule.isRestDay(normalizedDate),
      status: 'pending',
      checkinNote: '',
      isCheckinBackfill: false,
      source,
      recurringRuleId,
      createdAt: DateUtils.nowISO(),
      updatedAt: DateUtils.nowISO(),
      deleted: false
    };

    const tasks = _getRaw();
    tasks.push(task);
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, task };
  }

  function addTaskBatch(taskList) {
    const tasks = _getRaw();
    let added = 0;
    taskList.forEach(item => {
      const requestedDate = item.scheduledDate || DateUtils.today();
      const normalizedDate = normalizeScheduledDate(requestedDate);
      if (Validate.isValidTask(item.content) && normalizedDate) {
        tasks.push({
          id: DateUtils.uuid(),
          subjectId: item.subjectId || '',
          content: item.content.trim(),
          scheduledDate: normalizedDate,
          originalDate: requestedDate,
          isUserScheduledOnOffDay: (item.source || 'manual') === 'manual' && RestModule.isRestDay(normalizedDate),
          status: 'pending',
          checkinNote: '',
          isCheckinBackfill: false,
          source: item.source || 'manual',
          recurringRuleId: item.recurringRuleId || null,
          createdAt: DateUtils.nowISO(),
          updatedAt: DateUtils.nowISO(),
          deleted: false
        });
        added++;
      }
    });
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, added };
  }

  function updateTask(id, updates) {
    const tasks = _getRaw();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, msg: '任务不存在' };
    // 防止意外覆盖 id
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'content')) {
      if (!Validate.isValidTask(safeUpdates.content)) {
        return { ok: false, msg: '任务内容应为 1-500 个字符' };
      }
      safeUpdates.content = safeUpdates.content.trim();
    }
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'checkinNote')) {
      if (typeof safeUpdates.checkinNote !== 'string' || safeUpdates.checkinNote.length > 500) {
        return { ok: false, msg: '打卡备注应少于 500 个字符' };
      }
      safeUpdates.checkinNote = safeUpdates.checkinNote.trim();
    }
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'status') && !['pending', 'completed'].includes(safeUpdates.status)) {
      return { ok: false, msg: '任务状态无效' };
    }
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'scheduledDate')) {
      const normalizedDate = normalizeScheduledDate(safeUpdates.scheduledDate);
      if (!normalizedDate) return { ok: false, msg: '任务日期无效' };
      safeUpdates.scheduledDate = normalizedDate;
      safeUpdates.isUserScheduledOnOffDay = RestModule.isRestDay(normalizedDate);
    }
    tasks[idx] = { ...tasks[idx], ...safeUpdates, updatedAt: DateUtils.nowISO() };
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, task: tasks[idx] };
  }

  function deleteTask(id) {
    const tasks = _getRaw();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, msg: '任务不存在' };
    tasks[idx].deleted = true;
    tasks[idx].updatedAt = DateUtils.nowISO();
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function batchDelete(ids) {
    const tasks = _getRaw();
    ids.forEach(id => {
      const t = tasks.find(t => t.id === id);
      if (t) { t.deleted = true; t.updatedAt = DateUtils.nowISO(); }
    });
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function batchComplete(ids) {
    const tasks = _getRaw();
    ids.forEach(id => {
      const t = tasks.find(t => t.id === id);
      if (t) { t.status = 'completed'; t.updatedAt = DateUtils.nowISO(); }
    });
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function batchMigrate(ids, targetDate) {
    const normalizedDate = normalizeScheduledDate(targetDate);
    if (!normalizedDate) return { ok: false, msg: '目标日期无效' };
    const tasks = _getRaw();
    ids.forEach(id => {
      const t = tasks.find(t => t.id === id);
      if (t) {
        t.scheduledDate = normalizedDate;
        t.isUserScheduledOnOffDay = RestModule.isRestDay(normalizedDate);
        t.updatedAt = DateUtils.nowISO();
      }
    });
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, targetDate: normalizedDate };
  }

  function batchChangeSubject(ids, subjectId) {
    const tasks = _getRaw();
    ids.forEach(id => {
      const t = tasks.find(t => t.id === id);
      if (t) { t.subjectId = subjectId; t.updatedAt = DateUtils.nowISO(); }
    });
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  // 某日有未完成任务时，只将对应科目的后续待完成计划后移一天。
  // 未指定科目的任务视为同一个独立分组，不影响其他已分类科目。
  // 使用日期标记保证同一遗漏日期只处理一次，避免重复刷新持续后移。
  function postponeUncompletedTasks(dateStr) {
    const settings = State.get('settings');
    if (!settings.autoPostpone) return;

    const tasks = _getRaw();
    const overdueDate = dateStr || DateUtils.addDays(DateUtils.today(), -1);
    const overdueSubjectIds = new Set(
      tasks
        .filter(task => task.scheduledDate === overdueDate && task.status === 'pending' && !task.deleted)
        .map(task => task.subjectId || '')
    );
    if (overdueSubjectIds.size === 0) return;

    let changed = false;
    tasks
      .filter(task => task.scheduledDate >= overdueDate && task.status === 'pending' && !task.deleted)
      .filter(task => overdueSubjectIds.has(task.subjectId || ''))
      .filter(task => !(task.postponedByAutoPostponeDates || []).includes(overdueDate))
      .forEach(task => {
        task.scheduledDate = DateUtils.addDays(task.scheduledDate, 1);
        task.postponedByAutoPostponeDates = [
          ...new Set([...(task.postponedByAutoPostponeDates || []), overdueDate])
        ];
        task.updatedAt = DateUtils.nowISO();
        changed = true;
    });

    if (changed) {
      State.set('tasks', tasks);
      State.persist('tasks');
      document.dispatchEvent(new CustomEvent('task:changed'));
    }
  }

  // 获取所有唯一的日期（用于日历标记）
  function getAllDatesWithTasks() {
    const tasks = getTasks();
    const dates = new Set();
    tasks.forEach(t => dates.add(t.scheduledDate));
    return [...dates];
  }

  // 搜索任务
  function searchTasks(query) {
    if (!query || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();
    return getTasks().filter(t =>
      t.content.toLowerCase().includes(q) ||
      (t.checkinNote && t.checkinNote.toLowerCase().includes(q))
    );
  }

  return {
    getTasks, getTaskById, getTasksByDate, getTasksBySubject,
    addTask, addTaskBatch,
    updateTask, deleteTask,
    batchDelete, batchComplete, batchMigrate, batchChangeSubject,
    postponeUncompletedTasks, getAllDatesWithTasks, searchTasks
  };
})();
