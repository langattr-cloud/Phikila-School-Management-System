// Regression guard for the timetable toolbar. Keep aligned with the approved menu contract.
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const source = readFileSync(new URL("../src/stitch/AscTimetableMenu.tsx", import.meta.url), "utf8");
const requiredActions = [
  "New", "Open", "Save", "Print", "Print preview", "Subjects", "Classes",
  "Classrooms", "Teachers", "Relations", "Test", "Generate new",
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
assert.ok(source.includes('flexWrap: "nowrap"'), "Toolbar must remain a single row");
assert.ok(source.includes('width: "100%"'), "Toolbar must use the full available width");
assert.ok(!/overflowX:\s*["']auto["']/.test(source), "Toolbar must not use horizontal scrolling");
console.log("Timetable menu contract passed.");
