import Joi from 'joi';

export const propertySchema = Joi.object({
  name: Joi.string().required().messages({
    'any.required': 'Property name is required',
  }),
  address: Joi.string().required().messages({
    'any.required': 'Address is required',
  }),
  city: Joi.string().required().messages({
    'any.required': 'City is required',
  }),
  description: Joi.string().allow('', null),
});

export const updatePropertySchema = Joi.object({
  name: Joi.string(),
  address: Joi.string(),
  city: Joi.string(),
  description: Joi.string().allow('', null),
});
