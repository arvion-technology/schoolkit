import test from "node:test";
import assert from "node:assert/strict";
import {
  paidAmount, balanceOf, isOverdue, daysOverdue, lateFee, invoiceTotals,
  applyPayment, allocatePayment, outstandingReport, collectionSummary,
  agingBuckets, ledgerRows,
} from "../src/fees.js";
import { DAY } from "../src/data.js";

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);

/** A 1,000 invoice due `dueAgo` days before NOW, optionally partly paid. */
const makeInvoice = ({ total = 1000, dueAgo = 0, paid = 0, id = "INV-1" } = {}) => ({
  id,
  studentId: "S-1",
  month: "October 2026",
  issuedAt: NOW - (dueAgo + 30) * DAY,
  dueAt: NOW - dueAgo * DAY,
  items: [{ label: "Tuition", amount: total }],
  subtotal: total,
  discount: 0,
  total,
  payments: paid ? [{ amount: paid, paidAt: NOW - 30 * DAY, method: "Cash" }] : [],
});

test("paid, balance and overdue are derived from the payment list", () => {
  const invoice = makeInvoice({ total: 1000, dueAgo: 10, paid: 400 });
  assert.equal(paidAmount(invoice), 400);
  assert.equal(balanceOf(invoice), 600);
  assert.equal(isOverdue(invoice, NOW), true);
  assert.equal(daysOverdue(invoice, NOW), 10);
  assert.equal(isOverdue(makeInvoice({ paid: 1000 }), NOW), false);
});

test("late fee is zero before the due date and zero once paid", () => {
  assert.equal(lateFee(makeInvoice({ dueAgo: -5 }), { now: NOW }).amount, 0);
  assert.equal(lateFee(makeInvoice({ dueAgo: 3 }), { now: NOW }).amount, 0); // inside the grace week
  assert.equal(lateFee(makeInvoice({ dueAgo: 20, paid: 1000 }), { now: NOW }).amount, 0);
});

test("late fee charges 2 percent of the outstanding balance per full week", () => {
  const fee = lateFee(makeInvoice({ dueAgo: 20 }), { now: NOW });
  assert.equal(fee.periods, 2); // 20 days => two full weeks after the grace week
  assert.equal(fee.amount, 40); // 1000 * 0.02 * 2
  assert.equal(fee.capped, false);
});

test("late fee follows the balance, not the invoice total", () => {
  const fee = lateFee(makeInvoice({ dueAgo: 8, paid: 400 }), { now: NOW });
  assert.equal(fee.periods, 1);
  assert.equal(fee.amount, 12); // 600 * 0.02 * 1
});

test("late fee is capped at 20 percent of the invoice total", () => {
  const fee = lateFee(makeInvoice({ dueAgo: 100 }), { now: NOW });
  assert.equal(fee.amount, 200);
  assert.equal(fee.capped, true);
});

test("invoiceTotals reports status, payable and overdue days", () => {
  const unpaid = invoiceTotals(makeInvoice({ dueAgo: 0 }), { now: NOW });
  assert.equal(unpaid.status, "unpaid");
  assert.equal(unpaid.payable, 1000);

  const partial = invoiceTotals(makeInvoice({ dueAgo: 10, paid: 250 }), { now: NOW });
  assert.equal(partial.status, "overdue");
  assert.equal(partial.balance, 750);
  assert.equal(partial.lateFee, 15); // 750 * 0.02 * 1
  assert.equal(partial.payable, 765);

  const paid = invoiceTotals(makeInvoice({ paid: 1000 }), { now: NOW });
  assert.equal(paid.status, "paid");
  assert.equal(paid.payable, 0);
});

test("applyPayment is partial-aware and reports the excess", () => {
  const invoice = makeInvoice({ total: 1000, paid: 700 });
  const partial = applyPayment(invoice, 200);
  assert.equal(partial.applied, 200);
  assert.equal(partial.excess, 0);
  assert.equal(balanceOf(partial.invoice), 100);

  const over = applyPayment(invoice, 500);
  assert.equal(over.applied, 300);
  assert.equal(over.excess, 200);
  assert.equal(balanceOf(over.invoice), 0);
  // the input is untouched
  assert.equal(invoice.payments.length, 1);
});

