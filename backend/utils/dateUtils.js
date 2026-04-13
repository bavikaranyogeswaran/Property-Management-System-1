/**
 * Date Utilities for Timezone-Aware Operations
 * Default Timezone: Asia/Colombo (UTC+5:30)
 */

const DEFAULT_TIMEZONE = 'Asia/Colombo';

/**
 * Returns the current date as an ISO string (YYYY-MM-DD) in the target timezone.
 * @param {string} timezone
 * @returns {string} YYYY-MM-DD
 */
export const getCurrentDateString = (timezone = DEFAULT_TIMEZONE) => {
  const options = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  // 'en-CA' locale conveniently returns YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', options).format(new Date());
  return parts;
};

/**
 * Formats a Date object to a local date string (YYYY-MM-DD).
 * @param {Date} date
 * @param {string} timezone
 * @returns {string} YYYY-MM-DD
 */
export const formatToLocalDate = (date, timezone = DEFAULT_TIMEZONE) => {
  if (!date) return null;
  const options = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  return new Intl.DateTimeFormat('en-CA', options).format(new Date(date));
};

export const getLocalTime = (timezone = DEFAULT_TIMEZONE) => {
  // Since process.env.TZ is set globally, new Date() is natively in the target timezone.
  return new Date();
};

/**
 * Returns a new Date object representing the current time in the target timezone.
 */
export const now = (timezone = DEFAULT_TIMEZONE) => {
  return getLocalTime(timezone);
};

/**
 * Returns the current date as an ISO string (YYYY-MM-DD) in the target timezone.
 */
export const today = (timezone = DEFAULT_TIMEZONE) => {
  return getCurrentDateString(timezone);
};

/**
 * Safely parses a YYYY-MM-DD string into a Date object at midnight in the target timezone.
 * Avoids the "one day off" bug common with new Date('YYYY-MM-DD').
 * @param {string} dateStr
 * @param {string} timezone
 * @returns {Date}
 */
export const parseLocalDate = (dateStr, timezone = DEFAULT_TIMEZONE) => {
  if (!dateStr) return null;
  // If it's already a Date object, just return it
  if (dateStr instanceof Date) return dateStr;

  // Robustness check: Ensure we have a string
  if (typeof dateStr !== 'string') {
    console.warn(
      `[dateUtils] parseLocalDate received non-string/non-date value:`,
      dateStr
    );
    return null;
  }

  // If it's YYYY-MM-DD, append time to ensure local interpretation (midnight)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T00:00:00`);
  }
  return new Date(dateStr);
};

/**
 * Adds a specified number of days to a Date object.
 * @param {Date|string} date
 * @param {number} days
 * @returns {Date}
 */
export const addDays = (date, days) => {
  const result = date instanceof Date ? new Date(date) : parseLocalDate(date);
  result.setDate(result.getDate() + days);
  return result;
};

/**
 * Adds a specified number of months to a Date object.
 * Correctly handles end-of-month dates (e.g. Jan 31 + 1 month = Feb 28/29).
 * @param {Date|string} date
 * @param {number} months
 * @returns {Date}
 */
export const addMonths = (date, months) => {
  const result = date instanceof Date ? new Date(date) : parseLocalDate(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);

  // If the day changed (e.g. Jan 31 -> Mar 3 because Feb has only 28 days),
  // clamp it to the last day of the previous month.
  if (result.getDate() !== day) {
    result.setDate(0);
  }
  return result;
};

/**
 * Returns the last day of the month for a given date.
 * @param {Date|string} date
 * @param {string} timezone
 * @returns {Date}
 */
export const getEndOfMonth = (date, timezone = DEFAULT_TIMEZONE) => {
  const d =
    date instanceof Date ? new Date(date) : parseLocalDate(date, timezone);
  // Set to first day of next month, then subtract one hour to get last day of current month in local context
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return new Date(nextMonth.getTime() - 1);
};

/**
 * Returns the number of days in the month for a given date.
 * @param {Date|string} date
 * @param {string} timezone
 * @returns {number}
 */
export const getDaysInMonth = (date, timezone = DEFAULT_TIMEZONE) => {
  const d =
    date instanceof Date ? new Date(date) : parseLocalDate(date, timezone);
  // Using the year and month from the local context
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  return new Date(year, month, 0).getDate();
};

/**
 * Checks if date A is before date B (comparing only YYYY-MM-DD)
 */
export const isBefore = (dateA, dateB) => {
  const d1 = dateA instanceof Date ? new Date(dateA) : parseLocalDate(dateA);
  const d2 = dateB instanceof Date ? new Date(dateB) : parseLocalDate(dateB);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return d1.getTime() < d2.getTime();
};

/**
 * Checks if two dates are the same day
 */
export const isToday = (date, timezone = DEFAULT_TIMEZONE) => {
  const d1 =
    date instanceof Date ? new Date(date) : parseLocalDate(date, timezone);
  const d2 = getLocalTime(timezone);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

export default {
  getCurrentDateString,
  formatToLocalDate,
  getLocalTime,
  now,
  today,
  parseLocalDate,
  addDays,
  addMonths,
  getEndOfMonth,
  getDaysInMonth,
  isBefore,
  isToday,
};
