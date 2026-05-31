/**
 * SchoolKit academics: grades, GPA, class rank and attendance.
 *
 * The grading scale is a simplified 4.0 table. It is not the NEB letter-band
 * table that a real Nepali transcript uses, and the README says so.
 *
 * GPA is credit-weighted, not a mean of subject grades: Nepali and Mathematics
 * are four-credit subjects, Health & Physical Education is two. A student who
 * scrapes a C in Maths is a different case from one who scrapes a C in HPE, and
 * a plain average hides that.
 */

import { GRADE_SCALE, PASS_PERCENT, SUBJECTS, DAY } from "./data.js";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export function percentage(marks, fullMarks) {
  if (!fullMarks) return 0;
  return clamp((marks / fullMarks) * 100, 0, 100);
}

/** Highest scale entry whose threshold the percentage reaches. */
export function gradeFor(percent, scale = GRADE_SCALE) {
  const value = clamp(percent, 0, 100);
  return scale.find((entry) => value >= entry.min) ?? scale.at(-1);
}

export function isPass(percent) {
  return percent >= PASS_PERCENT;
}

/** One subject line on a report card. */
export function subjectResult(mark, subject) {
  const percent = round(percentage(mark.marks, mark.fullMarks ?? subject.fullMarks), 2);
  const grade = gradeFor(percent);
  return {
    subjectId: subject.id,
    name: subject.name,
    credits: subject.credits,
    marks: mark.marks,
    fullMarks: mark.fullMarks ?? subject.fullMarks,
    percent,
    grade: grade.grade,
    gpa: grade.gpa,
    label: grade.label,
    pass: isPass(percent),
  };
}

/**
 * Build a report card for one student.
 *
 * @param {{id:string,name:string,classId:string,roll:number}} student
 * @param {object[]} marks   all marks; filtered by student
 * @param {{subjects?: object[], scale?: object[]}} [options]
 */
export function reportCard(student, marks, { subjects = SUBJECTS, scale = GRADE_SCALE } = {}) {
  const own = marks.filter((m) => m.studentId === student.id);
  const rows = [];
  for (const subject of subjects) {
    const mark = own.find((m) => m.subjectId === subject.id);
    if (!mark) continue;
    const result = subjectResult(mark, subject);
    const graded = gradeFor(result.percent, scale);
    rows.push({ ...result, gpa: graded.gpa, grade: graded.grade });
  }
  const totalMarks = rows.reduce((a, r) => a + r.marks, 0);
  const totalFull = rows.reduce((a, r) => a + r.fullMarks, 0);
  const credits = rows.reduce((a, r) => a + r.credits, 0);
  const percent = totalFull ? round((totalMarks / totalFull) * 100, 2) : 0;
  const gpa = credits ? round(rows.reduce((a, r) => a + r.gpa * r.credits, 0) / credits, 2) : 0;
  const overall = gradeFor(percent, scale);
  const failed = rows.filter((r) => !r.pass);

  return {
    student,
    rows,
    totalMarks,
    totalFull,
    percent,
    gpa,
    grade: overall.grade,
    label: overall.label,
    credits,
    pass: failed.length === 0,
    failedSubjects: failed.map((r) => r.name),
  };
}

/** Report cards for a list of students. */
export function reportCards(students, marks, options = {}) {
  return students.map((student) => reportCard(student, marks, options));
}

/**
 * Competition ranking inside one class: 1, 2, 2, 4. Cards tie only when both
 * the GPA and the percentage match, so an exact tie shares a rank and the next
 * student skips one.
 */
export function rankCards(cards) {
  const sorted = [...cards].sort((a, b) =>
    b.gpa - a.gpa || b.percent - a.percent || a.student.name.localeCompare(b.student.name));
  const ranked = [];
  sorted.forEach((card, index) => {
    const prev = ranked[index - 1];
    const tie = prev && prev.gpa === card.gpa && prev.percent === card.percent;
    ranked.push({ ...card, rank: tie ? prev.rank : index + 1 });
  });
  return ranked;
}

export function rankOf(cards, studentId) {
  const ranked = rankCards(cards);
  return ranked.find((c) => c.student.id === studentId) ?? null;
}

/** Grade counts for the class distribution strip. */
export function gradeDistribution(cards, scale = GRADE_SCALE) {
  const order = scale.map((s) => s.grade);
  const counts = new Map(order.map((g) => [g, 0]));
  for (const card of cards) counts.set(card.grade, (counts.get(card.grade) ?? 0) + 1);
  return order.filter((g) => counts.get(g) > 0).map((grade) => ({ grade, count: counts.get(grade) }));
}

/**
 * Attendance stats. Late counts as attended — the student was in class — while
 * excused absence still counts against the rate, because the register records
 * presence, not permission. The demo explains this where the number appears.
 */
export function attendanceStats(records) {
  const counts = { present: 0, late: 0, absent: 0, excused: 0, total: 0 };
  for (const record of records) {
    if (counts[record.status] === undefined) continue;
    counts[record.status]++;
    counts.total++;
  }
  const attended = counts.present + counts.late;
  return { ...counts, attended, rate: counts.total ? attended / counts.total : 0 };
}

/** Register rows for one date: every student gets a row, marked or not. */
export function registerForDate(records, students, date) {
  return students.map((student) => {
    const record = records.find((r) => r.studentId === student.id && r.date === date);
    return { student, status: record?.status ?? null, record: record ?? null };
  });
}

/** Per-student attendance totals, keyed by student id. */
export function attendanceByStudent(records) {
  const groups = new Map();
  for (const record of records) {
    if (!groups.has(record.studentId)) groups.set(record.studentId, []);
    groups.get(record.studentId).push(record);
  }
  const out = {};
  for (const [studentId, rows] of groups) out[studentId] = attendanceStats(rows);
  return out;
}

/** Attendance rate per day, oldest first. */
export function attendanceTrend(records, days) {
  return days.map((date) => {
    const rows = records.filter((r) => r.date === date);
    const stats = attendanceStats(rows);
    return { date, rate: stats.rate, present: stats.present, absent: stats.absent, late: stats.late, total: stats.total };
  });
}

/** Days present, late, absent per student for one class and date range. */
export function classRegister(records, students, days) {
  const inRange = days.reduce((acc, day) => acc.add(day), new Set());
  return students.map((student) => {
    const rows = records.filter((r) => r.studentId === student.id && inRange.has(r.date));
    return { student, stats: attendanceStats(rows) };
  });
}

/** Mark-one-record helper shared by the demo and the tests. */
export function withStatus(records, studentId, date, status) {
  const index = records.findIndex((r) => r.studentId === studentId && r.date === date);
  if (index === -1) return [...records, { studentId, date, status }];
  const next = records.slice();
  next[index] = { ...next[index], status };
  return next;
}

/** Working days between two timestamps, Saturday excluded. */
export function schoolDaysBetween(from, to) {
  let count = 0;
  for (let ts = from; ts <= to; ts += DAY) {
    if (new Date(ts).getUTCDay() !== 6) count++;
  }
  return count;
}
