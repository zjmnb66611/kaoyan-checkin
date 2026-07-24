# 阶段四：数据架构

> 本地存储 Schema、云端存储 Schema（预留）、数据模型定义

---

## 一、数据模型总览

```
Task (任务)
  ├── 1:1 关联 Subject (科目)
  ├── N:1 关联 User (用户)
  └── 包含 Check-in (打卡记录)

Subject (科目)
  ├── 1:N 关联 Task
  └── 1:1 关联 User

RestDay (休息日)
  ├── N:1 关联 User
  └── 两种类型：Weekly / Temporary

Leave (请假)
  └── N:1 关联 User

RecurringRule (周期规则)
  ├── 1:N 关联 Task
  └── N:1 关联 User
```

---

## 二、LocalStorage Schema

### 2.1 存储键名

| Key | 内容 | 说名 |
|-----|------|------|
| `kaoyan_tasks` | 任务数组 JSON | 核心数据 |
| `kaoyan_subjects` | 科目数组 JSON | 预置+自定义 |
| `kaoyan_rest_days` | 休息日数组 JSON | 周期+临时 |
| `kaoyan_leaves` | 请假数组 JSON | 请假记录 |
| `kaoyan_recurring_rules` | 周期规则数组 JSON | 重复任务规则 |
| `kaoyan_settings` | 设置对象 JSON | 用户偏好 |
| `kaoyan_user` | 用户信息对象 JSON | 本地缓存的用户 |
| `kaoyan_sync_queue` | 待同步操作队列 | 离线变更 |
| `kaoyan_checkin_stats` | 打卡统计 JSON | 累计/连续天数 |

### 2.2 数据结构定义

```javascript
// ─── 任务 (Task) ───
{
  id: "uuid-v4",
  subjectId: "subject-uuid",        // 关联科目ID
  content: "完成2025真题阅读第3篇",   // 任务内容
  scheduledDate: "2026-07-24",      // 计划日期 YYYY-MM-DD
  originalDate: "2026-07-24",       // 原始创建日期(用于复原)
  status: "pending",                // "pending" | "completed"
  checkinNote: "",                  // 打卡备注
  isCheckinBackfill: false,         // 是否补卡
  source: "manual",                 // "manual" | "recurring"
  recurringRuleId: null,            // 关联周期规则ID
  createdAt: "2026-07-24T10:30:00.000Z",
  updatedAt: "2026-07-24T10:30:00.000Z",
  deleted: false                    // 软删除标记
}

// ─── 科目 (Subject) ───
{
  id: "uuid-v4",
  name: "英语",
  color: "#E07B5A",               // 科目标识色
  icon: "fa-book",                 // Font Awesome 图标类
  sortOrder: 0,                    // 排序序号
  isPreset: true,                  // 是否预置科目
  createdAt: "2026-07-24T10:30:00.000Z",
  deleted: false
}

// ─── 休息日 (RestDay) ───
{
  id: "uuid-v4",
  type: "weekly",                  // "weekly" | "temporary"
  dayOfWeek: [0, 6],              // 仅 weekly: 0=周日,1-6=周一至周六
  startDate: "2026-07-24",        // 仅 temporary: 开始日期
  endDate: "2026-07-26",          // 仅 temporary: 结束日期(含)
  enabled: true,                   // 周期休息日是否启用
  note: "",
  createdAt: "2026-07-24T10:30:00.000Z"
}

// ─── 请假 (Leave) ───
{
  id: "uuid-v4",
  startDate: "2026-08-01",
  endDate: "2026-08-03",
  isRevoked: false,
  restoreMode: null,               // 撤销时: "keep_postponed" | "restore_original"
  taskSnapshots: [                 // 请假时保存的任务溯源
    { taskId: "xxx", originalDate: "2026-08-01", newDate: "2026-08-04" }
  ],
  createdAt: "2026-07-24T10:30:00.000Z"
}

// ─── 周期规则 (RecurringRule) ───
{
  id: "uuid-v4",
  subjectId: "subject-uuid",
  content: "背单词50个",
  frequency: "weekly",             // "daily" | "weekly"
  daysOfWeek: [1, 3, 5],          // 仅 weekly: 周一三五
  startDate: "2026-07-24",        // 开始日期
  endDate: null,                   // null 表示持续到考研日期
  enabled: true,
  createdAt: "2026-07-24T10:30:00.000Z"
}

// ─── 设置 (Settings) ───
{
  examDate: "2026-12-25",          // 考研日期
  autoPostpone: true,              // 未完成任务自动顺延开关
  breakWarning: true,              // 断卡预警开关
  breakWarningTime: "22:00",       // 预警时间
  viewMode: "compact",             // "compact" | "comfortable"
  taskStyle: "checkbox-left",      // "checkbox-left" | "checkbox-right"
  weeklyStartDay: 1,               // 周起始日 1=周一
  countdownCollapsed: false,       // 倒计时折叠
  progressCollapsed: false,        // 进度折叠
  searchExpanded: false            // 搜索展开
}

// ─── 打卡统计 (CheckinStats) ───
{
  totalDays: 120,                  // 累计打卡天数
  consecutiveDays: 45,             // 连续打卡天数
  weeklyMakeupUsed: 0,             // 本周已用补卡次数
  weeklyMakeupResetDate: "2026-07-27", // 下次补卡重置日期
  lastCheckinDate: "2026-07-23",   // 最后打卡日期
  dailyCompletion: {               // 每日完成率快照
    "2026-07-23": { total: 8, completed: 8 },
    "2026-07-22": { total: 6, completed: 5 }
  }
}

// ─── 用户信息 (User) ───
{
  uid: "uuid-from-backend",
  email: "user@example.com",
  displayName: "考研人",
  lastSyncAt: "2026-07-24T10:30:00.000Z",
  isLoggedIn: false
}
```

---

## 三、IndexedDB Schema

用于大数据量场景（历史任务 > 500 条）

| ObjectStore | 主键 | 索引字段 | 用途 |
|-------------|------|----------|------|
| tasks | id | scheduledDate, subjectId, status | 全量任务存储 |
| checkinHistory | id | date, taskId | 历史打卡记录 |
| reviewCache | id | type, periodStart | 缓存复盘结果 |

---

## 四、云端 Schema（Supabase 预留）

与 LocalStorage 结构保持一致，额外字段：

| 表 | 额外字段 |
|------|----------|
| tasks | user_id (FK), synced_at |
| subjects | user_id (FK), synced_at |
| rest_days | user_id (FK), synced_at |
| leaves | user_id (FK), synced_at |
| recurring_rules | user_id (FK), synced_at |
| settings | user_id (FK, PK) |
| checkin_stats | user_id (FK, PK) |

---

## 五、数据操作原则

1. **所有写操作** → 先写 State → 同步写 LocalStorage → 异步写 IndexedDB + 云
2. **所有读操作** → State 缓存 → 未命中则读 LocalStorage
3. **云端同步** → 登录+联网时自动触发，以 `updatedAt` 最大值为准
4. **软删除** → `deleted: true`，30天后物理删除
5. **数据完整性** → 启动时校验 JSON 格式，损坏则从备份恢复

---

> 📅 2026-07-24 | 📌 阶段四产出
