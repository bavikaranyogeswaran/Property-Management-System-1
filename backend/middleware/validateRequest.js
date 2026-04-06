import AppError from '../utils/AppError.js';

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map((detail) => detail.message);
      const validationError = new AppError('Validation Error', 400);
      validationError.details = errors;
      return next(validationError);
    }
    next();
  };
};

export default validateRequest;
