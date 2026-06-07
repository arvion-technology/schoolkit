// SchoolKit demo — rendering and interaction only.
// Attendance, GPA, ranking and fee maths all live in ../src/; both the demo and
// the test suite import the same modules.
import { CLASSES, GRADE_SCALE, generateSchool } from "../src/data.js";
import {
  reportCards, rankCards, attendanceStats, registerForDate,
  attendanceByStudent, attendanceTrend, withStatus,
} from "../src/academics.js";
import {
  invoiceTotals, outstandingReport, collectionSummary, agingBuckets,
  allocatePayment,
} from "../src/fees.js";

const $ = A.$, $$ = A.$$, el = A.el, fmt = A.fmt;
const STORE_KEY = "schoolkit";
const STATUSES = [
  { id: "present", short: "P", label: "Present" },
  { id: "late", short: "L", label: "Late" },
  { id: "absent", short: "A", label: "Absent" },
  { id: "excused", short: "E", label: "Excused" },
];
const money = (n) => "Rs " + fmt.num(Math.round(n));
const moneyK = (n) => "Rs " + fmt.compact(n);

/* ------------------------------------------------------------------ state */

const state = {
  view: "dashboard",
  classId: "8A",
  dayIndex: 0,
  ledgerPage: 0,
  rcClass: "10A",
  rcStudent: null,
};

function freshData() {
  return generateSchool({ now: Date.now() });
}

function restore() {
  const fresh = freshData();
  const saved = A.store.get(STORE_KEY, null);
  if (saved && Array.isArray(saved.attendance) && Array.isArray(saved.invoices)) {
    return { ...fresh, attendance: saved.attendance, invoices: saved.invoices };
  }
  return fresh;
}

let data = restore();
state.dayIndex = data.attendanceDays.length - 1;

function persist() {
  A.store.set(STORE_KEY, { attendance: data.attendance, invoices: data.invoices });
}

const classOf = (id) => CLASSES.find((c) => c.id === id) ?? CLASSES[0];
const classList = (classId) => data.students.filter((s) => s.classId === classId);
const dateLabel = (ts) => new Date(ts).toLocaleDateString("en-US", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
const shortDate = (ts) => new Date(ts).toLocaleDateString("en-US", {
  month: "short", day: "numeric", timeZone: "UTC",
});

/* ------------------------------------------------------------- components */

const invoiceStatusBadge = (status) => {
  const tone = status === "paid" ? "green" : status === "overdue" ? "red" : status === "partial" ? "gold" : "";
  return el("span", { class: `badge ${tone}`, text: status });
};

const studentBadge = (student) => el("div", { class: "row", style: "gap:8px" },
  el("span", { class: "avatar sm", text: fmt.initials(student.name) }),
  el("div", {},
    el("div", { class: "strong", style: "font-size:12.5px", text: student.name }),
    el("div", { class: "small muted", text: `${classOf(student.classId).label} · roll ${student.roll}` })));

function statCard({ label, value, sub, tone = "" }) {
  const color = tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : tone === "blue" ? "#8fb4ff" : "var(--gold)";
  return el("div", { class: "card" },
    el("div", { class: "stat" },
      el("div", { class: "stat-label", text: label }),
      el("div", { class: "stat-value", style: `color:${color}`, text: value }),
      el("div", { class: "small muted", text: sub })));
}

/* -------------------------------------------------------------- dashboard */

/**
 * A small column chart for the dashboard. arvion.js's line chart forces a zero
 * baseline, which turns a 90-100% attendance series into a flat line; plotting
 * the daily absence and late counts instead shows the shape of the week.
 */
function absenceChart(trend, { width = 700, height = 120 } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const pad = { t: 10, r: 6, b: 22, l: 26 };
  const max = Math.max(4, ...trend.map((t) => Math.max(t.absent, t.late)));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = innerW / trend.length;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Absences and late arrivals per school day");

  for (let v = 0; v <= max; v++) {
    const y = pad.t + innerH - (v / max) * innerH;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", pad.l); line.setAttribute("x2", width - pad.r);
    line.setAttribute("y1", y); line.setAttribute("y2", y);
    line.setAttribute("class", v === 0 ? "axis" : "gridline");
    svg.append(line);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pad.l - 8); label.setAttribute("y", y + 3);
    label.setAttribute("text-anchor", "end"); label.setAttribute("class", "label");
    label.textContent = String(v);
    svg.append(label);
  }

  const barW = Math.max(2.5, step * 0.26);
  trend.forEach((day, i) => {
    const x = pad.l + i * step + step / 2;
    const pairs = [
      { value: day.late, color: "#3a7bff", dx: -barW * 0.62 },
      { value: day.absent, color: "#f5c26b", dx: barW * 0.62 },
    ];
    for (const bar of pairs) {
      if (bar.value <= 0) continue;
      const h = (bar.value / max) * innerH;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x + bar.dx - barW / 2);
      rect.setAttribute("y", pad.t + innerH - h);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", h);
      rect.setAttribute("rx", 1.5);
      rect.setAttribute("fill", bar.color);
      rect.setAttribute("opacity", bar.color === "#3a7bff" ? "0.75" : "1");
      const tip = document.createElementNS(ns, "title");
      tip.textContent = `${shortDate(day.date)} · ${day.absent} absent, ${day.late} late`;
      rect.append(tip);
      svg.append(rect);
    }
  });

  trend.forEach((day, i) => {
    if (i % 5 !== 0 && i !== trend.length - 1) return;
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", pad.l + i * step + step / 2);
    label.setAttribute("y", height - 6);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "label");
    label.textContent = shortDate(day.date);
    svg.append(label);
  });
  return svg;
}

