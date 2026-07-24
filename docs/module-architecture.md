# 阶段五：功能模块

> 模块划分、模块职责、模块依赖关系

---

## 一、模块总览

```
kaoyan-checkin/
├── app.js           —— 应用入口，初始化所有模块
├── router.js        —— hash 路由，页面/视图切换
├── state.js         —— 全局状态管理 (Observer 模式)
├── storage.js       —— LocalStorage + IndexedDB 封装
├── sync.js          —— 云端同步引擎
├── auth.js          —— 认证模块
├── modules/
│   ├── task.js      —— 任务 CRUD + 批量操作 + 顺延逻辑
│   ├── checkin.js   —— 打卡 + 补卡 + 备注 + 激励弹窗
│   ├── review.js    —— 周/月度复盘统计
│   ├── calendar.js  —— 日历视图渲染 + 交互
│   ├── subjects.js  —— 科目管理
│   ├── rest.js      —— 休息日 + 请假逻辑
│   └── settings.js  —— 设置读写
├── components/
│   ├── modal.js     —— 通用弹窗
│   ├── toast.js     —— Toast 提醒
│   ├── task-card.js —— 任务卡片渲染
│   ├── countdown.js —— 倒计时组件
│   └── progress.js  —— 进度条组件
└── utils/
    ├── date.js      —— 日期计算工具
    ├── dom.js       —— DOM 操作工具
    ├── format.js    —— 格式化工具
    └── validate.js  —— 数据校验工具
```

---

## 二、模块职责

### 2.1 核心层

| 模块 | 单一职责 | 对外暴露 |
|------|----------|----------|
| `app.js` | 应用启动、模块初始化、全局错误处理 | `App.init()` |
| `router.js` | 管理 hash 路由、页面容器渲染 | `Router.navigate()`, `Router.onChange()` |
| `state.js` | 全局状态树、订阅/发布通知 | `State.get()`, `State.set()`, `State.subscribe()` |
| `storage.js` | 本地持久化、读写封装 | `Storage.save()`, `Storage.load()`, `Storage.clear()` |
| `sync.js` | 云端上传/下载、冲突解决 | `Sync.upload()`, `Sync.download()`, `Sync.merge()` |
| `auth.js` | 注册/登录/登出/会话管理 | `Auth.login()`, `Auth.logout()`, `Auth.getUser()` |

### 2.2 业务模块

| 模块 | 单一职责 | 核心方法 |
|------|----------|----------|
| `task.js` | 任务全生命周期管理 | `add()`, `update()`, `remove()`, `batchDelete()`, `batchComplete()`, `batchMigrate()`, `batchChangeSubject()`, `getByDate()`, `postponeUncompleted()` |
| `checkin.js` | 打卡操作与激励 | `toggle()`, `addNote()`, `backfill()`, `checkDailyCompletion()`, `showMotivation()`, `checkBreakWarning()` |
| `review.js` | 周/月统计与复盘 | `weeklyReport()`, `monthlyReport()`, `getCompletionRate()`, `getSubjectProgress()` |
| `calendar.js` | 日历视图渲染 | `renderMonth()`, `renderWeek()`, `getDateTasks()`, `getDateStatus()` |
| `subjects.js` | 科目 CRUD | `getAll()`, `add()`, `rename()`, `remove()`, `reorder()` |
| `rest.js` | 休息日+请假 | `addWeeklyRest()`, `addTemporaryRest()`, `addLeave()`, `revokeLeave()`, `isRestDay()`, `getNextWorkday()` |
| `settings.js` | 设置读写 | `get()`, `update()`, `resetAll()` |

### 2.3 UI 组件

| 组件 | 职责 | 参数 |
|------|------|------|
| `modal.js` | 通用弹窗：确认/表单/激励/预警 | `Modal.show({title, body, onConfirm, onCancel})` |
| `toast.js` | Toast 提示：成功/失败/警告，3秒消失 | `Toast.success(msg)`, `Toast.error(msg)` |
| `task-card.js` | 任务卡片 DOM 生成 + 勾选/长按事件 | `TaskCard.render(task, options)` |
| `countdown.js` | 考研倒计时渲染 + 折叠 | `Countdown.render(examDate)` |
| `progress.js` | 进度条/环图渲染 | `Progress.bar(value)`, `Progress.subjectRing(data)` |

### 2.4 工具函数（纯函数，无状态）

| 工具 | 职责 |
|------|------|
| `date.js` | `formatDate()`, `diffDays()`, `getWeekRange()`, `isToday()`, `addDays()`, `getDayOfWeek()` |
| `dom.js` | `$`, `$$`, `createElement()`, `addClass()`, `toggleClass()` |
| `format.js` | `percent()`, `truncate()`, `isoToDisplay()` |
| `validate.js` | `isValidEmail()`, `isValidDate()`, `isValidTask()`, `sanitize()` |

---

## 三、模块依赖关系图

```
                    ┌─────────┐
                    │ app.js  │ 入口
                    └────┬────┘
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌───────┐ ┌──────────┐
         │ router │ │ state │ │  auth    │
         └───┬────┘ └───┬───┘ └────┬─────┘
              │          │          │
    ┌─────────┼──────────┼──────────┼──────────┐
    │         │          │          │          │
    ▼         ▼          ▼          ▼          ▼
┌───────┐ ┌──────┐ ┌─────────┐ ┌──────┐ ┌────────┐
│views  │ │storage│ │modules/ │ │sync  │ │utils/  │
│(渲染) │ │      │ │task.js  │ │      │ │date.js │
│       │ │      │ │checkin  │ │      │ │dom.js  │
│       │ │      │ │review   │ │      │ │format  │
│       │ │      │ │calendar │ │      │ │validate│
│       │ │      │ │subjects │ │      │ └────────┘
│       │ │      │ │rest.js  │ │      │
│       │ │      │ └─────────┘ │      │
│       │ │      │              │      │
└───────┘ └──────┘              └──────┘
     │          │
     └──────────┤
                ▼
         ┌──────────────┐
         │ components/  │
         │ modal.js     │
         │ toast.js     │
         │ task-card.js │
         │ countdown.js │
         │ progress.js  │
         └──────────────┘
```

### 依赖方向规则

- **工具层 (utils/)** → 无依赖，纯函数
- **组件层 (components/)** → 仅依赖 utils/
- **模块层 (modules/)** → 依赖 utils/ + state.js + storage.js
- **核心层 (state/storage/sync/auth/router)** → 仅依赖 utils/
- **入口 (app.js)** → 依赖全部

**箭头方向**：上层依赖下层，禁止反向依赖。
**原则**：业务模块不直接操作 DOM（通过组件层），保持可测试性。

---

## 四、事件总线

模块间通过 State 和自定义事件通信：

```javascript
// 任务更新 → 打卡统计刷新 → 日历刷新 → UI 更新
State.set('tasks', newTasks)
  → State 自动通知所有订阅者
  → checkin.js 更新统计
  → calendar.js 重新渲染日历
  → 组件层刷新 DOM
```

### 全局自定义事件

| 事件名 | 触发时机 | 监听者 |
|--------|----------|--------|
| `task:changed` | 任务 CRUD 后 | calendar, checkin, review, UI 组件 |
| `checkin:completed` | 打卡后 | review, countdown, toast |
| `checkin:daily-all-done` | 当日全部完成 | modal (激励弹窗) |
| `sync:completed` | 云端同步结束 | app (刷新 UI) |
| `break-warning` | 22:00 检查无打卡 | modal (预警弹窗) |
| `auth:changed` | 登录/登出 | sync, router |

---

> 📅 2026-07-26 | 📌 阶段五产出
