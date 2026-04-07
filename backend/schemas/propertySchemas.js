import Joi from 'joi';

export const propertySchema = Joi.object({
  name: Joi.string().required().messages({
    'any.required': 'Property name is required',
  }),
  propertyNo: Joi.string().allow('', null),
  street: Joi.string().required().messages({
    'any.required': 'Street address is required',
  }),
  city: Joi.string().required().messages({
    'any.required': 'City is required',
  }),
  district: Joi.string().required().messages({
    'any.required': 'District is required',
  }),
  propertyTypeId: Joi.number().integer().min(1).required().messages({
    'any.required': 'Property type is required',
    'number.min': 'Invalid property type',
  }),
  description: Joi.string().allow('', null),
  features: Joi.array().items(Joi.string()).default([]),
  lateFeePercentage: Joi.number().min(0).max(100).default(3.0),
  lateFeeType: Joi.string()
    .valid('flat_percentage', 'daily_fixed')
    .default('flat_percentage'),
  lateFeeAmount: Joi.number().min(0).default(0),
  lateFeeGracePeriod: Joi.number().integer().min(0).default(5),
  tenantDeactivationDays: Joi.number().integer().min(0).default(30),
  managementFeePercentage: Joi.number().min(0).max(100).default(0),
});

export const updatePropertySchema = Joi.object({
  name: Joi.string(),
  propertyNo: Joi.string().allow('', null),
  street: Joi.string(),
  city: Joi.string(),
  district: Joi.string(),
  propertyTypeId: Joi.number().integer().min(1),
  description: Joi.string().allow('', null),
  features: Joi.array().items(Joi.string()),
  lateFeePercentage: Joi.number().min(0).max(100),
  lateFeeType: Joi.string().valid('flat_percentage', 'daily_fixed'),
  lateFeeAmount: Joi.number().min(0),
  lateFeeGracePeriod: Joi.number().integer().min(0),
  tenantDeactivationDays: Joi.number().integer().min(0),
  managementFeePercentage: Joi.number().min(0).max(100),
  status: Joi.string().valid('active', 'inactive'),
});