function renderDashboard() {
  const today = data.attendanceDays.at(-1);
  const todayStats = attendanceStats(data.attendance.filter((a) => a.date === today));
  const fees = collectionSummary(data.invoices);
  const positions = outstandingReport(data.invoices, data.students);
  const owing = positions.filter((p) => p.balance > 0).length;

  $("#today").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  $("#dash-kpis").replaceChildren(
    statCard({ label: "Students", value: String(data.students.length), sub: "3 sections · grades 8 to 10" }),
    statCard({
      label: "Present today", value: fmt.pct(todayStats.total ? todayStats.present / todayStats.total : 0, 1),
      sub: `${todayStats.present} present · ${todayStats.late} late · ${todayStats.absent} absent`,
      tone: todayStats.total && todayStats.present / todayStats.total >= 0.9 ? "green" : "gold",
    }),
    statCard({ label: "Fees outstanding", value: moneyK(fees.outstanding), sub: `${owing} students with a balance`, tone: "red" }),
    statCard({ label: "Late fees accrued", value: moneyK(fees.lateFees), sub: `${fees.overdueCount} overdue invoices` }),
  );

  const trend = attendanceTrend(data.attendance, data.attendanceDays);
  $("#attendance-chart").replaceChildren(absenceChart(trend));

  $("#fees-donut").replaceChildren(A.donut({
    slices: [
      { label: "Collected", value: fees.collected, color: "#34d399" },
      { label: "Outstanding", value: fees.outstanding, color: "#f5c26b" },
    ],
    size: 152,
    thickness: 20,
    centerValue: fmt.pct(fees.collectionRate, 0),
    centerLabel: "collected",
  }));
  $("#fees-legend").replaceChildren(
    el("div", { class: "row", style: "gap:9px" },
      el("i", { style: "width:9px;height:9px;border-radius:3px;background:#34d399" }),
      el("span", { text: "Collected" }), el("span", { class: "spacer" }),
      el("span", { class: "mono small nowrap", text: moneyK(fees.collected) })),
    el("div", { class: "row", style: "gap:9px" },
      el("i", { style: "width:9px;height:9px;border-radius:3px;background:#f5c26b" }),
      el("span", { text: "Outstanding" }), el("span", { class: "spacer" }),
      el("span", { class: "mono small nowrap", text: moneyK(fees.outstanding) })),
    el("div", { class: "divider", style: "margin:2px 0" }),
    el("div", { class: "row" }, el("span", { class: "small muted", text: "Billed" }), el("span", { class: "spacer" }), el("span", { class: "mono small", text: moneyK(fees.billed) })),
    el("div", { class: "row" }, el("span", { class: "small muted", text: "Invoices" }), el("span", { class: "spacer" }), el("span", { class: "mono small", text: String(fees.invoices) })),
  );

  $("#class-date").textContent = shortDate(today);
  $("#class-cards").replaceChildren(...CLASSES.map((cls) => {
    const ids = new Set(classList(cls.id).map((s) => s.id));
    const rows = data.attendance.filter((a) => a.date === today && ids.has(a.studentId));
    const stats = attendanceStats(rows);
    const unmarked = ids.size - rows.length;
    const presentShare = ids.size ? stats.present / ids.size : 0;
    return el("div", { class: "class-row", style: "cursor:pointer", onclick: () => { state.classId = cls.id; location.hash = "#attendance"; } },
      el("div", { class: "row", style: "margin-bottom:5px" },
        el("span", { class: "strong", style: "font-size:12.5px", text: cls.label }),
        el("span", { class: "badge", text: cls.room }),
        el("span", { class: "spacer" }),
        el("span", { class: "mono", style: "color:" + (presentShare >= 0.9 ? "var(--green)" : "var(--gold)"), text: fmt.pct(presentShare, 0) })),
      el("div", { class: "progress green" }, el("i", { style: `width:${presentShare * 100}%` })),
      el("div", { class: "row", style: "margin-top:4px;font-size:11px;color:var(--muted)" },
        el("span", { text: `${stats.present} present · ${stats.late} late · ${stats.absent + stats.excused} absent` }),
        el("span", { class: "spacer" }),
        unmarked > 0 ? el("span", { class: "badge red", text: `${unmarked} unmarked` }) : el("span", { class: "badge green", text: "complete" })));
  }));

  const attendance = attendanceByStudent(data.attendance);
  const toppers = CLASSES.map((cls) => {
    const ranked = rankCards(reportCards(classList(cls.id), data.marks));
    return { cls, top: ranked[0], attendance: attendance[ranked[0]?.student.id] };
  }).filter((t) => t.top);
  $("#toppers-table").replaceChildren(A.dataTable({
    columns: [
      { label: "Class", width: "90px", render: (t) => el("span", { class: "badge gold", text: t.cls.label.replace("Grade ", "") }) },
      {
        label: "Student",
        render: (t) => el("div", { class: "row", style: "gap:8px" },
          el("span", { class: "avatar sm", text: fmt.initials(t.top.student.name) }),
          el("span", { class: "strong", style: "font-size:12.5px", text: t.top.student.name })),
      },
      { label: "GPA", align: "right", render: (t) => el("span", { class: "mono strong", text: t.top.gpa.toFixed(2) }) },
      { label: "Grade", align: "right", render: (t) => el("span", { class: "badge green", text: t.top.grade }) },
      { label: "Attendance", align: "right", render: (t) => el("span", { class: "mono small muted", text: fmt.pct(t.attendance?.rate ?? 0, 0) }) },
    ],
    rows: toppers,
  }));
}

