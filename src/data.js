/**
 * SchoolKit demo data.
 *
 * One school, three sections of grades 8-10, 36 students, a second-term midterm,
 * 24 days of attendance and three months of fee invoices. Everything is derived
 * from a seed and an explicit `now`, so the register, the report card and the
 * tests all describe the same school day.
 *
 * Modelled on a Nepali secondary school: the week runs Sunday to Friday, fees
 * are in rupees and the academic year starts in Baisakh (April).
 */

export const DAY = 86_400_000;

/** Simplified 4.0 table. Real NEB transcripts use band ranges, not this. */
export const GRADE_SCALE = [
  { grade: "A+", min: 90, gpa: 4.0, label: "Outstanding" },
  { grade: "A", min: 80, gpa: 3.6, label: "Excellent" },
  { grade: "B+", min: 70, gpa: 3.2, label: "Very good" },
  { grade: "B", min: 60, gpa: 2.8, label: "Good" },
  { grade: "C+", min: 50, gpa: 2.4, label: "Satisfactory" },
  { grade: "C", min: 40, gpa: 2.0, label: "Acceptable" },
  { grade: "D", min: 30, gpa: 1.6, label: "Partial" },
  { grade: "NG", min: 0, gpa: 0, label: "Not graded" },
];

export const PASS_PERCENT = 40;

/** Saturday is the weekly holiday; school runs Sunday to Friday. */
export function isSchoolDay(ts) {
  return new Date(ts).getUTCDay() !== 6;
}

/** The last `count` school days up to and including `end`'s day. */
export function schoolDaysBefore(end, count) {
  const days = [];
  let cursor = Date.UTC(new Date(end).getUTCFullYear(), new Date(end).getUTCMonth(), new Date(end).getUTCDate());
  while (days.length < count) {
    if (isSchoolDay(cursor)) days.unshift(cursor);
    cursor -= DAY;
  }
  return days;
}

export const SUBJECTS = [
  { id: "nep", name: "Nepali", credits: 4, fullMarks: 100, teacher: "S. Karki" },
  { id: "eng", name: "English", credits: 4, fullMarks: 100, teacher: "M. Joshi" },
  { id: "math", name: "Mathematics", credits: 4, fullMarks: 100, teacher: "R. Bhattarai" },
  { id: "sci", name: "Science", credits: 4, fullMarks: 100, teacher: "P. Adhikari" },
  { id: "soc", name: "Social Studies", credits: 3, fullMarks: 100, teacher: "L. Bhandari" },
  { id: "comp", name: "Computer Science", credits: 3, fullMarks: 100, teacher: "A. Shrestha" },
  { id: "hpe", name: "Health & Physical Education", credits: 2, fullMarks: 100, teacher: "B. Thapa" },
];

export const CLASSES = [
  { id: "8A", grade: 8, section: "A", label: "Grade 8 · A", teacher: "Sarita Karki", room: "Room 104" },
  { id: "9A", grade: 9, section: "A", label: "Grade 9 · A", teacher: "Mohan Joshi", room: "Room 201" },
  { id: "10A", grade: 10, section: "A", label: "Grade 10 · A", teacher: "Ramesh Bhattarai", room: "Room 302" },
];

const FIRST_NAMES = [
  "Aarav", "Sita", "Bipin", "Rojina", "Kiran", "Anjali", "Suman", "Nisha",
  "Prakash", "Sabina", "Dipesh", "Maya", "Rohit", "Laxmi", "Arun", "Pooja",
  "Bikash", "Rita", "Sagar", "Manisha", "Hari", "Sarita", "Umesh", "Kalpana",
  "Prabin", "Sneha", "Deepak", "Bimala", "Ashish", "Nirmala", "Rabin", "Sunita",
  "Ganesh", "Anita", "Milan", "Barsha",
];
const LAST_NAMES = [
  "Shrestha", "Thapa", "Karki", "Gurung", "Adhikari", "Rai", "Lama", "Magar",
  "Bhattarai", "Poudel", "Joshi", "Basnet", "Tamang", "Shahi", "Khadka", "Neupane",
  "Subedi", "Ghimire", "Pandey", "Maharjan", "Dhakal", "Bhandari", "Chaudhary", "Yadav",
];
const STREETS = [
  "Kirtipur-6", "Patan-11", "Baneshwor-8", "Lalitpur-4", "Bhaktapur-3",
  "Chabahil-7", "Kalanki-14", "Jawalakhel-2", "Gongabu-9", "Boudha-6",
];

