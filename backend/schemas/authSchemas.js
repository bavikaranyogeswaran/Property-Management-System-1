import Joi from 'joi';

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

export const setupPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string()
    .pattern(
      new RegExp(
        '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
      )
    )
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
    }),
  tenantData: Joi.object({
    nic: Joi.string()
      .pattern(/^([0-9]{9}[xXvV]|[0-9]{12})$/)
      .optional()
      .messages({
        'string.pattern.base': 'Please enter a valid Sri Lankan NIC (e.g., 123456789V or 199012345678).',
      }),
    monthlyIncome: Joi.number().min(0).required(),
    permanentAddress: Joi.string().required(),
    emergencyContactName: Joi.string().required(),
    emergencyContactPhone: Joi.string()
      .pattern(/^(\+94|0)?[1-9]\d{8}$/)
      .required()
      .messages({
        'string.pattern.base': 'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567).',
      }),
  }).optional(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