/* ------------------------------------------------------------- attendance */

function setStatus(studentId, status) {
  const date = data.attendanceDays[state.dayIndex];
  data.attendance = withStatus(data.attendance, studentId, date, status);
  persist();
  renderAttendance();
  const note = $("#save-note");
  note.textContent = "Saved in this browser";
  note.style.color = "var(--green)";
}

function renderAttendance() {
  const tabs = $("#class-tabs");
  tabs.replaceChildren(...CLASSES.map((cls) => el("button", {
    class: `tab ${cls.id === state.classId ? "active" : ""}`,
    onclick: () => { state.classId = cls.id; renderAttendance(); },
    text: cls.label,
  })));

  const date = data.attendanceDays[state.dayIndex];
  $("#register-date").textContent = dateLabel(date);
  $("#day-prev").disabled = state.dayIndex <= 0 ? "" : null;
  $("#day-next").disabled = state.dayIndex >= data.attendanceDays.length - 1 ? "" : null;

  const students = classList(state.classId);
  const perStudent = attendanceByStudent(data.attendance);
  const rows = registerForDate(data.attendance, students, date);

  const table = el("table", { class: "table" });
  table.append(el("thead", {}, el("tr", {},
    el("th", { style: "width:34px", text: "Roll" }),
    el("th", { text: "Student" }),
    el("th", { style: "width:166px", text: "Status" }),
    el("th", { class: "num", text: "This term" }),
    el("th", { text: "Guardian" }))));
  const tbody = el("tbody");
  for (const row of rows) {
    const stats = perStudent[row.student.id];
    tbody.append(el("tr", {},
      el("td", {}, el("span", { class: "roll", text: String(row.student.roll) })),
      el("td", {}, el("div", {},
        el("div", { class: "strong", style: "font-size:12.5px", text: row.student.name }),
        el("div", { class: "small muted", text: row.student.address }))),
      el("td", {}, el("div", { class: "status-group", role: "group", "aria-label": `Attendance for ${row.student.name}` },
        ...STATUSES.map((s) => el("button", {
          class: `status-btn ${s.id}`,
          "aria-pressed": row.status === s.id ? "true" : "false",
          title: s.label,
          onclick: () => setStatus(row.student.id, s.id),
          text: s.short,
        })))),
      el("td", { class: "num" }, el("div", {},
        el("span", { class: "mono small", text: fmt.pct(stats?.rate ?? 0, 0) }),
        el("div", { class: "small muted", text: `${stats?.present ?? 0}P · ${stats?.absent ?? 0}A` }))),
      el("td", {}, el("div", {},
        el("div", { class: "small", text: row.student.guardian.name }),
        el("div", { class: "small muted mono", text: row.student.guardian.phone })))));
  }
  table.append(tbody);
  $("#register-table").replaceChildren(el("div", { class: "table-wrap" }, table));

  const ids = new Set(students.map((s) => s.id));
  const records = data.attendance.filter((a) => a.date === date && ids.has(a.studentId));
  const stats = attendanceStats(records);
  const unmarked = students.length - records.length;
  $("#register-summary").replaceChildren(
    el("div", { class: "row", style: "align-items:baseline;gap:8px" },
      el("span", { class: "stat-value", style: "font-size:30px;color:" + (stats.rate >= 0.9 ? "var(--green)" : "var(--gold)"), text: fmt.pct(stats.rate, 1) }),
      el("span", { class: "small muted", text: "attended rate (P + L)" })),
    el("div", { class: "progress green mt-2" }, el("i", { style: `width:${stats.rate * 100}%` })),
    el("div", { class: "divider" }),
    el("dl", { class: "kv" },
      el("dt", { text: "Present" }), el("dd", { class: "mono", text: String(stats.present) }),
      el("dt", { text: "Late" }), el("dd", { class: "mono", text: String(stats.late) }),
      el("dt", { text: "Absent" }), el("dd", { class: "mono", text: String(stats.absent) }),
      el("dt", { text: "Excused" }), el("dd", { class: "mono", text: String(stats.excused) }),
      el("dt", { text: "Unmarked" }), el("dd", { class: "mono", text: String(unmarked) }),
      el("dt", { text: "Class teacher" }), el("dd", { text: classOf(state.classId).teacher })));
}

