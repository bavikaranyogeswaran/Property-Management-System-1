import Joi from 'joi';

export const addMaintenanceCostSchema = Joi.object({
    requestId: Joi.number().integer().required(),
    amount: Joi.number().positive().required(),
    description: Joi.string().required(),
    recordedDate: Joi.date().iso().optional()
});
