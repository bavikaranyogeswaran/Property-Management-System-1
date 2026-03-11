/**
 * Password validation utility
 * Enforces strong password requirements
 */
export const validatePassword = (password) => {
  const errors = [];

  // Minimum length check
  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Maximum length check (prevent DoS)
  if (password && password.length > 128) {
    errors.push('Password must not exceed 128 characters');
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for at least one number
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Check for at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push(
      'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)'
    );
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
};

/**
 * Phone number validation for Sri Lankan numbers
 */
export const validatePhoneNumber = (phone) => {
  if (!phone) {
      return { isValid: false, error: 'Phone number is required' };
  }

  // Sri Lankan phone number patterns:
  // +94 77 123 4567 or +94771234567 or 0771234567
  const sriLankaPattern = /^(\+94|0)?[1-9]\d{8}$/;

  // Remove spaces and dashes for validation
  const cleanPhone = phone.replace(/[\s-]/g, '');

  if (!sriLankaPattern.test(cleanPhone)) {
    return {
      isValid: false,
      error:
        'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567)',
    };
  }

  return {
    isValid: true,
    error: null,
  };
};

/**
 * NIC validation (Sri Lankan National Identity Card)
 */
export const validateNIC = (nic) => {
  // Sri Lankan NIC logic:
  // Old format: 9 digits followed by 'V' or 'X' (case insensitive)
  // New format: 12 digits
  const nicPattern = /^([0-9]{9}[xXvV]|[0-9]{12})$/;

  if (!nic || !nicPattern.test(nic.trim())) {
    return {
      isValid: false,
      error: 'Please enter a valid NIC (e.g., 123456789V or 199012345678)',
    };
  }

  return {
    isValid: true,
    error: null,
  };
};

/**
 * Email validation (more comprehensive than basic regex)
 */
export const validateEmail = (email) => {
  // RFC 5322 compliant email regex (simplified)
  const emailPattern =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!email || !emailPattern.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address',
    };
  }

  // Check email length
  if (email.length > 254) {
    return {
      isValid: false,
      error: 'Email address is too long',
    };
  }

  return {
    isValid: true,
    error: null,
  };
};
