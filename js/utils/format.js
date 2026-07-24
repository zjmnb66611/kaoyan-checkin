/**
 * 格式化工具函数
 */
const Format = {
  percent(v, total) {
    if (!total || total === 0) return '0%';
    return Math.round((v / total) * 100) + '%';
  },

  truncate(str, len = 50) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  },

  isoToDisplay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },

  number(n) {
    return n.toLocaleString('zh-CN');
  },

  taskCount(n) {
    return `${n} 个任务`;
  }
};
