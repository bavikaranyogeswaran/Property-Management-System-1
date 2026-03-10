import { z } from 'zod';
import { slPhoneSchema, currencySchema } from './commonSchemas';

export const propertySchema = z.object({
  name: z.string().min(1, 'Property name is required'),
  propertyNo: z.string().optional(),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  district: z.string().min(1, 'District is required'),
  propertyTypeId: z.number().min(1, 'Property type is required'),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
});

export const unitSchema = z.object({
  propertyId: z.string().min(1, 'Property is required'),
  unitNumber: z.string().min(1, 'Unit number is required'),
  unitTypeId: z.number().min(1, 'Unit type is required'),
  monthlyRent: currencySchema,
  status: z.enum(['available', 'occupied', 'maintenance']),
});

export const leaseSchema = z
  .object({
    tenantId: z.string().min(1, 'Tenant is required'),
    unitId: z.string().min(1, 'Unit is required'),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    monthlyRent: currencySchema,
    documentUrl: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;
      return new Date(data.endDate) > new Date(data.startDate);
    },
    {
      message: 'End date must be after start date',
      path: ['endDate'],
    }
  );

export const leadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: slPhoneSchema,
  interestedUnit: z.string().optional(),
  notes: z.string().optional(),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;
export type UnitFormValues = z.infer<typeof unitSchema>;
export type LeaseFormValues = z.infer<typeof leaseSchema>;
export type LeadFormValues = z.infer<typeof leadSchema>;
