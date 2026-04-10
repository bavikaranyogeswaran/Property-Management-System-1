import Joi from 'joi';

const sriLankanPhoneRegex = /^(\+94|0)?[1-9]\d{8}$/;
const sriLankanNICRegex = /^([0-9]{9}[xXvV]|[0-9]{12})$/;

export const createTreasurerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().pattern(sriLankanPhoneRegex).required().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567).',
  }),
  nic: Joi.string().pattern(sriLankanNICRegex).optional().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan NIC (e.g., 123456789V or 199012345678).',
  }),
  employeeId: Joi.string().optional().allow('', null),
  jobTitle: Joi.string().optional().allow('', null),
  shiftStart: Joi.string().optional().allow('', null),
  shiftEnd: Joi.string().optional().allow('', null),
});

export const updateTreasurerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().lowercase().trim().required(),
  phone: Joi.string().pattern(sriLankanPhoneRegex).required().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567).',
  }),
  nic: Joi.string().pattern(sriLankanNICRegex).optional().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan NIC (e.g., 123456789V or 199012345678).',
  }),
  employeeId: Joi.string().optional().allow('', null),
  jobTitle: Joi.string().optional().allow('', null),
  shiftStart: Joi.string().optional().allow('', null),
  shiftEnd: Joi.string().optional().allow('', null),
  status: Joi.string().valid('active', 'inactive').optional(),
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().lowercase().trim().optional(),
  phone: Joi.string().pattern(sriLankanPhoneRegex).required().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567).',
  }),
  nic: Joi.string().pattern(sriLankanNICRegex).optional().messages({
    'string.pattern.base':
      'Please enter a valid Sri Lankan NIC (e.g., 123456789V or 199012345678).',
  }),
  // Optional Tenant Fields (E7)
  emergencyContactName: Joi.string().optional().allow('', null),
  emergencyContactPhone: Joi.string()
    .pattern(sriLankanPhoneRegex)
    .optional()
    .allow('', null)
    .messages({
      'string.pattern.base':
        'Please enter a valid Sri Lankan phone number for the emergency contact.',
    }),
  employmentStatus: Joi.string()
    .valid('employed', 'self-employed', 'student', 'unemployed')
    .optional()
    .allow('', null),
  permanentAddress: Joi.string().optional().allow('', null),
});
