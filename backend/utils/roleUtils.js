/**
 * Role Constants and Hierarchy Configuration
 * Centralized source of truth for all Role-Based Access Control (RBAC).
 */

export const ROLES = {
    OWNER: 'owner',
    TREASURER: 'treasurer',
    TENANT: 'tenant',
    SYSTEM: 'system'
};

/**
 * Role Power Levels
 * Higher numbers represent higher authority/superset of permissions.
 * SYSTEM role is treated as an override (Infinity).
 */
export const ROLE_LEVELS = {
    [ROLES.TENANT]: 1,
    [ROLES.TREASURER]: 2,
    [ROLES.OWNER]: 3,
    [ROLES.SYSTEM]: 99
};

/**
 * Checks if currentRole has at least the same power level as targetRole.
 */
export const isAtLeast = (currentRole, targetRole) => {
    const currentWeight = ROLE_LEVELS[currentRole] || 0;
    const targetWeight = ROLE_LEVELS[targetRole] || 0;
    return currentWeight >= targetWeight;
};
