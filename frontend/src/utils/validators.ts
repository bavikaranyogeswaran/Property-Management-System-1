/**
 * Frontend validation utilities
 */

export interface ValidationResult {
    isValid: boolean;
    error?: string;
    errors?: string[];
}

/**
 * Password validation (matches backend requirements)
 */
export const validatePassword = (password: string): ValidationResult => {
    const errors: string[] = [];

    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (password && password.length > 128) {
        errors.push('Password must not exceed 128 characters');
    }

    if (!/[A-Z]/.test(password)) {
        errors.push('Must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
        errors.push('Must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
        errors.push('Must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Must contain at least one special character');
    }

    return {
        isValid: errors.length === 0,
        errors: errors,
    };
};

/**
 * Get password strength level
 */
export const getPasswordStrength = (password: string): {
    strength: 'weak' | 'medium' | 'strong' | 'very-strong';
    score: number;
} => {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;
    if (password.length >= 16) score++;

    if (score <= 2) return { strength: 'weak', score };
    if (score <= 4) return { strength: 'medium', score };
    if (score <= 5) return { strength: 'strong', score };
    return { strength: 'very-strong', score };
};

/**
 * Phone number validation for Sri Lankan numbers
 */
export const validatePhoneNumber = (phone: string): ValidationResult => {
    // Sri Lankan phone number patterns:
    // +94 77 123 4567 or +94771234567 or 0771234567
    const sriLankaPattern = /^(\+94|0)?[1-9]\d{8}$/;

    // Remove spaces and dashes for validation
    const cleanPhone = phone.replace(/[\s-]/g, '');

    if (!sriLankaPattern.test(cleanPhone)) {
        return {
            isValid: false,
            error: 'Please enter a valid Sri Lankan phone number (e.g., +94 77 123 4567 or 0771234567)',
        };
    }

    return {
        isValid: true,
    };
};

/**
 * Email validation
 */
export const validateEmail = (email: string): ValidationResult => {
    const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!email || !emailPattern.test(email)) {
        return {
            isValid: false,
            error: 'Please enter a valid email address',
        };
    }

    if (email.length > 254) {
        return {
            isValid: false,
            error: 'Email address is too long',
        };
    }

    return {
        isValid: true,
    };
};

/**
 * Name validation
 */
export const validateName = (name: string): ValidationResult => {
    if (!name || name.trim().length < 2) {
        return {
            isValid: false,
            error: 'Name must be at least 2 characters long',
        };
    }

    if (name.length > 100) {
        return {
            isValid: false,
            error: 'Name is too long',
        };
    }

    return {
        isValid: true,
    };
};
