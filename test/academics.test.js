import test from "node:test";
import assert from "node:assert/strict";
import {
  percentage, gradeFor, subjectResult, reportCard, reportCards, rankCards, rankOf,
  gradeDistribution, attendanceStats, registerForDate, attendanceByStudent,
  attendanceTrend, classRegister, withStatus, schoolDaysBetween, isPass,
} from "../src/academics.js";
import { DAY, SUBJECTS } from "../src/data.js";

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0); // Wednesday

const student = (over = {}) => ({ id: "S-1", name: "Aarav Shrestha", classId: "8A", roll: 1, ...over });
const mark = (studentId, subjectId, marks, fullMarks = 100) => ({ studentId, subjectId, marks, fullMarks });

test("gradeFor walks the scale from the top and clamps out-of-range input", () => {
  assert.equal(gradeFor(95).grade, "A+");
  assert.equal(gradeFor(90).grade, "A+");
  assert.equal(gradeFor(89.9).grade, "A");
  assert.equal(gradeFor(70).grade, "B+");
  assert.equal(gradeFor(40).grade, "C");
  assert.equal(gradeFor(39.9).grade, "D");
  assert.equal(gradeFor(0).grade, "NG");
  assert.equal(gradeFor(140).grade, "A+");
  assert.equal(gradeFor(-5).grade, "NG");
});

test("percentage clamps and isPass uses the 40 percent line", () => {
  assert.equal(percentage(45, 100), 45);
  assert.equal(percentage(90, 75), 100);
  assert.equal(percentage(5, 0), 0);
  assert.equal(isPass(40), true);
  assert.equal(isPass(39.99), false);
});

test("subjectResult grades one subject and flags a fail", () => {
  const subject = SUBJECTS[2]; // Mathematics, 4 credits
  const pass = subjectResult(mark("S-1", "math", 72), subject);
  assert.equal(pass.percent, 72);
  assert.equal(pass.grade, "B+");
  assert.equal(pass.gpa, 3.2);
  assert.equal(pass.pass, true);
  assert.equal(pass.name, "Mathematics");

  const fail = subjectResult(mark("S-1", "math", 35), subject);
  assert.equal(fail.grade, "D");
  assert.equal(fail.pass, false);
});

test("reportCard weights GPA by credits and totals the marks", () => {
  const subjects = [
    { id: "a", name: "Subject A", credits: 4, fullMarks: 100 },
    { id: "b", name: "Subject B", credits: 4, fullMarks: 100 },
    { id: "c", name: "Subject C", credits: 2, fullMarks: 100 },
  ];
  const marks = [mark("S-1", "a", 80), mark("S-1", "b", 60), mark("S-1", "c", 90)];
  const card = reportCard(student(), marks, { subjects });
  assert.equal(card.rows.length, 3);
  assert.equal(card.totalMarks, 230);
  assert.equal(card.totalFull, 300);
  assert.equal(card.percent, 76.67);
  assert.equal(card.gpa, 3.36); // (3.6*4 + 2.8*4 + 4.0*2) / 10
  assert.equal(card.grade, "B+");
  assert.equal(card.pass, true);
  assert.deepEqual(card.failedSubjects, []);
});

test("reportCard ignores subjects without a mark and lists failures", () => {
  const subjects = [
    { id: "a", name: "Subject A", credits: 4, fullMarks: 100 },
    { id: "b", name: "Subject B", credits: 4, fullMarks: 100 },
    { id: "missing", name: "Not examined", credits: 4, fullMarks: 100 },
  ];
  const marks = [mark("S-1", "a", 92), mark("S-1", "b", 25)];
  const card = reportCard(student(), marks, { subjects });
  assert.equal(card.rows.length, 2);
  assert.equal(card.pass, false);
  assert.deepEqual(card.failedSubjects, ["Subject B"]);
  assert.equal(card.rows[1].grade, "NG");
});

