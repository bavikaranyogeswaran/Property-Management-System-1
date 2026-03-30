/**
 * Wraps an asynchronous function (like an Express route handler) to catch any
 * errors and pass them to the next middleware (the global error handler).
 * This eliminates the need for try-catch blocks in every controller method.
 * 
 * @param {Function} fn - The asynchronous function to wrap
 * @returns {Function} - A function that handles req, res, and next
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

export default catchAsync;
