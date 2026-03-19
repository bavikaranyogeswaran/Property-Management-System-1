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
    day: '2-digit' 
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
    day: '2-digit' 
  };
  return new Intl.DateTimeFormat('en-CA', options).format(new Date(date));
};

/**
 * Get the current local time as a Date object in the target timezone.
 * Useful for day/month/year extractions.
 */
export const getLocalTime = (timezone = DEFAULT_TIMEZONE) => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
};

export default {
  getCurrentDateString,
  formatToLocalDate,
  getLocalTime
};