/* ------------------------------------------------------------------- fees */

function studentInvoices(studentId) {
  return data.invoices.filter((i) => i.studentId === studentId);
}

function openPayment(studentId) {
  const student = data.students.find((s) => s.id === studentId);
  const invoices = studentInvoices(studentId);
  const dues = outstandingReport(invoices, [student])[0];
  const detail = invoices.map((invoice) => ({ invoice, totals: invoiceTotals(invoice) }));
  const amountInput = el("input", {
    class: "input", id: "pay-amount", type: "number", min: "0", step: "10",
    value: String(Math.ceil(dues.payable)), "aria-label": "Amount",
  });
  const method = el("select", { class: "select", id: "pay-method" },
    ...["Cash", "eSewa", "Khalti", "Bank"].map((m) => el("option", { value: m, text: m })));

  A.modal({
    title: `${student.name} — collect payment`,
    body: el("div", { class: "col", style: "gap:14px" },
      el("div", { class: "invoice-list" },
        ...detail.map(({ invoice, totals }) => el("div", { class: `invoice-row${totals.overdue ? " overdue" : ""}` },
          el("div", {},
            el("div", { class: "strong", style: "font-size:12px", text: invoice.month }),
            el("div", { class: "small muted", text: `Due ${fmt.date(invoice.dueAt)}${totals.daysOverdue ? ` · ${totals.daysOverdue}d late` : ""}` })),
          el("div", { style: "text-align:right" },
            el("div", { class: "mono small", text: totals.balance > 0 ? money(totals.balance) : "settled" }),
            totals.lateFee ? el("div", { class: "small", style: "color:var(--red)", text: `+ ${money(totals.lateFee)} late fee` }) : null),
          invoiceStatusBadge(totals.status)))),
      el("div", { class: "row" },
        el("div", { style: "flex:1" }, el("label", { class: "field" }, el("span", { text: "Amount received" }), amountInput)),
        el("div", { style: "width:130px" }, el("label", { class: "field" }, el("span", { text: "Method" }), method))),
      el("p", { class: "small muted mb-0", text: `Payable today is ${money(dues.payable)}: ${money(dues.balance)} principal and ${money(dues.lateFee)} in late fees. A payment is allocated to the oldest invoice first.` })),
    actions: [
      { label: "Cancel" },
      {
        label: "Record payment", kind: "primary", onClick: () => {
          const amount = Number($("#pay-amount")?.value ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) { A.toast("Enter an amount above zero", "error"); return false; }
          collect(studentId, amount, $("#pay-method")?.value ?? "Cash");
          return true;
        },
      },
    ],
  });
}

