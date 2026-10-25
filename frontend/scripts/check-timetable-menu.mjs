// Regression guard for the timetable toolbar. Keep aligned with the approved menu contract.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/stitch/AscTimetableMenu.tsx", import.meta.url), "utf8");
const requiredActions = [
  "New", "Open", "Save", "Print", "Print preview", "Subjects", "Classes",
  "Teachers", "Relations", "Test", "Generate new",
  "Generate in cloud", "Verification", "School", "Timetables Online",
  "Questions? Comments? Write us",
];
for (const action of requiredActions) {
  assert.ok(source.includes(`go("${action}")`), `Missing approved toolbar action: ${action}`);
}
for (const heading of ["Main", "File", "Specification", "View", "Timetable", "Options", "Help"]) {
  assert.ok(source.includes(`>${heading}<`) || source.includes(`>${heading}`), `Missing menu heading: ${heading}`);
}
assert.ok(!/Students\s*\/?\s*Seminars/i.test(source), "Students / Seminars must not return to the toolbar");
assert.ok(!source.includes('go("Classrooms")'), "Removed Classrooms catalogue shortcut must not return to the toolbar");
assert.ok(source.includes('flexWrap: "nowrap"'), "Toolbar must remain a single row");
assert.ok(source.includes('width: "100%"'), "Toolbar must use the full available width");
assert.ok(!/overflowX:\s*["']auto["']/.test(source), "Toolbar must not use horizontal scrolling");

const classesModule = readFileSync(new URL("../src/stitch/ClassesWorkspaceModule.tsx", import.meta.url), "utf8");
const timetable = readFileSync(new URL("../src/stitch/TimetableModule.tsx", import.meta.url), "utf8");
const timetableBackend = readFileSync(new URL("../../app/modules/timetable/router.py", import.meta.url), "utf8");
const application = readFileSync(new URL("../../app/main.py", import.meta.url), "utf8");

for (const [label, marker] of [
  ["Classes workspace opens from timetable", "ClassesWorkspaceModule"],
  ["Double-click class opens lessons", "setDialog('lessons')"],
  ["Class changes update the shared workspace", "onSave(nextClasses,nextLessons,nextDetails)"],
  ["Time-off grid is stored with class details", "timeOffGrid"],
  ["Class removal protects linked lessons", "This class has timetable lessons"],
]) {
  assert.ok(classesModule.includes(marker) || timetable.includes(marker), `Missing Classes safeguard: ${label}`);
}
for (const [label, marker] of [
  ["Account-scoped timetable workspace table", "tt_timetable_ribbon_workspaces"],
  ["Authenticated workspace access", "Depends(get_supabase_claims)"],
  ["Workspace owner derived from auth claims", "_owner(claims)"],
  ["Workspace writes commit to database", "db.commit()"],
  ["Payload validated before save", "_validate(payload.data)"],
  ["Workspace model registered on startup", "TimetableRibbonWorkspace.__table__"],
]) {
  assert.ok(timetableBackend.includes(marker) || application.includes(marker), `Missing backend safeguard: ${label}`);
}
assert.ok(!classesModule.includes("Manage the saved classrooms catalogue"), "Removed classroom catalogue must not return inside Classes");
console.log("Timetable menu, Classes workspace, and backend persistence contracts passed.");

