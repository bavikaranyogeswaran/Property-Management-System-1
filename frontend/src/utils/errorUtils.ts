/**
 * Safely extracts a displayable error message from an Axios error response.
 *
 * The backend's `sendErrorDev` handler sends:
 *   { status, error: AppErrorObject, message, stack }
 *
 * where `error` is a serialized AppError instance (an object with keys
 * {statusCode, status, isOperational}), NOT a string.
 *
 * Passing that object directly to `toast.error()` causes a React crash:
 *   "Objects are not valid as a React child"
 *
 * This utility resolves the error to a safe string in all environments.
 *
 * @param error - The caught Axios error (or any error)
 * @param fallback - A fallback message if nothing useful can be extracted
 * @returns A displayable error string
 */
export function extractErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred.'
): string {
  if (!error || typeof error !== 'object') return fallback;

  const axiosError = error as any;
  const data = axiosError?.response?.data;

  if (data) {
    // 1. Prefer `data.message` (always a string from both dev and prod error handlers)
    if (typeof data.message === 'string' && data.message) return data.message;

    // 2. Fall back to `data.error` only if it's a string (prod mode sends strings)
    if (typeof data.error === 'string' && data.error) return data.error;
  }

  // 3. Axios error message
  if (typeof axiosError.message === 'string' && axiosError.message) {
    return axiosError.message;
  }

  return fallback;
}