function collect(studentId, amount, method) {
  const own = studentInvoices(studentId);
  const result = allocatePayment(own, amount, { at: Date.now(), method });
  const updated = new Map(result.invoices.map((i) => [i.id, i]));
  data.invoices = data.invoices.map((i) => updated.get(i.id) ?? i);
  persist();
  renderFees();
  const name = data.students.find((s) => s.id === studentId).name;
  if (result.excess > 0) A.toast(`Received ${money(result.applied)}; ${money(result.excess)} returned as excess`, "error", 4200);
  else A.toast(`Recorded ${money(result.applied)} for ${name}`, "success");
}

function renderFees() {
  const summary = collectionSummary(data.invoices);
  const positions = outstandingReport(data.invoices, data.students);
  const owing = positions.filter((p) => p.balance > 0);

  $("#fees-kpis").replaceChildren(
    statCard({ label: "Billed · 3 months", value: moneyK(summary.billed), sub: `${summary.invoices} invoices` }),
    statCard({ label: "Collected", value: moneyK(summary.collected), sub: `${fmt.pct(summary.collectionRate, 1)} of billed`, tone: "green" }),
    statCard({ label: "Outstanding", value: moneyK(summary.outstanding), sub: `${owing.length} students owe money`, tone: "red" }),
    statCard({ label: "Late fees", value: moneyK(summary.lateFees), sub: `${summary.overdueCount} invoices past due` }),
  );

  const perPage = 10;
  const pages = Math.max(1, Math.ceil(positions.length / perPage));
  state.ledgerPage = Math.min(state.ledgerPage, pages - 1);
  const slice = positions.slice(state.ledgerPage * perPage, state.ledgerPage * perPage + perPage);
  $("#ledger-count").textContent = `${positions.length} students`;
  $("#ledger-page-info").textContent = `Page ${state.ledgerPage + 1} of ${pages} · ${money(summary.outstanding)} outstanding`;
  $("#ledger-table").replaceChildren(A.dataTable({
    columns: [
      { label: "Student", render: (p) => studentBadge(p.student) },
      { label: "Billed", align: "right", render: (p) => el("span", { class: "mono small muted", text: moneyK(p.billed) }) },
      { label: "Paid", align: "right", render: (p) => el("span", { class: "mono small", text: moneyK(p.paid) }) },
      { label: "Balance", align: "right", render: (p) => el("span", { class: "mono", text: moneyK(p.balance) }) },
      { label: "Late fee", align: "right", render: (p) => el("span", { class: "mono small", style: p.lateFee ? "color:var(--red)" : "color:var(--muted)", text: p.lateFee ? moneyK(p.lateFee) : "—" }) },
      { label: "Payable", align: "right", render: (p) => el("span", { class: "mono strong", text: moneyK(p.payable) }) },
      { label: "Status", align: "right", render: (p) => invoiceStatusBadge(p.status) },
      {
        label: "", align: "right", render: (p) => el("button", {
          class: "btn sm" + (p.payable > 0 ? " primary" : ""),
          disabled: p.payable > 0 ? null : "",
          onclick: (e) => { e.stopPropagation(); if (p.payable > 0) openPayment(p.student.id); },
          text: p.payable > 0 ? "Collect" : "Cleared",
        }),
      },
    ],
    rows: slice,
    onRowClick: (p) => { if (p.payable > 0) openPayment(p.student.id); },
  }));

  $("#aging-panel").replaceChildren(A.barList({
    rows: agingBuckets(data.invoices).map((b) => ({ label: `${b.label} · ${b.count}`, value: b.value })),
    format: moneyK,
  }));

  const receipts = [];
  for (const invoice of data.invoices) {
    const student = data.students.find((s) => s.id === invoice.studentId);
    for (const payment of invoice.payments) receipts.push({ payment, invoice, student });
  }
  receipts.sort((a, b) => b.payment.paidAt - a.payment.paidAt);
  $("#receipts-panel").replaceChildren(...receipts.slice(0, 6).map(({ payment, invoice, student }) => el("div", { class: "receipt-row" },
    el("span", { class: "avatar", style: "width:24px;height:24px;font-size:9px", text: fmt.initials(student.name) }),
    el("div", { style: "min-width:0" },
      el("div", { class: "strong", style: "font-size:12px", text: student.name }),
      el("div", { class: "small muted", text: `${invoice.month} · ${payment.method}` })),
    el("span", { class: "spacer" }),
    el("div", { style: "text-align:right" },
      el("div", { class: "mono small", text: money(payment.amount) }),
      el("div", { class: "small muted", text: fmt.date(payment.paidAt) })))));
}

