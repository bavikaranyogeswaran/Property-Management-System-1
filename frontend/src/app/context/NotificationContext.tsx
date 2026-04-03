import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { properties, units } = useProperty();
  const { leases } = useLease();
  const { tenants } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 1. Fetch backend notifications
  const fetchBackendNotifications = async () => {
    if (!user) return;
    try {
      const res = await notificationApi.getNotifications();
      if (res.data && Array.isArray(res.data)) {
        const backendNotifs = res.data
          .filter((n: any) => n && n.id !== undefined)
          .map((n: any) => ({
            ...n,
            id: n.id.toString(),
            read: Boolean(n.isRead),
          }));
        setNotifications(prev => {
          const local = prev.filter(n => n.id.startsWith('notif-'));
          return [...local, ...backendNotifs];
        });
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  // 2. Local notification generation (e.g. Lease expiry)
  useEffect(() => {
    if (leases.length === 0) return;
    const today = new Date();
    const generatedNotifications: Notification[] = [];

    leases.forEach((lease) => {
      if (lease.status !== 'active' || !lease.endDate) return;
      const endDate = new Date(lease.endDate);
      const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 0) return;

      let shouldNotify = false;
      let severity: 'info' | 'warning' | 'urgent' = 'info';

      if (daysUntilExpiry <= 15) { shouldNotify = true; severity = 'urgent'; }
      else if (daysUntilExpiry <= 30) { shouldNotify = true; severity = 'warning'; }
      else if (daysUntilExpiry <= 60) { shouldNotify = true; severity = 'info'; }

      if (shouldNotify) {
        const unit = units.find(u => u.id === lease.unitId);
        const tenant = tenants.find(t => t.id === lease.tenantId);
        const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

        const existingNotification = notifications.find(n => n.leaseId === lease.id && n.type === 'lease' && Math.abs((n.daysUntilExpiry || 0) - daysUntilExpiry) < 2);

        if (!existingNotification && unit && tenant && property) {
          generatedNotifications.push({
            id: `notif-${lease.id}-${daysUntilExpiry}`,
            type: 'lease',
            title: daysUntilExpiry <= 7 ? '⚠️ Urgent: Lease Expiring Soon' : 'Lease Expiring Soon',
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

    if (generatedNotifications.length > 0) {
      setNotifications(prev => {
        const filtered = prev.filter(n => !generatedNotifications.some(gn => gn.leaseId === n.leaseId && n.type === 'lease'));
        return [...filtered, ...generatedNotifications];
      });
    }
  }, [leases, units, tenants, properties]);

  useEffect(() => {
    fetchBackendNotifications();
  }, [user]);

  const markNotificationAsRead = async (id: string) => {
    try {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      if (!id.startsWith('notif-')) await notificationApi.markAsRead(id);
    } catch (e) {
      console.error('Failed to mark notification as read', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      await notificationApi.markAllAsRead();
    } catch (e) {
      console.error('Failed to mark all notifications as read', e);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, markNotificationAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
}
