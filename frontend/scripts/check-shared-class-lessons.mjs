import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/stitch/ClassesWorkspaceModule.tsx', 'utf8');
const windowComponent = readFileSync('src/stitch/ClassLessonsWindow.tsx', 'utf8');

assert.match(workspace, /onDoubleClick=\{\(\)=>\{setSelected\(name\);setDialog\(null\);setShowClassLessons\(true\)/,
  'Double-clicking any class should open the shared lessons window.');
assert.match(workspace, /lessons=\{selectedLessons\.map\(item => \(\{/,
  'The shared window must display lessons from the selected class in the saved workspace.');
assert.match(workspace, /onSave\(classes, lessons\.filter\(item => item\.id !== id\), details\)/,
  'Removing a lesson must update the shared timetable workspace.');
assert.match(workspace, /onSave\(classes, \[\.\.\.lessons, \{ \.\.\.target, id: makeClassLessonId\(\), className: targetClass, locked: false \}\], details\)/,
  'Copying a lesson must persist it through the existing workspace save path.');
assert.match(windowComponent, /onClick=\{onNew\}/, 'New/Add more controls must use the workspace lesson editor.');
assert.match(windowComponent, /onClick=\{\(\)=>selectedId != null && onEdit\(selectedId\)\}/,
  'Edit must use the workspace lesson editor.');
assert.match(windowComponent, /onClick=\{\(\)=>selectedId != null && onRemove\(selectedId\)\}/,
  'Remove must use the workspace save handler.');
assert.doesNotMatch(windowComponent, /Week|Day|Term|l\.day|l\.periodName/, 'The shared lessons window must exclude week, day, and term fields.');
assert.match(windowComponent, /const groupedLessons = lessons\.reduce/, 'Identical lessons must be grouped in the display.');
assert.match(windowComponent, /existing\.count \+= lesson\.count/, 'Grouped rows must show the total count without deleting underlying records.');
assert.match(windowComponent, /Edit, Remove, and Copy to act on one saved lesson in the group/, 'Grouped-row actions must be clearly scoped to one saved lesson.');
assert.doesNotMatch(windowComponent, /TANGUS VICTOR|CHEPKWONY MERCY|setLessons\(|const \[lessons, setLessons\]/,
  'The shared window must not include hard-coded demo lessons or its own unsaved lesson store.');

console.log('Shared class lessons checks passed.');