/* -------------------------------------------------------------- report card */

function renderReportCard() {
  const classSelect = $("#rc-class");
  classSelect.replaceChildren(...CLASSES.map((c) => el("option", {
    value: c.id, text: c.label, selected: c.id === state.rcClass ? "" : null,
  })));
  const students = classList(state.rcClass);
  const ranked = rankCards(reportCards(students, data.marks));
  if (!state.rcStudent || !students.some((s) => s.id === state.rcStudent)) {
    state.rcStudent = ranked[0]?.student.id ?? students[0]?.id;
  }
  $("#rc-student").replaceChildren(...ranked.map((card) => el("option", {
    value: card.student.id,
    text: `${card.student.name} · GPA ${card.gpa.toFixed(2)}`,
    selected: card.student.id === state.rcStudent ? "" : null,
  })));

  const card = ranked.find((c) => c.student.id === state.rcStudent) ?? ranked[0];
  if (!card) { $("#report-sheet").replaceChildren(); return; }
  const attendance = attendanceByStudent(data.attendance)[card.student.id] ?? { rate: 0, present: 0, total: 0 };
  const classSize = students.length;
  const cls = classOf(state.rcClass);
  const gradeTone = (grade) => (grade === "NG" || grade === "D" ? "bad" : ["A+", "A", "B+"].includes(grade) ? "good" : "");

  $("#report-sheet").replaceChildren(...[
    el("div", { class: "rc-head" },
      el("div", { class: "rc-mark", text: "HP" }),
      el("div", {},
        el("h2", { text: data.school.name }),
        el("div", { class: "rc-addr", text: `${data.school.address} · ${data.school.phone}` })),
      el("div", { class: "rc-exam" },
        el("span", { text: "Report card" }),
        el("strong", { text: `${data.school.exam} · ${data.school.academicYear}` }))),

    el("div", { class: "rc-student" },
      el("div", { class: "rc-field" }, el("span", { text: "Student" }), el("b", { text: card.student.name })),
      el("div", { class: "rc-field" }, el("span", { text: "Class & section" }), el("b", { text: cls.label })),
      el("div", { class: "rc-field" }, el("span", { text: "Roll number" }), el("b", { text: String(card.student.roll) })),
      el("div", { class: "rc-field" }, el("span", { text: "Guardian" }), el("b", { text: `${card.student.guardian.name} (${card.student.guardian.relation})` })),
      el("div", { class: "rc-field" }, el("span", { text: "Attendance" }), el("b", { text: `${fmt.pct(attendance.rate, 0)} · ${attendance.present} of ${attendance.total} days` })),
      el("div", { class: "rc-field" }, el("span", { text: "Rank in section" }), el("b", { text: `${card.rank} of ${classSize}` })),
      el("div", { class: "rc-field" }, el("span", { text: "Exam" }), el("b", { text: "Term 2 midterm" })),
      el("div", { class: "rc-field" }, el("span", { text: "Published" }), el("b", { text: dateLabel(Date.now()) }))),

    el("table", {},
      el("thead", {}, el("tr", {},
        el("th", { text: "Subject" }), el("th", { class: "num", text: "Credits" }),
        el("th", { class: "num", text: "Marks" }), el("th", { class: "num", text: "Percent" }),
        el("th", { class: "num", text: "Grade" }), el("th", { class: "num", text: "GPA" }),
        el("th", { text: "Remark" }))),
      el("tbody", {},
        ...card.rows.map((row) => el("tr", { class: row.pass ? "" : "fail-row" },
          el("td", { class: "strong", text: row.name }),
          el("td", { class: "num", text: String(row.credits) }),
          el("td", { class: "num", text: `${row.marks} / ${row.fullMarks}` }),
          el("td", { class: "num", text: fmt.pct(row.percent / 100, 1) }),
          el("td", { class: "num" }, el("span", { class: `grade-pill ${gradeTone(row.grade)}`, text: row.grade })),
          el("td", { class: "num", text: row.gpa.toFixed(1) }),
          el("td", { text: row.pass ? row.label : "Needs support" }))))),

    el("div", { class: "rc-summary" },
      el("div", { class: "rc-box" }, el("span", { text: "Total" }), el("b", { text: `${card.totalMarks} / ${card.totalFull}` })),
      el("div", { class: "rc-box" }, el("span", { text: "Percent" }), el("b", { text: fmt.pct(card.percent / 100, 1) })),
      el("div", { class: "rc-box" }, el("span", { text: "GPA" }), el("b", { text: card.gpa.toFixed(2) })),
      el("div", { class: "rc-box" }, el("span", { text: "Grade" }), el("b", { text: card.grade })),
      el("div", { class: "rc-box" }, el("span", { text: "Rank" }), el("b", { text: `${card.rank} / ${classSize}` })),
      el("div", { class: `rc-box result${card.pass ? "" : " fail"}` }, el("span", { text: "Result" }), el("b", { text: card.pass ? "Pass" : "Fail" }))),

    card.pass ? null : el("p", { style: "margin:14px 0 0;font-size:12px;color:#b91c1c" },
      `Not promoted on this result: ${card.failedSubjects.join(", ")} below 40 percent.`),

    el("div", { class: "rc-foot" },
      el("div", { class: "rc-sign", style: "flex:1.25" }, el("div", { class: "line" }), el("span", { style: "white-space:nowrap", text: `Class teacher · ${cls.teacher}` })),
      el("div", { class: "rc-sign" }, el("div", { class: "line" }), el("span", { text: "Principal" })),
      el("div", { class: "rc-sign" }, el("div", { class: "line" }), el("span", { text: "Guardian" })),
      el("div", { class: "rc-scale" },
        el("div", { text: "GPA is credit-weighted across seven subjects (24 credits)." }),
        el("div", { text: GRADE_SCALE.map((s) => `${s.grade} ${s.min}+`).join(" · ") + " (percent)" }),
        el("div", { class: "rc-demo", text: `Synthetic data · ${card.student.id} · ${data.school.exam}` }))),
  ].filter(Boolean));
}

