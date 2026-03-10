// Date formatting utilities

import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';

export const dateUtils = {
    // Format date for display
    formatDate: (date: string | Date, formatStr: string = 'MMM dd, yyyy'): string => {
        try {
            const dateObj = typeof date === 'string' ? parseISO(date) : date;
            return isValid(dateObj) ? format(dateObj, formatStr) : 'Invalid date';
        } catch (error) {
            return 'Invalid date';
        }
    },

    // Format date with time
    formatDateTime: (date: string | Date): string => {
        return dateUtils.formatDate(date, 'MMM dd, yyyy HH:mm');
    },

    // Format for invoice due dates
    formatDueDate: (date: string | Date): string => {
        return dateUtils.formatDate(date, 'MMMM dd, yyyy');
    },

    // Format relative time (e.g., "2 days ago")
    formatRelativeTime: (date: string | Date): string => {
        try {
            const dateObj = typeof date === 'string' ? parseISO(date) : date;
            return isValid(dateObj) ? formatDistanceToNow(dateObj, { addSuffix: true }) : 'Invalid date';
        } catch (error) {
            return 'Invalid date';
        }
    },

    // Check if date is overdue
    isOverdue: (date: string | Date): boolean => {
        try {
            const dateObj = typeof date === 'string' ? parseISO(date) : date;
            return isValid(dateObj) && dateObj < new Date();
        } catch (error) {
            return false;
        }
    },

    // Format for input fields (YYYY-MM-DD)
    formatForInput: (date: string | Date): string => {
        return dateUtils.formatDate(date, 'yyyy-MM-dd');
    },
};

export default dateUtils;
