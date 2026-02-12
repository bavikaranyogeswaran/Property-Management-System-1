import Joi from 'joi';

export const submitPaymentSchema = Joi.object({
  invoiceId: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  paymentDate: Joi.date().iso().required(),
  paymentMethod: Joi.string().required(),
  referenceNumber: Joi.string().allow('', null),
  evidenceUrl: Joi.string().uri().allow('', null),
});

export const recordCashPaymentSchema = Joi.object({
  invoiceId: Joi.number().integer().required(),
  amount: Joi.number().positive().required(),
  paymentDate: Joi.date().iso().required(),
  referenceNumber: Joi.string().allow('', null),
});

export const verifyPaymentSchema = Joi.object({
  status: Joi.string().valid('verified', 'rejected').required(),
});
