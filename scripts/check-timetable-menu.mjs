import { readFileSync } from 'node:fs';

const path = 'frontend/src/stitch/AscTimetableMenu.tsx';
const source = readFileSync(path, 'utf8');

const requiredActions = [
  'New', 'Open', 'Save', 'Print', 'Print preview', 'Subjects', 'Classes',
  'Classrooms', 'Teachers', 'Relations', 'Test', 'Generate new',
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

if (missing.length || missingMenus.length || forbidden.length) {
  console.error('Timetable menu contract failed.');
  if (missing.length) console.error('Missing toolbar actions:', missing.join(', '));
  if (missingMenus.length) console.error('Missing top menus:', missingMenus.join(', '));
  if (forbidden.length) console.error('Removed toolbar item reintroduced:', forbidden.join(', '));
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

console.log('Timetable menu and teacher lesson contracts passed: menu protection, teacher routing, contract dialog, conflict-aware lesson creation, and no sample teacher data.');
