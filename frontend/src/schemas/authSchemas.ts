import { z } from 'zod';
import { slNicSchema, slPhoneSchema } from './commonSchemas';

export const passwordUpdateSchema = z
  .object({
    current: z.string().min(1, 'Current password is required'),
    new: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.new === data.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const tenantSetupPasswordSchema = resetPasswordSchema.and(
  z.object({
    nic: slNicSchema.optional(),
    nicDoc: z.any().optional(),
    monthlyIncome: z.coerce.number().min(0, 'Income must be a valid number'),
    permanentAddress: z.string().min(1, 'Permanent Address is required'),
    emergencyContactName: z
      .string()
      .min(1, 'Emergency Contact Name is required'),
    emergencyContactPhone: slPhoneSchema,
  })
);

export type PasswordUpdateFormValues = z.infer<typeof passwordUpdateSchema>;
export type LoginFormValues = z.infer<typeof loginSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type TenantSetupPasswordFormValues = z.infer<
  typeof tenantSetupPasswordSchema
>;
