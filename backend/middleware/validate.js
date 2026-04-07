import AppError from '../utils/AppError.js';

/**
 * Validation Middleware Factory
 * @param {Object} schema - Joi schema object
 * @param {String} source - Source of data ('body', 'query', 'params')
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    // Edge Case: setupPassword sends nested tenantData as a string in some multipart forms
    // We try to parse it if it's a string to allow Joi to validate the object structure
    if (
      source === 'body' &&
      req.body.tenantData &&
      typeof req.body.tenantData === 'string'
    ) {
      try {
        req.body.tenantData = JSON.parse(req.body.tenantData);
      } catch (e) {
        // If it's not valid JSON, Joi will Catch it anyway
      }
    }

    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true,
    });

    if (error) {
      const message = error.details.map((el) => el.message).join(', ');
      return next(new AppError(message, 400));
    }

    // Replace the request data with the validated/sanitized value (strips unknown fields)
    req[source] = value;
    next();
  };
};

export default validate;
