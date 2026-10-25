import { readFileSync } from 'node:fs';

const path = 'frontend/src/stitch/AscTimetableMenu.tsx';
const source = readFileSync(path, 'utf8');

const requiredActions = [
  'New', 'Open', 'Save', 'Print', 'Print preview', 'Subjects', 'Classes',
  'Teachers', 'Relations', 'Test', 'Generate new',
  'Generate in cloud', 'Verification', 'School', 'Timetables Online',
  'Questions? Comments? Write us',
];
const requiredMenus = ['Main', 'File', 'Specification', 'View', 'Timetable', 'Options', 'Help'];
const missing = requiredActions.filter((label) => !source.includes(`go("${label}")`));
const missingMenus = requiredMenus.filter((label) => {
  if (label === 'Main') return !source.includes('>Main</b>');
  return !source.includes(`<span style={S.top}>${label}</span>`);
});
const forbidden = ['Students / Seminars', 'Students-\\nSeminars', 'Students /\\nSeminars']
  .filter((label) => source.includes(label));
const classroomCatalogueReintroduced = source.includes('go("Classrooms")');

if (missing.length || missingMenus.length || forbidden.length || classroomCatalogueReintroduced) {
  console.error('Timetable menu contract failed.');
  if (missing.length) console.error('Missing toolbar actions:', missing.join(', '));
  if (missingMenus.length) console.error('Missing top menus:', missingMenus.join(', '));
  if (forbidden.length) console.error('Removed toolbar item reintroduced:', forbidden.join(', '));
  if (classroomCatalogueReintroduced) console.error('Removed Classrooms catalogue shortcut must not return to the timetable ribbon.');
  process.exit(1);
}

if (!source.includes('width: "100%"') ||
    !source.includes('flexWrap: "nowrap"') ||
    !source.includes('overflow: "hidden"')) {
  console.error('Timetable menu layout contract failed: keep full-width, single-row, no-scroll layout.');
  process.exit(1);
}


const timetable = readFileSync('frontend/src/stitch/TimetableModule.tsx', 'utf8');
const appRoutes = readFileSync('frontend/src/App.tsx', 'utf8');
const appShell = readFileSync('frontend/src/components/AppShell.tsx', 'utf8');
const classesModule = readFileSync('frontend/src/stitch/ClassesWorkspaceModule.tsx', 'utf8');
const timetableBackend = readFileSync('app/modules/timetable/router.py', 'utf8');
const application = readFileSync('app/main.py', 'utf8');

const requiredClassesContracts = [
  ['Classes workspace mounted from timetable', 'ClassesWorkspaceModule'],
  ['double-click opens lessons', "setDialog('lessons')"],
  ['class changes flow through workspace save state', 'onSave(nextClasses,nextLessons,nextDetails)'],
  ['time-off grid persists with class details', 'timeOffGrid'],
  ['lesson removal requires explicit confirmation', "window.confirm('Remove this '+target.subject+' lesson from '+selected+'?')"],
  ['class removal protects linked timetable lessons', 'This class has timetable lessons'],
];
const missingClassesContracts = requiredClassesContracts
  .filter(([, marker]) => !classesModule.includes(marker) && !timetable.includes(marker))
  .map(([label]) => label);
const requiredBackendContracts = [
  ['account-scoped timetable storage model', 'tt_timetable_ribbon_workspaces'],
  ['authenticated workspace reads', 'Depends(get_supabase_claims)'],
  ['workspace ownership is derived from auth claims', '_owner(claims)'],
  ['workspace writes commit to the database', 'db.commit()'],
  ['timetable payload validation before saving', '_validate(payload.data)'],
  ['workspace table registered at startup', 'TimetableRibbonWorkspace.__table__'],
];
const missingBackendContracts = requiredBackendContracts
  .filter(([, marker]) => !timetableBackend.includes(marker) && !application.includes(marker))
  .map(([label]) => label);
if (missingClassesContracts.length || missingBackendContracts.length) {
  console.error('Classes workspace/backend contract failed.');
  if (missingClassesContracts.length) console.error('Missing Classes safeguards/features:', missingClassesContracts.join(', '));
  if (missingBackendContracts.length) console.error('Missing backend safeguards:', missingBackendContracts.join(', '));
  process.exit(1);
}
if (classesModule.includes('Manage the saved classrooms catalogue') || classesModule.includes('Room 1Remove')) {
  console.error('Removed classroom catalogue panel must not return inside Classes.');
  process.exit(1);
}