test("rankCards is competition ranking with exact ties sharing a place", () => {
  const cards = [
    { student: student({ id: "a", name: "A" }), gpa: 3.4, percent: 82 },
    { student: student({ id: "b", name: "B" }), gpa: 3.4, percent: 82 },
    { student: student({ id: "c", name: "C" }), gpa: 3.2, percent: 79 },
    { student: student({ id: "d", name: "D" }), gpa: 2.8, percent: 68 },
  ];
  const ranked = rankCards(cards);
  assert.deepEqual(ranked.map((c) => [c.student.id, c.rank]), [["a", 1], ["b", 1], ["c", 3], ["d", 4]]);
  assert.equal(rankOf(cards, "c").rank, 3);
  assert.equal(rankOf(cards, "nope"), null);
});

test("gradeDistribution keeps the scale order", () => {
  const cards = [
    { grade: "A+" }, { grade: "B+" }, { grade: "B+" }, { grade: "C" },
  ];
  assert.deepEqual(gradeDistribution(cards), [
    { grade: "A+", count: 1 }, { grade: "B+", count: 2 }, { grade: "C", count: 1 },
  ]);
});

test("attendanceStats counts late as attended but excused as missed", () => {
  const records = [
    { status: "present" }, { status: "present" }, { status: "late" },
    { status: "excused" }, { status: "absent" },
  ];
  const stats = attendanceStats(records);
  assert.equal(stats.total, 5);
  assert.equal(stats.attended, 3);
  assert.equal(stats.rate, 0.6);
});

test("registerForDate returns a row for every student, marked or not", () => {
  const students = [student(), student({ id: "S-2", name: "Sita" })];
  const records = [{ studentId: "S-1", date: 100, status: "present" }];
  const rows = registerForDate(records, students, 100);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "present");
  assert.equal(rows[1].status, null);
});

test("per-student and per-day attendance rollups agree", () => {
  const records = [
    { studentId: "S-1", date: 1, status: "present" },
    { studentId: "S-1", date: 2, status: "absent" },
    { studentId: "S-2", date: 1, status: "present" },
    { studentId: "S-2", date: 2, status: "present" },
  ];
  const byStudent = attendanceByStudent(records);
  assert.equal(byStudent["S-1"].rate, 0.5);
  assert.equal(byStudent["S-2"].rate, 1);

  const trend = attendanceTrend(records, [1, 2]);
  assert.deepEqual(trend.map((d) => Math.round(d.rate * 100)), [100, 50]);

  const register = classRegister(records, [student(), student({ id: "S-2" })], [1, 2]);
  assert.equal(register[0].stats.total, 2);
  assert.equal(register[1].stats.rate, 1);
});

test("reportCards builds one card per student", () => {
  const students = [student(), student({ id: "S-2", name: "Sita Karki" })];
  const marks = [mark("S-1", "nep", 80), mark("S-2", "nep", 55)];
  const [first, second] = reportCards(students, marks, { subjects: [SUBJECTS[0]] });
  assert.equal(first.rows.length, 1);
  assert.equal(first.gpa, 3.6);
  assert.equal(second.gpa, 2.4);
});

test("withStatus replaces one record without mutating the input", () => {
  const records = [{ studentId: "S-1", date: 5, status: "present" }];
  const updated = withStatus(records, "S-1", 5, "absent");
  assert.equal(records[0].status, "present");
  assert.equal(updated[0].status, "absent");
  const appended = withStatus(records, "S-2", 5, "late");
  assert.equal(appended.length, 2);
  assert.equal(appended[1].status, "late");
});

test("schoolDaysBetween skips Saturdays", () => {
  // 2026-10-24 is a Saturday, 2026-10-25 Sunday
  const saturday = Date.UTC(2026, 9, 24);
  const sunday = Date.UTC(2026, 9, 25);
  assert.equal(schoolDaysBetween(saturday, sunday), 1);
  assert.equal(schoolDaysBetween(sunday, sunday + 6 * DAY), 6);
});
