// ============================================================================
//  NOTIFICATION CONTEXT (The Alerts Hub)
// ============================================================================
//  This state manager collects important alerts for the user (Owner or Tenant).
//  It tracks things like "Unpaid Invoices" or "Upcoming Visits" and ensures
//  the user sees them immediately upon login.
// ============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { notificationApi } from '../../services/api';
import { useAuth } from './AuthContext';
import { useProperty } from './PropertyContext';
import { useLease } from './LeaseContext';
import { useUser } from './UserContext';

export interface Notification {
  id: string;
  type: 'invoice' | 'lease' | 'maintenance' | 'payment' | 'visit' | 'system';
  title: string;
  message: string;
  targetRole: 'owner' | 'tenant' | 'both';
  targetUserId?: string;
  leaseId?: string;
  unitId?: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  expiresAt?: string;
  daysUntilExpiry?: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  // 1. [DEPENDENCIES] Context Injection: Consumes other domains to calculate derived alerts (Lease, User, Property)
  const { user } = useAuth();
  const { properties, units } = useProperty();
  const { leases } = useLease();
  const { tenants } = useUser();

  // 2. [STATE] Global Alert Queue: Holds a unified list of backend-stored and locally-generated notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // FETCH BACKEND NOTIFICATIONS: Retrieves persistent alerts (Payments, Invoices) from the database.
  const fetchBackendNotifications = async () => {
    if (!user) return;
    try {
      // 1. [API] Extraction
      const res = await notificationApi.getNotifications();
      if (res.data && Array.isArray(res.data)) {
        // 2. [TRANSFORMATION] Data Normalization: converts row objects to app-standard Notification types
        const backendNotifs = res.data
          .filter((n: any) => n && n.id !== undefined)
          .map((n: any) => ({
            ...n,
            id: n.id.toString(),
            read: Boolean(n.isRead),
          }));

        // 3. [SYNC] Selective Merge: preserves locally-generated transient alerts while updating stored ones
        setNotifications((prev) => {
          const local = prev.filter((n) => n.id.startsWith('notif-'));
          return [...local, ...backendNotifs];
        });
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  // LOCAL NOTIFICATION GENERATOR: Derived logic to flag expiring leases without backend polling.
  useEffect(() => {
    if (leases.length === 0) return;
    const today = new Date();
    const generatedNotifications: Notification[] = [];

    // 1. [LOGIC] Expiry Sweep: Iterates through active contracts to identify proximity triggers
    leases.forEach((lease) => {
      if (lease.status !== 'active' || !lease.endDate) return;
      const endDate = new Date(lease.endDate);
      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry < 0) return;

      // 2. [STATE] Severity Resolution: determine urgency based on time-window thresholds
      let shouldNotify = false;
      let severity: 'info' | 'warning' | 'urgent' = 'info';

      if (daysUntilExpiry <= 15) {
        shouldNotify = true;
        severity = 'urgent';
      } else if (daysUntilExpiry <= 30) {
        shouldNotify = true;
        severity = 'warning';
      } else if (daysUntilExpiry <= 60) {
        shouldNotify = true;
        severity = 'info';
      }

      if (shouldNotify) {
        const unit = units.find((u) => u.id === lease.unitId);
        const tenant = tenants.find((t) => t.id === lease.tenantId);
        const property = unit
          ? properties.find((p) => p.id === unit.propertyId)
          : null;

        // 3. [DEDUPLICATION] check if an alert for this lease window already exists in the queue
        const existingNotification = notifications.find(
          (n) =>
            n.leaseId === lease.id &&
            n.type === 'lease' &&
            Math.abs((n.daysUntilExpiry || 0) - daysUntilExpiry) < 2
        );

        if (!existingNotification && unit && tenant && property) {
          generatedNotifications.push({
            id: `notif-${lease.id}-${daysUntilExpiry}`,
            type: 'lease',
            title:
              daysUntilExpiry <= 7
                ? '⚠️ Urgent: Lease Expiring Soon'
                : 'Lease Expiring Soon',
            message: `Lease for ${tenant.name} in ${property.name} Unit ${unit.unitNumber} expires in ${daysUntilExpiry} days.`,
            targetRole: 'both',
            targetUserId: tenant.id,
            leaseId: lease.id,
            unitId: lease.unitId,
            severity,
            createdAt: today.toISOString(),
            expiresAt: lease.endDate || undefined,
            daysUntilExpiry,
            read: false,
          });
        }
      }
    });

    // 4. [SYNC] UI State Update: append new transient notifications to the global queue
    if (generatedNotifications.length > 0) {
      setNotifications((prev) => {
        const filtered = prev.filter(
          (n) =>
            !generatedNotifications.some(
              (gn) => gn.leaseId === n.leaseId && n.type === 'lease'
            )
        );
        return [...filtered, ...generatedNotifications];
      });
    }
  }, [leases, units, tenants, properties]);

  // INITIALIZATION EFFECT: Refresh the list on identity change.
  useEffect(() => {
    fetchBackendNotifications();
  }, [user]);

  // MARK AS READ: Synchronizes user interaction with the server for persistent alerts.
  const markNotificationAsRead = async (id: string) => {
    try {
      // 1. [SYNC] Local Optimistic Update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      // 2. [API] Persistence: only send to server if it's not a locally-generated transient notif
      if (!id.startsWith('notif-')) await notificationApi.markAsRead(id);
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
  };

  // MARK ALL AS READ: Batch update of all present notifications.
  const markAllAsRead = async () => {
    try {
      // 1. [SYNC] Local Optimistic Update
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      // 2. [API] Persistence
      await notificationApi.markAllAsRead();
    } catch (e) {
      console.error('Failed to mark all notifications as read', e);
    }
  };

  return (
    <NotificationContext.Provider
      value={{ notifications, markNotificationAsRead, markAllAsRead }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined)
    throw new Error(
      'useNotification must be used within a NotificationProvider'
    );
  return context;
}
