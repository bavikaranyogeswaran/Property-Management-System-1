import React, { ReactNode, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useApp } from '@/app/context/AppContext';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2,
  Home,
  Users,
  UserPlus,
  FileText,
  CreditCard,
  Wrench,
  BarChart3,
  LogOut,
  Menu,
  X,
  Shield,
  Settings,
  DollarSign,
  Receipt,
  Bell,
  Calendar,
} from 'lucide-react';

import { Link, useLocation } from 'react-router-dom';

interface AppLayoutProps {
  children: ReactNode;
}

// ============================================================================
//  APP LAYOUT (The Frame)
// ============================================================================
//  This file creates the "Skeleton" of the app.
//  It draws the Top Bar (with Notification Bell) and the Side Menu (Navigation).
//  It changes the menu items based on who is logged in (Owner vs Tenant).
// ============================================================================

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const { notifications, markNotificationAsRead } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const isActive = (path: string) => {
    if (path === '/dashboard' && location.pathname === '/') return true;
    return location.pathname.startsWith(path);
  };

  const ownerMenu = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/properties', label: 'Properties', icon: Building2 },
    { path: '/units', label: 'Units', icon: Building2 },
    { path: '/visits', label: 'Visits', icon: Calendar },
    { path: '/leads', label: 'Leads', icon: UserPlus },

    { path: '/tenants', label: 'Tenants', icon: Users },
    { path: '/treasurers', label: 'Treasurers', icon: Shield },
    { path: '/leases', label: 'Leases', icon: FileText },
    { path: '/invoices', label: 'Invoices', icon: CreditCard },
    { path: '/receipts', label: 'Receipts', icon: Receipt },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/maintenance', label: 'Maintenance', icon: Wrench },
    { path: '/payouts', label: 'Payouts', icon: DollarSign },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const treasurerMenu = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/properties', label: 'My Properties', icon: Building2 }, // New
    { path: '/tenants', label: 'Tenants', icon: Users }, // New
    { path: '/invoices', label: 'Invoices', icon: FileText },
    { path: '/payments', label: 'Payment Verification', icon: CreditCard },
    { path: '/receipts', label: 'Receipts', icon: Receipt },
    { path: '/expenses', label: 'Expenses', icon: DollarSign },
    { path: '/analytics', label: 'Financial Reports', icon: BarChart3 },
  ];

  const tenantMenu = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/invoices', label: 'My Invoices', icon: FileText },
    { path: '/payments', label: 'My Payments', icon: CreditCard },
    { path: '/receipts', label: 'My Receipts', icon: Receipt },
    { path: '/maintenance', label: 'Maintenance Requests', icon: Wrench },
  ];

  const leadMenu = [{ path: '/dashboard', label: 'Dashboard', icon: Home }];

  // Add settings to all menus
  const commonItems = [
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const menuItems = [
    ...(user?.role === 'owner' ? ownerMenu : []),
    ...(user?.role === 'treasurer' ? treasurerMenu : []),
    ...(user?.role === 'tenant' ? tenantMenu : []),
    ...(user?.role === 'lead' ? leadMenu : []),
    ...commonItems,
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            >
              {isMobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
            <Building2 className="size-6 text-blue-600" />
            <div>
              <h1 className="font-semibold text-gray-900">
                Property Management System
              </h1>
              <p className="text-xs text-gray-500 capitalize">
                {user?.role} Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="size-5 text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 size-2 bg-red-600 rounded-full" />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b font-semibold">Notifications</div>
                <ScrollArea className="h-[300px]">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      No notifications
                    </div>
                  ) : (
                    <div className="divide-y">
                      {notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 hover:bg-gray-50 cursor-pointer ${!notification.read ? 'bg-blue-50/50' : ''}`}
                          onClick={() =>
                            markNotificationAsRead(notification.id)
                          }
                        >
                          <div className="text-sm font-medium mb-1">
                            {notification.title}
                          </div>
                          <div className="text-xs text-gray-600 mb-1">
                            {notification.message}
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(
                              notification.createdAt
                            ).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <div className="p-2 border-t text-center">
                  <Link
                    to="/notifications"
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    View all notifications
                  </Link>
                </div>
              </PopoverContent>
            </Popover>

            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="size-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation - Desktop */}
        <aside className="hidden lg:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-57px)] sticky top-[57px]">
          <nav className="p-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-[57px] bg-white z-20 overflow-y-auto">
            <nav className="p-4 space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
