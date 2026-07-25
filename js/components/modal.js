/**
 * Toast + Modal 组件
 */

// ─── Toast ───
const Toast = {
  show(msg, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container') || (() => {
      const c = DOM.create('div', { id: 'toast-container', className: 'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2' });
      document.body.appendChild(c);
      return c;
    })();

    const colors = {
      success: 'bg-emerald-500',
      error: 'bg-orange-500',
      info: 'bg-stone-700',
      warning: 'bg-amber-500'
    };

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle'
    };

    const toast = DOM.create('div', {
      className: `toast-item ${colors[type]} text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium`,
      style: { opacity: '0', transform: 'translateY(-20px)', transition: 'all 0.3s ease' }
    }, [
      DOM.create('i', { className: `fa ${icons[type]}` }),
      DOM.create('span', { textContent: msg })
    ]);

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => DOM.remove(toast), 300);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); },
  warning(msg) { this.show(msg, 'warning'); }
};

// ─── Modal ───
const Modal = {
  show({ title, body, bodyHTML, confirmText = '确定', cancelText = '取消', onConfirm, onCancel, showCancel = true, type = 'default' }) {
    this.close();

    const overlay = DOM.create('div', {
      id: 'modal-overlay',
      className: 'fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[9998]',
      style: { animation: 'fadeIn 0.25s ease' }
    });

    const typeStyles = type === 'motivation'
      ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
      : 'bg-white';

    const content = DOM.create('div', {
      className: `rounded-2xl shadow-xl max-w-md w-[90%] p-6 border ${typeStyles}`,
      style: { animation: 'modalSlideIn 0.3s ease' }
    });

    // 标题
    if (title) {
      content.appendChild(DOM.create('h3', {
        className: 'text-lg font-bold text-stone-800 mb-3 text-center',
        textContent: title
      }));
    }

    // 内容
    if (bodyHTML) {
      content.appendChild(DOM.create('div', { className: 'mb-5 text-stone-600 text-sm', innerHTML: bodyHTML }));
    } else if (body) {
      content.appendChild(DOM.create('p', { className: 'mb-5 text-stone-600 text-sm text-center', textContent: body }));
    }

    // 按钮区
    const btnGroup = DOM.create('div', { className: 'flex gap-3 justify-center' });

    if (showCancel) {
      const cancelBtn = DOM.create('button', {
        className: 'px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 transition-all duration-200 active:scale-95',
        textContent: cancelText,
        onClick: () => {
          if (onCancel) onCancel();
          this.close();
        }
      });
      btnGroup.appendChild(cancelBtn);
    }

    const confirmBtn = DOM.create('button', {
      className: `px-5 py-2.5 rounded-xl text-white text-sm font-medium transition-all duration-200 active:scale-95 ${type === 'motivation' ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600' : 'bg-amber-600 hover:bg-amber-700'}`,
      textContent: confirmText,
      onClick: () => {
        // 回调返回 false 表示校验未通过，保留弹窗让用户修正输入。
        const result = onConfirm ? onConfirm() : undefined;
        if (result !== false) this.close();
      }
    });
    btnGroup.appendChild(confirmBtn);

    content.appendChild(btnGroup);
    overlay.appendChild(content);

    // 点击背景关闭
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        if (onCancel) onCancel();
        this.close();
      }
    });

    document.body.appendChild(overlay);
  },

  close() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => DOM.remove(overlay), 200);
    }
  },

  // 特殊类型
  motivation(onConfirm) {
    const messages = [
      '每一次坚持，都在靠近理想的彼岸。加油，考研人！💪',
      '今天的努力，是明天考场的底气。继续冲！🔥',
      '日拱一卒，功不唐捐。你离上岸又近了一步！📚',
      '所有逆袭，都是有备而来。今天任务全清，你真棒！⭐',
      '考研是一场马拉松，你已经跑赢了今天的自己！🏃'
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];

    // 播放打勾动画
    this.show({
      title: '🎉 今日任务全部完成！',
      bodyHTML: `
        <div class="text-center">
          <div class="text-5xl mb-4" style="animation: checkBounce 0.6s ease">✅</div>
          <p class="text-stone-700 font-medium">${msg}</p>
          <p class="text-stone-400 text-xs mt-3">累计打卡 ${State.get('checkinStats').totalDays} 天 | 连续 ${State.get('checkinStats').consecutiveDays} 天</p>
        </div>
      `,
      confirmText: '继续加油',
      showCancel: false,
      type: 'motivation',
      onConfirm
    });
  },

  breakWarning(onConfirm) {
    this.show({
      title: '⏰ 断卡提醒',
      bodyHTML: `
        <div class="text-center">
          <div class="text-4xl mb-3">📋</div>
          <p class="text-stone-700">今天还没有打卡记录哦～</p>
          <p class="text-stone-400 text-xs mt-2">保持连续打卡，养成好习惯！</p>
        </div>
      `,
      confirmText: '去打卡',
      showCancel: true,
      cancelText: '稍后提醒',
      onConfirm,
      onCancel: () => {}
    });
  },

  confirm({ title, body, onConfirm, confirmText = '确认', cancelText = '取消' }) {
    this.show({ title, body, onConfirm, confirmText, cancelText, showCancel: true });
  }
};
