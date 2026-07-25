/**
 * 周期性重复任务模块
 */
const RecurringModule = (() => {
  function getRules() {
    return (State.get('recurringRules') || []).filter(r => !r.deleted);
  }

  function addRule({ subjectId, content, ruleType, weekDays, startDate }) {
    const trimmedContent = (content || '').trim();
    const normalizedWeekDays = [...new Set((weekDays || []).map(Number))]
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    if (!trimmedContent) return { ok: false, msg: '任务内容不能为空' };
    if (!Validate.isValidDate(startDate || DateUtils.today())) return { ok: false, msg: '开始日期无效' };
    if (ruleType === 'weekly' && normalizedWeekDays.length === 0) {
      return { ok: false, msg: '每周重复任务至少选择一天' };
    }
    const rules = State.get('recurringRules');
    const rule = {
      id: DateUtils.uuid(),
      subjectId: subjectId || '',
      content: trimmedContent,
      ruleType: ruleType === 'weekly' ? 'weekly' : 'daily',
      weekDays: normalizedWeekDays, // [0-6], only for weekly
      startDate: startDate || DateUtils.today(),
      enabled: true,
      createdAt: DateUtils.nowISO(),
      deleted: false
    };
    rules.push(rule);
    State.set('recurringRules', rules);
    State.persist('recurringRules');

    // 立即生成未来任务
    generateTasksForRule(rule);
    return { ok: true, rule };
  }

  function removeRule(id) {
    const rules = State.get('recurringRules');
    const rule = rules.find(r => r.id === id);
    if (!rule) return { ok: false };
    removeFutureTasksByRule(id);
    // 删除规则时同步清理该规则生成的未来未完成任务，避免留下无法管理的孤儿任务。
    rule.deleted = true;
    State.set('recurringRules', rules);
    State.persist('recurringRules');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function toggleRule(id) {
    const rules = State.get('recurringRules');
    const rule = rules.find(r => r.id === id);
    if (!rule) return { ok: false };
    rule.enabled = !rule.enabled;
    State.set('recurringRules', rules);
    State.persist('recurringRules');

    if (rule.enabled) {
      // 删除该规则已生成的未来未完成任务，重新生成
      removeFutureTasksByRule(id);
      generateTasksForRule(rule);
    } else {
      removeFutureTasksByRule(id);
    }
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function updateRule(id, updates) {
    const rules = State.get('recurringRules');
    const rule = rules.find(item => item.id === id && !item.deleted);
    if (!rule) return { ok: false, msg: '重复任务不存在' };
    const content = (updates.content || '').trim();
    if (!content) return { ok: false, msg: '任务内容不能为空' };
    if (updates.startDate && !Validate.isValidDate(updates.startDate)) {
      return { ok: false, msg: '开始日期无效' };
    }
    if (updates.ruleType === 'weekly' && (!updates.weekDays || updates.weekDays.length === 0)) {
      return { ok: false, msg: '每周重复任务至少选择一天' };
    }

    rule.subjectId = updates.subjectId || '';
    rule.content = content;
    rule.ruleType = updates.ruleType === 'weekly' ? 'weekly' : 'daily';
    rule.weekDays = [...new Set((updates.weekDays || []).map(Number))]
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    rule.startDate = updates.startDate || rule.startDate;
    rule.updatedAt = DateUtils.nowISO();
    State.set('recurringRules', rules);
    State.persist('recurringRules');

    removeFutureTasksByRule(id);
    generateTasksForRule(rule);
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, rule };
  }

  // 为一条规则生成截至考研日期的任务
  function generateTasksForRule(rule) {
    if (!rule.enabled) return;

    const today = DateUtils.today();
    const startFrom = rule.startDate > today ? rule.startDate : today;
    const examDate = State.get('settings').examDate;
    const endDate = examDate && examDate >= today ? examDate : DateUtils.addDays(today, 90);
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());
    const allOff = new Set([...restDates, ...leaveDates]);

    const taskList = [];
    let d = startFrom;
    while (d <= endDate) {
      // 跳过休息日和请假
      if (allOff.has(d)) {
        d = DateUtils.addDays(d, 1);
        continue;
      }

      const dow = DateUtils.getDayOfWeek(d);
      let shouldCreate = false;

      if (rule.ruleType === 'daily') {
        shouldCreate = true;
      } else if (rule.ruleType === 'weekly' && rule.weekDays.includes(dow)) {
        shouldCreate = true;
      }

      if (shouldCreate) {
        taskList.push({
          subjectId: rule.subjectId,
          content: rule.content,
          scheduledDate: d,
          source: 'recurring',
          recurringRuleId: rule.id
        });
      }

      d = DateUtils.addDays(d, 1);
    }

    if (taskList.length > 0) {
      TaskModule.addTaskBatch(taskList);
    }
  }

  // 删除某规则生成的未来未完成任务
  function removeFutureTasksByRule(ruleId) {
    const tasks = State.get('tasks') || [];
    const today = DateUtils.today();
    let changed = false;

    tasks.forEach(t => {
      if (t.recurringRuleId === ruleId && t.scheduledDate >= today && t.status === 'pending' && !t.deleted) {
        t.deleted = true;
        t.updatedAt = DateUtils.nowISO();
        changed = true;
      }
    });

    if (changed) {
      State.set('tasks', tasks);
      State.persist('tasks');
    }
  }

  // 每日自动刷新（确保未来任务已生成）
  function dailyRefresh() {
    const rules = getRules().filter(r => r.enabled);
    const today = DateUtils.today();
    const examDate = State.get('settings').examDate;
    const endDate = examDate && examDate >= today ? examDate : DateUtils.addDays(today, 90);
    const restDates = new Set(RestModule.getEffectiveRestDates());
    const leaveDates = new Set(RestModule.getEffectiveLeaveDates());
    const allOff = new Set([...restDates, ...leaveDates]);

    rules.forEach(rule => {
      // 尊重规则的 startDate，不从未来日期提前生成
      const startFrom = rule.startDate > today ? rule.startDate : today;

      const existingDates = new Set(
        TaskModule.getTasks()
          .filter(t => t.recurringRuleId === rule.id && !t.deleted)
          .map(t => t.scheduledDate)
      );

      const taskList = [];
      let d = startFrom;
      while (d <= endDate) {
        if (!allOff.has(d) && !existingDates.has(d)) {
          const dow = DateUtils.getDayOfWeek(d);
          let shouldCreate = rule.ruleType === 'daily' || (rule.ruleType === 'weekly' && rule.weekDays.includes(dow));
          if (shouldCreate) {
            taskList.push({
              subjectId: rule.subjectId,
              content: rule.content,
              scheduledDate: d,
              source: 'recurring',
              recurringRuleId: rule.id
            });
          }
        }
        d = DateUtils.addDays(d, 1);
      }

      if (taskList.length > 0) {
        TaskModule.addTaskBatch(taskList);
      }
    });
  }

  function refresh() {
    const today = DateUtils.today();
    const examDate = State.get('settings').examDate;
    const endDate = examDate && examDate >= today ? examDate : DateUtils.addDays(today, 90);
    const tasks = State.get('tasks') || [];
    let changed = false;
    tasks.forEach(task => {
      if (task.recurringRuleId && task.scheduledDate > endDate &&
          task.scheduledDate >= today && task.status === 'pending' && !task.deleted) {
        task.deleted = true;
        task.updatedAt = DateUtils.nowISO();
        changed = true;
      }
    });
    if (changed) {
      State.set('tasks', tasks);
      State.persist('tasks');
    }
    dailyRefresh();
  }

  return { getRules, addRule, updateRule, removeRule, toggleRule, dailyRefresh, refresh };
})();
