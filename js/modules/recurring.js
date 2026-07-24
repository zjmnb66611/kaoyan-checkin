/**
 * 周期性重复任务模块
 */
const RecurringModule = (() => {
  function getRules() {
    return (State.get('recurringRules') || []).filter(r => !r.deleted);
  }

  function addRule({ subjectId, content, ruleType, weekDays, startDate }) {
    const rules = State.get('recurringRules');
    const rule = {
      id: DateUtils.uuid(),
      subjectId: subjectId || '',
      content: content.trim(),
      ruleType, // 'daily' | 'weekly'
      weekDays: weekDays || [], // [0-6], only for weekly
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

  // 为一条规则生成未来 90 天的任务
  function generateTasksForRule(rule) {
    if (!rule.enabled) return;

    const today = DateUtils.today();
    const startFrom = rule.startDate > today ? rule.startDate : today;
    const endDate = DateUtils.addDays(today, 90);
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
    const tasks = TaskModule.getTasks();
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
    rules.forEach(rule => {
      // 检查规则未来是否有需要生成的日期
      const today = DateUtils.today();
      const endDate = DateUtils.addDays(today, 90);
      const restDates = new Set(RestModule.getEffectiveRestDates());
      const leaveDates = new Set(RestModule.getEffectiveLeaveDates());
      const allOff = new Set([...restDates, ...leaveDates]);

      const existingDates = new Set(
        TaskModule.getTasks()
          .filter(t => t.recurringRuleId === rule.id && !t.deleted)
          .map(t => t.scheduledDate)
      );

      const taskList = [];
      let d = today;
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

  return { getRules, addRule, removeRule, toggleRule, dailyRefresh };
})();
