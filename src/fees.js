/**
 * SchoolKit fees: invoice totals, partial payments and late fees.
 *
 * The rule that matters: a late fee is calculated from the *outstanding
 * balance*, per started week past the due date, and is capped as a share of the
 * invoice total. It is never stored on the invoice, because it depends on the
 * day you ask. `invoiceTotals(invoice, { now })` is the only place that decides
 * what a family owes today.
 */

import { DAY, LATE_FEE_RULE } from "./data.js";

const round = (n) => Math.round(n * 100) / 100;

export function paidAmount(invoice) {
  return invoice.payments.reduce((a, p) => a + p.amount, 0);
}

export function balanceOf(invoice) {
  return Math.max(0, invoice.total - paidAmount(invoice));
}

export function isOverdue(invoice, now = Date.now()) {
  return balanceOf(invoice) > 0 && now > invoice.dueAt;
}

export function daysOverdue(invoice, now = Date.now()) {
  if (!isOverdue(invoice, now)) return 0;
  return Math.floor((now - invoice.dueAt) / DAY);
}

/**
 * Late fee for one invoice: 2% of the outstanding balance per full week past
 * the due date, capped at 20% of the invoice total. The first week after the
 * due date is a grace period, which is how school offices here actually run it.
 */
export function lateFee(invoice, { now = Date.now(), rule = LATE_FEE_RULE } = {}) {
  const balance = balanceOf(invoice);
  if (balance <= 0 || now <= invoice.dueAt) return { amount: 0, periods: 0, capped: false };
  const periods = Math.floor((now - invoice.dueAt) / (rule.periodDays * DAY));
  const raw = balance * rule.ratePerPeriod * periods;
  const cap = invoice.total * rule.capOfTotal;
  const amount = round(Math.min(raw, cap));
  return { amount, periods, capped: raw > cap };
}

/** Everything a family owes on one invoice, as of `now`. */
export function invoiceTotals(invoice, { now = Date.now(), rule = LATE_FEE_RULE } = {}) {
  const paid = paidAmount(invoice);
  const balance = balanceOf(invoice);
  const late = lateFee(invoice, { now, rule });
  const overdue = isOverdue(invoice, now);
  const status = balance <= 0 ? "paid" : overdue ? "overdue" : paid > 0 ? "partial" : "unpaid";
  return {
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    total: invoice.total,
    paid: round(paid),
    balance: round(balance),
    lateFee: late.amount,
    latePeriods: late.periods,
    lateFeeCapped: late.capped,
    payable: round(balance + late.amount),
    overdue,
    daysOverdue: daysOverdue(invoice, now),
    status,
  };
}

/**
 * Record a payment against one invoice. Returns a copy; the caller decides
 * whether to keep it. Overpayment is reported rather than silently swallowed.
 */
export function applyPayment(invoice, amount, { at = Date.now(), method = "Cash" } = {}) {
  const value = Math.max(0, round(amount));
  const balance = balanceOf(invoice);
  const applied = Math.min(value, balance);
  const next = {
    ...invoice,
    payments: [...invoice.payments, { amount: applied, paidAt: at, method }],
  };
  return { invoice: next, applied, excess: round(value - applied) };
}

/**
 * Allocate a single payment across a family's invoices, oldest first. This is
 * how a school office actually takes a lump sum: the oldest unpaid month is
 * cleared before the current one.
 */
export function allocatePayment(invoices, amount, options = {}) {
  let remaining = Math.max(0, round(amount));
  const receipts = [];
  const updated = invoices.map((invoice) => {
    if (remaining <= 0) return invoice;
    const result = applyPayment(invoice, remaining, options);
    if (result.applied > 0) {
      remaining = round(remaining - result.applied);
      receipts.push({ invoiceId: invoice.id, amount: result.applied });
    }
    return result.invoice;
  });
  return { invoices: updated, applied: round(amount - remaining), excess: remaining, receipts };
}

/** Per-student outstanding position, worst first. */
export function outstandingReport(invoices, students, { now = Date.now() } = {}) {
  const rows = students.map((student) => {
    const own = invoices.filter((i) => i.studentId === student.id);
    let billed = 0, paid = 0, balance = 0, late = 0, overdueCount = 0, oldestDue = Infinity;
    for (const invoice of own) {
      const totals = invoiceTotals(invoice, { now });
      billed += totals.total;
      paid += totals.paid;
      balance += totals.balance;
      late += totals.lateFee;
      if (totals.overdue) {
        overdueCount++;
        oldestDue = Math.min(oldestDue, invoice.dueAt);
      }
    }
    return {
      student,
      billed: round(billed),
      paid: round(paid),
      balance: round(balance),
      lateFee: round(late),
      payable: round(balance + late),
      overdueCount,
      oldestDueAt: oldestDue === Infinity ? null : oldestDue,
      status: balance <= 0 ? "cleared" : overdueCount ? "overdue" : "current",
    };
  });
  return rows.sort((a, b) => b.payable - a.payable);
}

/** Collections summary for the dashboard. */
export function collectionSummary(invoices, { now = Date.now() } = {}) {
  let billed = 0, collected = 0, outstanding = 0, lateFees = 0, paidCount = 0, overdueCount = 0;
  for (const invoice of invoices) {
    const totals = invoiceTotals(invoice, { now });
    billed += totals.total;
    collected += totals.paid;
    outstanding += totals.balance;
    lateFees += totals.lateFee;
    if (totals.status === "paid") paidCount++;
    if (totals.overdue) overdueCount++;
  }
  return {
    invoices: invoices.length,
    billed: round(billed),
    collected: round(collected),
    outstanding: round(outstanding),
    lateFees: round(lateFees),
    paidCount,
    overdueCount,
    collectionRate: billed ? collected / billed : 0,
  };
}

/**
 * Ageing by how long the balance has been due, not by invoice date.
 * "Current" means not due yet.
 */
export function agingBuckets(invoices, { now = Date.now() } = {}) {
  const buckets = [
    { label: "Current", min: -Infinity, max: 0, count: 0, value: 0 },
    { label: "1-30 days", min: 1, max: 30, count: 0, value: 0 },
    { label: "31-60 days", min: 31, max: 60, count: 0, value: 0 },
    { label: "60+ days", min: 61, max: Infinity, count: 0, value: 0 },
  ];
  for (const invoice of invoices) {
    const balance = balanceOf(invoice);
    if (balance <= 0) continue;
    const days = Math.floor((now - invoice.dueAt) / DAY);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    bucket.count++;
    bucket.value = round(bucket.value + balance);
  }
  return buckets;
}

/** CSV rows for the fee ledger, oldest invoice first. */
export function ledgerRows(invoices, students, { now = Date.now() } = {}) {
  const byId = new Map(students.map((s) => [s.id, s]));
  return invoices
    .slice()
    .sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id))
    .map((invoice) => {
      const totals = invoiceTotals(invoice, { now });
      const student = byId.get(invoice.studentId);
      return {
        invoice: invoice.id,
        student: student?.name ?? invoice.studentId,
        class: student?.classId ?? "",
        month: invoice.month,
        due: new Date(invoice.dueAt).toISOString().slice(0, 10),
        total: totals.total,
        paid: totals.paid,
        balance: totals.balance,
        lateFee: totals.lateFee,
        status: totals.status,
      };
    });
}
