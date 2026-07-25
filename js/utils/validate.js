/**
 * 数据校验工具
 */
const Validate = {
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  isValidDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [year, month, day] = str.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  },

  isValidTask(content) {
    return content && content.trim().length > 0 && content.trim().length <= 500;
  },

  isSafeColor(color) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color || '');
  },

  sanitize(str) {
    if (!str) return '';
    return str.replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
  },

  sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