/* ----------------------------------------------------------------- routing */

const VIEWS = ["dashboard", "attendance", "fees", "report-card"];

function route() {
  const requested = (location.hash || "#dashboard").slice(1).split("/")[0];
  state.view = VIEWS.includes(requested) ? requested : "dashboard";
  $$("[data-view-panel]").forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== state.view; });
  $$("[data-view]").forEach((a) => a.classList.toggle("active", a.dataset.view === state.view));
  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "attendance") renderAttendance();
  else if (state.view === "fees") renderFees();
  else if (state.view === "report-card") renderReportCard();
  window.scrollTo({ top: 0 });
}

/* -------------------------------------------------------------------- wire */

function wire() {
  $("#today").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  $("#term-badge").textContent = data.school.exam;

  $("#day-prev").addEventListener("click", () => { state.dayIndex = Math.max(0, state.dayIndex - 1); renderAttendance(); });
  $("#day-next").addEventListener("click", () => {
    state.dayIndex = Math.min(data.attendanceDays.length - 1, state.dayIndex + 1);
    renderAttendance();
  });

  $("#dash-goto-fees").addEventListener("click", () => { location.hash = "#fees"; });
  $("#dash-goto-register").addEventListener("click", () => { location.hash = "#attendance"; });

  $("#ledger-prev").addEventListener("click", () => { state.ledgerPage = Math.max(0, state.ledgerPage - 1); renderFees(); });
  $("#ledger-next").addEventListener("click", () => { state.ledgerPage++; renderFees(); });

  $("#rc-class").addEventListener("change", (e) => {
    state.rcClass = e.target.value;
    state.rcStudent = null;
    renderReportCard();
  });
  $("#rc-student").addEventListener("change", (e) => {
    state.rcStudent = e.target.value;
    renderReportCard();
  });
  $("#print-card").addEventListener("click", () => window.print());

  $("#reset-data").addEventListener("click", () => {
    A.store.remove(STORE_KEY);
    data = freshData();
    state.dayIndex = data.attendanceDays.length - 1;
    state.ledgerPage = 0;
    state.rcStudent = null;
    route();
    A.toast("Demo data regenerated from the seed", "success");
  });

  window.addEventListener("hashchange", route);
}

wire();
route();
