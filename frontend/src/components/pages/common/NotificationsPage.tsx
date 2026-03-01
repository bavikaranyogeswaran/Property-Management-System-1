import React, { useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  AlertTriangle,
  FileText,
  Check,
  Info,
  Wrench,
  CreditCard,
} from 'lucide-react';
import { format } from 'date-fns';

export function NotificationsPage() {
  const { notifications, markNotificationAsRead } = useApp();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = notifications
    .filter((n) => (filter === 'all' ? true : !n.read))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const getIcon = (type: string) => {
    switch (type) {
      case 'maintenance':
        return Wrench;
      case 'invoice_overdue':
        return CreditCard;
      case 'lease':
        return FileText;
      default:
        return Bell;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const handleMarkAllRead = () => {
    // Technically this should be a bulk API call, but we can iterate for now or just visual.
    // Since we don't have a bulk API, let's just mark visible ones?
    // Or better, just let user do it one by one to ensure they read it.
    // Actually, let's just filter for unread and call markAsRead for each.
    const unread = notifications.filter((n) => !n.read);
    unread.forEach((n) => markNotificationAsRead(n.id));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          <p className="text-sm text-gray-500">
            Stay updated with important system alerts
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'unread' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            Unread
          </Button>
          {notifications.some((n) => !n.read) && (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:bg-blue-50"
              onClick={handleMarkAllRead}
            >
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center flex flex-col items-center">
              <div className="bg-gray-100 p-4 rounded-full mb-4">
                <Bell className="size-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                No notifications
              </h3>
              <p className="text-gray-500 mt-1">You're all caught up!</p>
            </CardContent>
          </Card>
        ) : (
          filteredNotifications.map((notification) => {
            const Icon = getIcon(notification.type);
            const isUnread = !notification.read;

            return (
              <Card
                key={notification.id}
                className={`transition-all hover:shadow-md ${isUnread ? 'border-l-4 border-l-blue-500 shadow-sm' : 'opacity-75'}`}
              >
                <div className="p-4 flex gap-4 items-start">
                  <div
                    className={`p-2 rounded-full shrink-0 ${isUnread ? 'bg-blue-50' : 'bg-gray-100'}`}
                  >
                    <Icon
                      className={`size-5 ${isUnread ? 'text-blue-600' : 'text-gray-500'}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4
                          className={`text-sm font-semibold ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}
                        >
                          {notification.title}
                        </h4>
                        <Badge
                          variant="outline"
                          className={`mt-1 text-[10px] uppercase tracking-wider ${getSeverityColor(notification.severity)}`}
                        >
                          {notification.severity}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {format(
                          new Date(notification.createdAt),
                          'MMM dd, h:mm a'
                        )}
                      </span>
                    </div>
                    <p
                      className={`text-sm mt-2 ${isUnread ? 'text-gray-800' : 'text-gray-500'}`}
                    >
                      {notification.message}
                    </p>
                  </div>
                  {isUnread && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-2 h-8 w-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Mark as read"
                      onClick={() => markNotificationAsRead(notification.id)}
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
