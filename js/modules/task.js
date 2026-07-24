/**
 * 任务管理模块
 */
const TaskModule = (() => {
  function getTasks() { return State.get('tasks').filter(t => !t.deleted); }

  function getTaskById(id) { return getTasks().find(t => t.id === id); }

  function getTasksByDate(date) {
    return getTasks().filter(t => t.scheduledDate === date);
  }

  function getTasksBySubject(subjectId) {
    return getTasks().filter(t => t.subjectId === subjectId);
  }

  function addTask({ subjectId, content, scheduledDate, source = 'manual', recurringRuleId = null }) {
    if (!Validate.isValidTask(content)) return { ok: false, msg: '任务内容不能为空' };

    const task = {
      id: DateUtils.uuid(),
      subjectId: subjectId || '',
      content: content.trim(),
      scheduledDate: scheduledDate || DateUtils.today(),
      originalDate: scheduledDate || DateUtils.today(),
      status: 'pending',
      checkinNote: '',
      isCheckinBackfill: false,
      source,
      recurringRuleId,
      createdAt: DateUtils.nowISO(),
      updatedAt: DateUtils.nowISO(),
      deleted: false
    };

    const tasks = getTasks();
    tasks.push(task);
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, task };
  }

  function addTaskBatch(taskList) {
    const tasks = getTasks();
    let added = 0;
    taskList.forEach(item => {
      if (Validate.isValidTask(item.content)) {
        tasks.push({
          id: DateUtils.uuid(),
          subjectId: item.subjectId || '',
          content: item.content.trim(),
          scheduledDate: item.scheduledDate || DateUtils.today(),
          originalDate: item.scheduledDate || DateUtils.today(),
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
    const tasks = getTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, msg: '任务不存在' };
    tasks[idx] = { ...tasks[idx], ...updates, updatedAt: DateUtils.nowISO() };
    State.set('tasks', tasks);
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, task: tasks[idx] };
  }

  function deleteTask(id) {
    const tasks = getTasks();
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
    const tasks = getTasks();
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
    ids.forEach(id => updateTask(id, { status: 'completed' }));
    return { ok: true };
  }

  function batchMigrate(ids, targetDate) {
    ids.forEach(id => updateTask(id, { scheduledDate: targetDate }));
    return { ok: true };
  }

  function batchChangeSubject(ids, subjectId) {
    ids.forEach(id => updateTask(id, { subjectId }));
    return { ok: true };
  }

  // 当日未完成任务自动顺延
  function postponeUncompletedTasks(dateStr) {
    const settings = State.get('settings');
    if (!settings.autoPostpone) return;

    const tasks = getTasks();
    const today = dateStr || DateUtils.today();
    const restDates = RestModule.getEffectiveRestDates();
    const leaveDates = RestModule.getEffectiveLeaveDates();
    const nextWorkday = DateUtils.getNextWorkday(today, restDates, leaveDates);
    if (!nextWorkday) return;

    const uncompleted = tasks.filter(t => t.scheduledDate === today && t.status === 'pending' && !t.deleted);
    let changed = false;
    uncompleted.forEach(t => {
      t.scheduledDate = nextWorkday;
      t.updatedAt = DateUtils.nowISO();
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
