import { z } from 'zod';

// Sri Lankan Phone Number Regex
// Matches: +947XXXXXXXX, 07XXXXXXXX, 7XXXXXXXX
// We enforce usually 07... or +947... for consistency in storage, but regex can be flexible.
// Let's enforce: ^(?:\+94|0)?7[0-9]{8}$ 
// Examples: +94771234567, 0771234567, 771234567
export const slPhoneRegex = /^(?:\+94|0)?7[0-9]{8}$/;

export const slPhoneSchema = z.string()
    .min(1, "Phone number is required")
    .regex(slPhoneRegex, "Invalid Sri Lankan phone number. e.g., 0771234567");

// Sri Lankan NIC Regex
// Old: 9 digits + V/X/v/x (e.g., 123456789V)
// New: 12 digits (e.g., 199012345678)
export const slNicRegex = /^([0-9]{9}[x|X|v|V]|[0-9]{12})$/;

export const slNicSchema = z.string()
    .min(1, "NIC is required")
    .regex(slNicRegex, "Invalid NIC format. Use 9 digits+V/X or 12 digits.");

export const currencySchema = z.number()
    .min(0, "Amount must be positive");
