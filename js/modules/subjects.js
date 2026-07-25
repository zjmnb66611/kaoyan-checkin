/**
 * 科目管理模块
 */
const SubjectModule = (() => {
  function getAll() {
    return (State.get('subjects') || [])
      .filter(s => !s.deleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function getById(id) {
    return getAll().find(s => s.id === id);
  }

  function add(name, color) {
    const subjects = State.get('subjects');
    const trimmedName = (name || '').trim();
    if (!trimmedName || trimmedName.length > 30) {
      return { ok: false, msg: '科目名称长度应为 1-30 个字符' };
    }
    const colors = ['#E07B5A','#C0392B','#2980B9','#8E44AD','#16A085','#E67E22','#2C3E50','#D4A017'];
    const newSubject = {
      id: DateUtils.uuid(),
      name: trimmedName,
      color: Validate.isSafeColor(color) ? color : colors[subjects.length % colors.length],
      icon: 'fa-circle-thin',
      sortOrder: subjects.length,
      isPreset: false,
      createdAt: DateUtils.nowISO(),
      deleted: false
    };
    subjects.push(newSubject);
    State.set('subjects', subjects);
    State.persist('subjects');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true, subject: newSubject };
  }

  function rename(id, newName) {
    const subjects = State.get('subjects');
    const sub = subjects.find(s => s.id === id);
    if (!sub) return { ok: false, msg: '科目不存在' };
    const trimmedName = (newName || '').trim();
    if (!trimmedName || trimmedName.length > 30) return { ok: false, msg: '科目名称长度应为 1-30 个字符' };
    sub.name = trimmedName;
    State.set('subjects', subjects);
    State.persist('subjects');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function remove(id) {
    const subjects = State.get('subjects');
    const sub = subjects.find(s => s.id === id);
    if (!sub) return { ok: false, msg: '科目不存在' };
    if (sub.isPreset) return { ok: false, msg: '预置科目不可删除' };
    // 该科目的任务保留但清除 subjectId
    const tasks = State.get('tasks');
    tasks.forEach(t => { if (t.subjectId === id) t.subjectId = ''; });
    sub.deleted = true;
    State.set('subjects', subjects);
    State.set('tasks', tasks);
    State.persist('subjects');
    State.persist('tasks');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  function reorder(orderedIds) {
    const subjects = State.get('subjects');
    orderedIds.forEach((id, idx) => {
      const sub = subjects.find(s => s.id === id);
      if (sub) sub.sortOrder = idx;
    });
    State.set('subjects', subjects);
    State.persist('subjects');
    document.dispatchEvent(new CustomEvent('task:changed'));
    return { ok: true };
  }

  return { getAll, getById, add, rename, remove, reorder };
})();