export const LATE_FEE_RULE = {
  periodDays: 7,
  ratePerPeriod: 0.02, // 2% of the outstanding balance per started week
  capOfTotal: 0.2, // never more than 20% of the invoice total
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSchool({ seed = 20261028, now = Date.now() } = {}) {
  const r = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (min, max) => Math.floor(min + r() * (max - min + 1));
  const between = (min, max) => min + r() * (max - min);

  const students = [];
  for (let i = 0; i < 36; i++) {
    const cls = CLASSES[Math.floor(i / 12)];
    const first = FIRST_NAMES[i];
    const last = LAST_NAMES[(i * 5) % LAST_NAMES.length];
    const guardianFirst = FIRST_NAMES[(i * 7 + 3) % FIRST_NAMES.length];
    students.push({
      id: `S-${String(1001 + i)}`,
      name: `${first} ${last}`,
      roll: (i % 12) + 1,
      classId: cls.id,
      gender: i % 2 === 0 ? "F" : "M",
      guardian: {
        name: `${guardianFirst} ${last}`,
        relation: i % 3 === 0 ? "Mother" : i % 3 === 1 ? "Father" : "Guardian",
        phone: `98${String(41000000 + i * 1373).slice(0, 8)}`,
      },
      address: STREETS[i % STREETS.length],
      admissionYear: 2026 - (cls.grade - 8) - int(0, 2),
      // ability drives marks and attendance; kept on the student so both agree
      ability: 0.42 + between(0, 0.52),
      transport: r() < 0.35,
      siblingDiscount: r() < 0.18,
    });
  }

  // Term 2 midterm: one mark per subject per student.
  const marks = [];
  for (const student of students) {
    for (const subject of SUBJECTS) {
      const noise = between(-0.16, 0.14);
      const raw = Math.round(Math.min(99, Math.max(18, (student.ability + noise) * 100)));
      marks.push({
        studentId: student.id,
        subjectId: subject.id,
        exam: "Term 2 · Midterm",
        fullMarks: subject.fullMarks,
        marks: raw,
      });
    }
  }

  // 24 school days of attendance, ending today.
  const days = schoolDaysBefore(now, 24);
  const attendance = [];
  for (const student of students) {
    const base = 0.84 + student.ability * 0.13;
    for (const day of days) {
      const roll = r();
      // A near-daily absence rate: 4-6% late, 2-3% excused, the rest present
      // with a small chance of an unexplained absence.
      const presentShare = 0.86 + student.ability * 0.07;
      const status = roll < 0.06 ? "late"
        : roll < 0.09 ? "excused"
          : roll < 0.09 + presentShare ? "present"
            : "absent";
      attendance.push({ studentId: student.id, date: day, status, by: student.classId });
    }
  }

  // Three monthly fee invoices: two already due, one due next month.
  const monthStarts = [0, 1, 2].map((offset) => {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - offset, 1);
  }).reverse();
  const invoices = [];
  let serial = 4100;
  for (const student of students) {
    for (const monthStart of monthStarts) {
      const due = Date.UTC(new Date(monthStart).getUTCFullYear(), new Date(monthStart).getUTCMonth() + 1, 10);
      const items = [{ label: "Monthly tuition", amount: 4500 }];
      if (new Date(monthStart).getUTCMonth() === 9) items.push({ label: "Term exam fee", amount: 600 });
      if (student.transport) items.push({ label: "Transport", amount: 1200 });
      const subtotal = items.reduce((a, i) => a + i.amount, 0);
      const discount = student.siblingDiscount ? Math.round(subtotal * 0.1) : 0;
      const paidRoll = r();
      const total = subtotal - discount;
      const payments = [];
      if (paidRoll < 0.62) {
        payments.push({ amount: total, paidAt: due - int(0, 8) * DAY, method: pick(["Cash", "eSewa", "Bank"]) });
      } else if (paidRoll < 0.82) {
        payments.push({ amount: Math.round(total * 0.5), paidAt: due - int(0, 5) * DAY, method: pick(["Cash", "eSewa"]) });
      }
      serial += 7;
      invoices.push({
        id: `INV-${serial}`,
        studentId: student.id,
        month: new Date(monthStart).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        issuedAt: monthStart,
        dueAt: due,
        items,
        subtotal,
        discount,
        total,
        payments,
      });
    }
  }

  return {
    school: {
      name: "Himalayan Public School",
      address: "Ward 6, Kirtipur, Kathmandu",
      phone: "01-4332211",
      exam: "Term 2 · Midterm",
      academicYear: "2083 B.S.",
    },
    students,
    marks,
    attendance,
    attendanceDays: days,
    invoices,
    generatedAt: now,
    seed,
  };
}
