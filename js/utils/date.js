/**
 * 日期工具函数 - 纯函数集合
 */
const DateUtils = {
  // 格式化日期为 YYYY-MM-DD
  formatDate(d) {
    const dt = new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // 今天 YYYY-MM-DD
  today() { return this.formatDate(new Date()); },

  // ISO 时间戳
  nowISO() { return new Date().toISOString(); },

  // 日期差（天）
  diffDays(a, b) {
    return Math.round((new Date(a) - new Date(b)) / 86400000);
  },

  // 日期加减天数
  addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return this.formatDate(d);
  },

  // 获取星期几 0=周日 1-6=周一至周六
  getDayOfWeek(dateStr) { return new Date(dateStr).getDay(); },

  // 获取日期中文星期
  getDayName(dateStr) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][this.getDayOfWeek(dateStr)];
  },

  // 获取本周范围（周一至周日）
  getWeekRange(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: this.formatDate(monday), end: this.formatDate(sunday) };
  },

  // 获取本月范围
  getMonthRange(dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: this.formatDate(start), end: this.formatDate(end) };
  },

  // 获取月份的所有日期
  getMonthDays(year, month) {
    const days = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // 填充前面的空白
    const startDow = firstDay.getDay();
    for (let i = 0; i < startDow; i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(this.formatDate(new Date(year, month, d)));
    }
    return { days, year, month, startDow };
  },

  // 获取周的日期列表
  getWeekDays(dateStr) {
    const { start } = this.getWeekRange(dateStr);
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(this.addDays(start, i));
    }
    return days;
  },

  // 判断是否为今天
  isToday(dateStr) { return dateStr === this.today(); },

  // 判断是否已过期
  isPast(dateStr) { return dateStr < this.today(); },

  // 日期比较
  compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; },

  // 生成 UUID v4
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // CSS 变量格式的暖色日期
  getMonthName(m) {
    return `${m + 1}月`;
  },

  // 获取中文月份
  getFullMonthName(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  },

  // 判断日期是否在范围内
  inRange(dateStr, start, end) {
    return dateStr >= start && dateStr <= end;
  },

  // 下一个工作日（跳过休息日和请假日期）
  getNextWorkday(dateStr, restDates, leaveDates) {
    let next = dateStr;
    const allOff = new Set([...restDates, ...leaveDates]);
    for (let i = 0; i < 365; i++) {
      next = this.addDays(next, 1);
      if (!allOff.has(next)) return next;
    }
    return null;
  }
};