test("allocatePayment clears the oldest invoices first", () => {
  const invoices = [
    makeInvoice({ id: "A", total: 100 }),
    makeInvoice({ id: "B", total: 100 }),
    makeInvoice({ id: "C", total: 100 }),
  ];
  const result = allocatePayment(invoices, 250);
  assert.equal(result.applied, 250);
  assert.equal(result.excess, 0);
  assert.deepEqual(result.invoices.map(balanceOf), [0, 0, 50]);
  assert.deepEqual(result.receipts.map((r) => [r.invoiceId, r.amount]), [["A", 100], ["B", 100], ["C", 50]]);
});

test("allocatePayment returns the unapplied remainder", () => {
  const result = allocatePayment([makeInvoice({ total: 100 })], 140);
  assert.equal(result.applied, 100);
  assert.equal(result.excess, 40);
  assert.equal(balanceOf(result.invoices[0]), 0);
});

test("outstandingReport totals each student and sorts by amount payable", () => {
  const students = [
    { id: "S-1", name: "Aarav" },
    { id: "S-2", name: "Sita" },
  ];
  const invoices = [
    makeInvoice({ id: "A", dueAgo: 40, total: 1000, paid: 200 }), // S-1: 800 + 32 late
    makeInvoice({ id: "B", dueAgo: -5, total: 500 }), // S-1: 500 current
    makeInvoice({ id: "C", dueAgo: 5, total: 300, paid: 300 }), // S-2: cleared
  ];
  invoices[1].studentId = "S-1";
  invoices[2].studentId = "S-2";
  const report = outstandingReport(invoices, students, { now: NOW });
  assert.equal(report[0].student.id, "S-1");
  assert.equal(report[0].billed, 1500);
  assert.equal(report[0].paid, 200);
  assert.equal(report[0].balance, 1300);
  assert.equal(report[0].lateFee, 80); // 800 * 0.02 * 5 full weeks
  assert.equal(report[0].payable, 1380);
  assert.equal(report[0].overdueCount, 1);
  assert.equal(report[1].status, "cleared");
});

test("collectionSummary reports billed, collected and the outstanding rate", () => {
  const invoices = [
    makeInvoice({ id: "A", total: 1000, paid: 1000 }),
    makeInvoice({ id: "B", total: 1000, paid: 250, dueAgo: 10 }),
  ];
  const summary = collectionSummary(invoices, { now: NOW });
  assert.equal(summary.billed, 2000);
  assert.equal(summary.collected, 1250);
  assert.equal(summary.outstanding, 750);
  assert.equal(summary.lateFees, 15);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.collectionRate, 0.625);
});

test("ageing buckets use days past due and skip settled invoices", () => {
  const invoices = [
    makeInvoice({ id: "current", total: 100, dueAgo: -10 }),
    { ...makeInvoice({ id: "d10", total: 200, dueAgo: 10 }) },
    { ...makeInvoice({ id: "d45", total: 300, dueAgo: 45 }) },
    { ...makeInvoice({ id: "d90", total: 400, dueAgo: 90 }) },
    { ...makeInvoice({ id: "paid", total: 500, dueAgo: 50, paid: 500 }) },
  ];
  const rows = agingBuckets(invoices, { now: NOW });
  assert.deepEqual(rows.map((r) => [r.label, r.count, r.value]), [
    ["Current", 1, 100],
    ["1-30 days", 1, 200],
    ["31-60 days", 1, 300],
    ["60+ days", 1, 400],
  ]);
});

test("ledgerRows joins students and sorts oldest invoice first", () => {
  const students = [
    { id: "S-1", name: "Aarav Shrestha", classId: "8A" },
    { id: "S-2", name: "Sita Karki", classId: "8A" },
  ];
  const invoices = [
    { ...makeInvoice({ id: "NEW", total: 100, dueAgo: -20 }), studentId: "S-2" },
    { ...makeInvoice({ id: "OLD", total: 100, dueAgo: 40, paid: 100 }), studentId: "S-1" },
  ];
  const rows = ledgerRows(invoices, students, { now: NOW });
  assert.deepEqual(rows.map((r) => r.invoice), ["OLD", "NEW"]);
  assert.equal(rows[0].student, "Aarav Shrestha");
  assert.equal(rows[0].status, "paid");
  assert.equal(rows[1].class, "8A");
});