const requiredTeacherContracts = [
  ['teacher contract dialog', 'function TeacherContractDialog'],
  ['new lesson dialog', 'function NewLessonDialog'],
  ['double-click teacher entry', 'onDoubleClick={() => { setSelected(index); onOpenContract(teacher.name) }}'],
  ['teacher-specific contract lesson filtering', 'data.lessons.filter(lesson => lesson.teacher === contractTeacher)'],
  ['weekly lesson addition', 'lessons: [...current.lessons, ...additions]'],
  ['break-period protection', "data.periods[period].type === 'break'"],
  ['teacher/class route', "case '/setup/teachers': return <TeacherClassManagementPage />"],
  ['teachers navigation item', "to: '/setup/teachers', label: 'Teachers & classes'"],
];
const missingTeacherContracts = requiredTeacherContracts
  .filter(([, marker]) => ![timetable, appRoutes, appShell].some((content) => content.includes(marker)))
  .map(([label]) => label);
const sampleTeacherData = /OWINO MOSES|CREATIVE ARTS.*OWINO MOSES/.test(timetable);

if (missingTeacherContracts.length || sampleTeacherData) {
  console.error('Teacher/timetable integration contract failed.');
  if (missingTeacherContracts.length) console.error('Missing safeguards/features:', missingTeacherContracts.join(', '));
  if (sampleTeacherData) console.error('Sample teacher data must not be hardcoded into the production module.');
  process.exit(1);
}


const resetMigration = readFileSync('alembic/versions/20261022_remove_legacy_timetable_module.py', 'utf8');
const destructiveMigrationPatterns = [
  /DROP\\s+TABLE/i,
  /DROP\\s+COLUMN/i,
  /DELETE\\s+FROM/i,
  /TRUNCATE\\s+/i,
];
const destructiveMigrationMatches = destructiveMigrationPatterns
  .filter((pattern) => pattern.test(resetMigration))
  .map((pattern) => pattern.toString());
if (destructiveMigrationMatches.length) {
  console.error('Data-preservation guard failed: the legacy timetable migration must not drop tables or delete existing data.');
  console.error('Forbidden operations:', destructiveMigrationMatches.join(', '));
  process.exit(1);
}


assert.ok(timetable.includes("case 'Subjects': setSection(null); setSetupTab('subjects'); setSettingsOpen(true); break"), "Subjects menu action must open the data-backed Subjects workspace");
assert.ok(timetable.includes("setupTab === 'subjects' &&"), "Subjects workspace must remain mounted from the existing timetable settings flow");
assert.ok(timetable.includes("function SubjectLessonsDialog"), "Subjects must expose a lessons dialog");
assert.ok(timetable.includes("function SubjectTimeOffDialog"), "Subjects must expose a time-off grid dialog");
assert.ok(timetable.includes("data.lessons.filter(lesson=>lesson.subject===item).length"), "Subject lesson counts must derive from saved timetable lessons");
assert.ok(timetable.includes("timeOffGrid:grid"), "Subject time-off must be stored in the persisted workspace details");
assert.ok(!/YEGON JUSTICE|OWINO MOSES|MOSONIK CYNTHIA|KIRUI GLORIA|TANGUS VICTOR|LANGAT LEONARD/.test(timetable), "Sample lesson/teacher data must not be hardcoded into the live timetable workspace");

const repairWorkflows = [
  ".github/workflows/fix-incomplete-lesson-generation.yml",
  ".github/workflows/fix-subject-room-build.yml",
  ".github/workflows/solver-performance-fix.yml",
  ".github/workflows/fix-teaching-allocation-streams.yml",
];
for (const path of repairWorkflows) {
  const workflow = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  assert.ok(workflow.includes("workflow_dispatch:"), `Stale auto-repair workflow must be manual-only: ${path}`);
  assert.ok(!/^  push:/m.test(workflow), `Stale auto-repair workflow must not run on every push: ${path}`);
  assert.ok(!workflow.includes("git push") && !workflow.includes("git commit"), `Automated repair workflow must not mutate main directly: ${path}`);
}

console.log('Timetable and Classes contracts passed: approved menu, teacher workflows, Classes regression checks, account-scoped backend persistence, and no classroom catalogue panel.');
