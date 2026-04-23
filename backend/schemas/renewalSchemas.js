// ============================================================================
//  RENEWAL SCHEMAS (Joi Validation for Lease Renewal Proposals)
// ============================================================================
//  Ensures that proposed rent values are numeric, positive, and that
//  proposed end dates are valid ISO dates in the future.
// ============================================================================

import Joi from 'joi';

// PROPOSE TERMS SCHEMA: Staff sends a new rent rate and end date to the tenant.
export const proposeTermsSchema = Joi.object({
  // [S2 FIX] Explicit numeric + positive guard — blocks "abc", -500, 0
  proposedMonthlyRent: Joi.number().positive().required().messages({
    'number.base': '"proposedMonthlyRent" must be a number',
    'number.positive': '"proposedMonthlyRent" must be greater than 0',
    'any.required': '"proposedMonthlyRent" is required',
  }),

  // [S2 FIX] ISO date + future guard — blocks "tomorrow", past dates
  proposedEndDate: Joi.date().iso().greater('now').required().messages({
    'date.base': '"proposedEndDate" must be a valid date',
    'date.format': '"proposedEndDate" must be in ISO format (YYYY-MM-DD)',
    'date.greater': '"proposedEndDate" must be a future date',
    'any.required': '"proposedEndDate" is required',
  }),

  // Optional notes — capped at 1000 characters
  notes: Joi.string().max(1000).allow('', null),
});
