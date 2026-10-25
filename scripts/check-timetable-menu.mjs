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

console.log('Timetable menu contract passed: required menus/actions present, Students/Seminars absent, full-width ribbon preserved.');
