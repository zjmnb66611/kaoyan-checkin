const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function createContext() {
  const data = {
    tasks: [],
    restDays: [],
    leaves: [],
    settings: { autoPostpone: true, examDate: '', breakWarning: true, breakWarningTime: '00:00' },
    checkinStats: { totalDays: 0, consecutiveDays: 0, weeklyMakeupUsed: 0, weeklyMakeupResetDate: '', lastCheckinDate: '', breakWarningLastShownDate: '' }
  };
  const context = {
    console,
    Set,
    Date,
    Math,
    JSON,
    CustomEvent: function CustomEvent(type) { this.type = type; },
    document: { dispatchEvent() {} },
    State: {
      get(key) { return key ? data[key] : data; },
      set(key, value) { data[key] = value; },
      update(key, partial) { data[key] = { ...data[key], ...partial }; },
      persist() {}
    }
  };
  vm.createContext(context);
  ['js/utils/date.js', 'js/utils/validate.js', 'js/modules/task.js', 'js/modules/rest.js', 'js/modules/checkin.js'].forEach(file => {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    const moduleName = file.includes('/date.js') ? 'DateUtils'
      : file.includes('/task.js') ? 'TaskModule'
        : file.includes('/rest.js') ? 'RestModule' : null;
    const resolvedModuleName = file.includes('/checkin.js') ? 'CheckinModule' : moduleName;
    if (resolvedModuleName) vm.runInContext(`globalThis.${resolvedModuleName} = ${resolvedModuleName};`, context);
  });
  return { context, data };
}

function task(id, scheduledDate, status = 'pending', subjectId = '') {
  return {
    id,
    subjectId,
    scheduledDate,
    status,
    deleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function testTemporaryRestRestore() {
  const { context, data } = createContext();
  const { DateUtils, RestModule } = context;
  const restDate = DateUtils.addDays(DateUtils.today(), 1);
  const nextDate = DateUtils.addDays(restDate, 1);
  data.tasks = [task('today-plan', restDate), task('future-plan', nextDate), task('done', restDate, 'completed')];

  assert.equal(RestModule.addTemporaryRest(restDate, restDate).ok, true);
  assert.equal(data.tasks[0].scheduledDate, nextDate);
  assert.equal(data.tasks[1].scheduledDate, DateUtils.addDays(nextDate, 1));
  assert.equal(data.tasks[2].scheduledDate, restDate);

  const restId = data.restDays[0].id;
  assert.equal(RestModule.removeTemporaryRest(restId).ok, true);
  assert.equal(data.tasks[0].scheduledDate, restDate);
  assert.equal(data.tasks[1].scheduledDate, nextDate);
  assert.equal(data.tasks[2].scheduledDate, restDate);
}

function testOverlappingRulesDoNotRestoreTooEarly() {
  const { context, data } = createContext();
  const { DateUtils, RestModule } = context;
  const offDate = DateUtils.addDays(DateUtils.today(), 1);
  data.tasks = [task('plan', offDate)];

  RestModule.addTemporaryRest(offDate, offDate);
  RestModule.addLeave(offDate, offDate);
  const shiftedDate = DateUtils.addDays(offDate, 1);
  assert.equal(data.tasks[0].scheduledDate, shiftedDate);

  const leaveId = data.leaves[0].id;
  RestModule.revokeLeave(leaveId, 'restore_original');
  assert.equal(data.tasks[0].scheduledDate, shiftedDate);

  RestModule.removeTemporaryRest(data.restDays[0].id);
  assert.equal(data.tasks[0].scheduledDate, offDate);
}

function testAutoPostponeMovesOnlyOverdueSubjectsOnce() {
  const { context, data } = createContext();
  const { DateUtils, TaskModule } = context;
  const overdueDate = DateUtils.addDays(DateUtils.today(), -1);
  const futureDate = DateUtils.addDays(DateUtils.today(), 2);
  data.tasks = [
    task('politics-overdue', overdueDate, 'pending', 'politics'),
    task('politics-future', futureDate, 'pending', 'politics'),
    task('english-future', futureDate, 'pending', 'english'),
    task('politics-completed', overdueDate, 'completed', 'politics'),
    task('unclassified-future', futureDate)
  ];

  TaskModule.postponeUncompletedTasks(overdueDate);
  assert.equal(data.tasks[0].scheduledDate, DateUtils.addDays(overdueDate, 1));
  assert.equal(data.tasks[1].scheduledDate, DateUtils.addDays(futureDate, 1));
  assert.equal(data.tasks[2].scheduledDate, futureDate);
  assert.equal(data.tasks[3].scheduledDate, overdueDate);
  assert.equal(data.tasks[4].scheduledDate, futureDate);

  const afterFirstRun = data.tasks.map(item => item.scheduledDate);
  TaskModule.postponeUncompletedTasks(overdueDate);
  assert.deepEqual(data.tasks.map(item => item.scheduledDate), afterFirstRun);
}

function testExplicitTaskOnRestDayStaysVisible() {
  const { context, data } = createContext();
  const { DateUtils, RestModule, TaskModule } = context;
  const restDate = DateUtils.addDays(DateUtils.today(), 1);
  RestModule.addTemporaryRest(restDate, restDate);

  const result = TaskModule.addTask({ content: '明确安排在休息日的任务', scheduledDate: restDate });
  assert.equal(result.ok, true);
  RestModule.applyPostponement();
  assert.equal(data.tasks[0].scheduledDate, restDate);
}

function testBreakWarningOnlyAppearsOncePerDay() {
  const { context, data } = createContext();
  const { DateUtils, CheckinModule } = context;
  data.tasks = [task('today-task', DateUtils.today())];
  let warnings = 0;
  context.document.dispatchEvent = event => {
    if (event.type === 'break-warning') warnings++;
  };

  CheckinModule.checkBreakWarning();
  CheckinModule.checkBreakWarning();

  assert.equal(warnings, 1);
  assert.equal(data.checkinStats.breakWarningLastShownDate, DateUtils.today());
}

function testTaskUpdateRejectsInvalidText() {
  const { context, data } = createContext();
  const { DateUtils, TaskModule } = context;
  data.tasks = [task('text-task', DateUtils.today())];

  assert.equal(TaskModule.updateTask('text-task', { content: '' }).ok, false);
  assert.equal(TaskModule.updateTask('text-task', { content: 'a'.repeat(501) }).ok, false);
  assert.equal(TaskModule.updateTask('text-task', { checkinNote: 'a'.repeat(501) }).ok, false);
  assert.equal(TaskModule.updateTask('text-task', { status: 'invalid' }).ok, false);
}

testTemporaryRestRestore();
testOverlappingRulesDoNotRestoreTooEarly();
testAutoPostponeMovesOnlyOverdueSubjectsOnce();
testExplicitTaskOnRestDayStaysVisible();
testBreakWarningOnlyAppearsOncePerDay();
testTaskUpdateRejectsInvalidText();
console.log('rest/task regression tests passed');
