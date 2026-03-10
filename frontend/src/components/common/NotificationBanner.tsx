import React from 'react';
import { Notification } from '@/app/context/AppContext';
import { AlertCircle, Bell, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface NotificationBannerProps {
  notifications: Notification[];
  userRole: 'owner' | 'tenant' | 'treasurer';
  tenantId?: string;
}

export function NotificationBanner({
  notifications,
  userRole,
  tenantId,
}: NotificationBannerProps) {
  // Filter notifications based on role and tenant
  const relevantNotifications = notifications
    .filter((n) => {
      if (n.targetRole === 'both') return true;
      if (n.targetRole === userRole) {
        if (userRole === 'tenant' && tenantId) {
          return n.targetUserId === tenantId;
        }
        return true;
      }
      return false;
    })
    .filter((n) => !n.read);

  if (relevantNotifications.length === 0) return null;

  // Sort by severity: urgent first, then warning, then info
  const sortedNotifications = relevantNotifications.sort((a, b) => {
    const severityOrder = { urgent: 0, warning: 1, info: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return (
    <div className="space-y-3 mb-6">
      {sortedNotifications.map((notification) => {
        const Icon =
          notification.severity === 'urgent'
            ? AlertTriangle
            : notification.severity === 'warning'
              ? AlertCircle
              : Bell;

        const bgColor =
          notification.severity === 'urgent'
            ? 'bg-red-50 border-red-200'
            : notification.severity === 'warning'
              ? 'bg-orange-50 border-orange-200'
              : 'bg-blue-50 border-blue-200';

        const textColor =
          notification.severity === 'urgent'
            ? 'text-red-900'
            : notification.severity === 'warning'
              ? 'text-orange-900'
              : 'text-blue-900';

        const iconColor =
          notification.severity === 'urgent'
            ? 'text-red-600'
            : notification.severity === 'warning'
              ? 'text-orange-600'
              : 'text-blue-600';

        return (
          <Card key={notification.id} className={`${bgColor} border`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Icon className={`size-5 ${iconColor} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-semibold ${textColor}`}>
                      {notification.title}
                    </h4>
                    {notification.daysUntilExpiry !== undefined && (
                      <Badge
                        variant="outline"
                        className={
                          notification.severity === 'urgent'
                            ? 'border-red-400 text-red-700 bg-red-100'
                            : notification.severity === 'warning'
                              ? 'border-orange-400 text-orange-700 bg-orange-100'
                              : 'border-blue-400 text-blue-700 bg-blue-100'
                        }
                      >
                        <Clock className="size-3 mr-1" />
                        {notification.daysUntilExpiry}{' '}
                        {notification.daysUntilExpiry === 1 ? 'day' : 'days'}
                      </Badge>
                    )}
                  </div>
                  <p className={`text-sm ${textColor} opacity-90`}>
                    {notification.message}
                  </p>
                  {notification.expiresAt && (
                    <p className={`text-xs ${textColor} opacity-70 mt-1`}>
                      Expiry Date:{' '}
                      {new Date(notification.expiresAt).toLocaleDateString(
                        'en-US',
                        {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }
                      )}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
