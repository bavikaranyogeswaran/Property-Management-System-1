import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import db from '../../../config/db.js';
import notificationModel from '../../../models/notificationModel.js';
import emailService from '../../../utils/emailService.js';
import { today } from '../../../utils/dateUtils.js';
import {
  sendLeaseExpiryWarnings,
  checkLeaseExpiration,
  syncUnitStatuses,
  expireDraftLeases,
  activateUpcomingLeases,
} from '../../../utils/cron/leaseJobs.js';

// NOTE: dateUtils is deliberately NOT mocked. These jobs previously threw
// `ReferenceError: now is not defined` because leaseJobs.js used now()/today()/
// addDays()/formatToLocalDate() without importing them. Using the real module is
// what makes this a regression test for that missing import.

vi.mock('../../../config/db.js', () => ({
  default: {
    query: vi.fn().mockResolvedValue([[]]),
    getConnection: vi.fn(),
  },
}));

vi.mock('../../../models/notificationModel.js', () => ({
  default: { create: vi.fn().mockResolvedValue(1) },
}));

vi.mock('../../../models/leaseModel.js', () => ({ default: {} }));
vi.mock('../../../models/invoiceModel.js', () => ({ default: {} }));

vi.mock('../../../utils/emailService.js', () => ({
  default: { sendLeaseExpiryReminder: vi.fn().mockResolvedValue(true) },
}));

// Run the guarded task inline so the job body is actually exercised.
vi.mock('../../../utils/distributionLock.js', () => {
  const runWithLock = vi.fn(async (_lockName, _ttl, taskFn) => ({
    success: true,
    result: await taskFn(),
  }));
  return { runWithLock, default: { runWithLock } };
});

const mockConnection = () => ({
  beginTransaction: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  rollback: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
  query: vi.fn().mockResolvedValue([[]]),
});

/** Whole days between two YYYY-MM-DD strings, timezone-independent. */
const dayDiff = (from, to) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
  );

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('leaseJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fake only Date so the date math is stable across a midnight rollover;
    // timers stay real so awaited promises resolve normally.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T09:00:00'));
    db.query.mockResolvedValue([[]]);
    db.getConnection.mockResolvedValue(mockConnection());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sendLeaseExpiryWarnings', () => {
    it('runs without throwing (regression: ReferenceError on now())', async () => {
      await expect(sendLeaseExpiryWarnings()).resolves.toBeUndefined();
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('queries for leases expiring exactly 30 and 60 days out', async () => {
      await sendLeaseExpiryWarnings();

      const [, params] = db.query.mock.calls[0];
      const [dateStr30, dateStr60] = params;

      expect(dateStr30).toMatch(ISO_DATE);
      expect(dateStr60).toMatch(ISO_DATE);

      const todayStr = today();
      expect(dayDiff(todayStr, dateStr30)).toBe(30);
      expect(dayDiff(todayStr, dateStr60)).toBe(60);
    });

    it('notifies and emails both tenant and owner for an expiring lease', async () => {
      const todayStr = today();

      // Capture the 30-day date the job computed, and echo it back as the
      // lease's end_date so the "expiring in 30 days" branch is taken.
      let dateStr30;
      db.query.mockImplementationOnce(async (_sql, params) => {
        dateStr30 = params[0];
        return [
          [
            {
              lease_id: 7,
              tenant_id: 42,
              owner_id: 9,
              unit_number: 'A-101',
              property_name: 'Palm Grove',
              tenant_email: 'tenant@example.com',
              owner_email: 'owner@example.com',
              end_date: params[0],
            },
          ],
        ];
      });

      await sendLeaseExpiryWarnings();

      expect(dayDiff(todayStr, dateStr30)).toBe(30);

      expect(notificationModel.create).toHaveBeenCalledTimes(2);
      const [tenantNote] = notificationModel.create.mock.calls[0];
      const [ownerNote] = notificationModel.create.mock.calls[1];
      expect(tenantNote.userId).toBe(42);
      expect(tenantNote.message).toContain('expiring in 30 days');
      expect(ownerNote.userId).toBe(9);
      expect(ownerNote.message).toContain('A-101');

      expect(emailService.sendLeaseExpiryReminder).toHaveBeenCalledTimes(2);
      expect(emailService.sendLeaseExpiryReminder).toHaveBeenCalledWith(
        'tenant@example.com',
        expect.objectContaining({ daysCount: 30, propertyName: 'Palm Grove' })
      );
    });

    it('sends nothing when no leases are expiring', async () => {
      db.query.mockResolvedValueOnce([[]]);

      await sendLeaseExpiryWarnings();

      expect(notificationModel.create).not.toHaveBeenCalled();
      expect(emailService.sendLeaseExpiryReminder).not.toHaveBeenCalled();
    });
  });

  // These four shared the same missing-import defect. checkLeaseExpiration and
  // syncUnitStatuses additionally called .getFullYear() on today()'s string.
  describe('date helpers are wired up in every exported job', () => {
    it.each([
      ['checkLeaseExpiration', checkLeaseExpiration],
      ['syncUnitStatuses', syncUnitStatuses],
      ['expireDraftLeases', expireDraftLeases],
      ['activateUpcomingLeases', activateUpcomingLeases],
    ])('%s runs without a ReferenceError or TypeError', async (_name, job) => {
      await expect(job()).resolves.not.toThrow();
    });

    it('passes YYYY-MM-DD strings to syncUnitStatuses date comparisons', async () => {
      await syncUnitStatuses();

      expect(db.query).toHaveBeenCalled();
      const [, params] = db.query.mock.calls[0];
      params.forEach((p) => expect(p).toMatch(ISO_DATE));
    });
  });
});
