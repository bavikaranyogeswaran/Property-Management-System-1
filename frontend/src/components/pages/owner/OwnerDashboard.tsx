import React from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Home, Users, DollarSign, AlertCircle, Wrench, TrendingUp } from 'lucide-react';
import { NotificationBanner } from '@/components/common/NotificationBanner';

export function OwnerDashboard() {
  const { properties, units, tenants, leases, invoices, maintenanceRequests, leads, notifications } = useApp();

  const totalProperties = properties.length;
  const totalUnits = units.length;
  const occupiedUnits = units.filter(u => u.status === 'occupied').length;
  const availableUnits = units.filter(u => u.status === 'available').length;
  const activeLeases = leases.filter(l => l.status === 'active').length;
  const totalTenants = tenants.length;

  const pendingInvoices = invoices.filter(i => i.status === 'pending');
  const overdueInvoices = invoices.filter(i => {
    if (i.status === 'pending' && new Date(i.dueDate) < new Date()) {
      return true;
    }
    return false;
  });

  const monthlyRevenue = leases
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + l.monthlyRent, 0);

  const pendingPayments = pendingInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  const openMaintenanceRequests = maintenanceRequests.filter(
    r => r.status === 'submitted' || r.status === 'in_progress'
  ).length;

  const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : '0';

  const stats = [
    {
      title: 'Total Properties',
      value: totalProperties,
      icon: Building2,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Units',
      value: `${occupiedUnits}/${totalUnits}`,
      subtitle: `${occupancyRate}% Occupied`,
      icon: Home,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Active Tenants',
      value: totalTenants,
      subtitle: `${activeLeases} Active Leases`,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Monthly Revenue',
      value: `LKR ${monthlyRevenue.toLocaleString()}`,
      subtitle: 'Expected',
      icon: DollarSign,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ];

  const alerts = [
    {
      title: 'Overdue Payments',
      count: overdueInvoices.length,
      amount: overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0),
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Pending Payments',
      count: pendingInvoices.length,
      amount: pendingPayments,
      icon: DollarSign,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Open Maintenance',
      count: openMaintenanceRequests,
      icon: Wrench,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'Available Units',
      count: availableUnits,
      icon: Home,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Owner Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Overview of your property management operations</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-semibold mt-2">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
                    )}
                  </div>
                  <div className={`${stat.bgColor} p-3 rounded-lg`}>
                    <Icon className={`size-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Alerts & Notifications */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Alerts & Notifications</h3>

        {/* Lease Expiration Notifications */}
        <NotificationBanner notifications={notifications} userRole="owner" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {alerts.map((alert, index) => {
            const Icon = alert.icon;
            return (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`${alert.bgColor} p-2 rounded-lg`}>
                      <Icon className={`size-4 ${alert.color}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">{alert.title}</p>
                      <p className="text-lg font-semibold">{alert.count}</p>
                      {alert.amount !== undefined && (
                        <p className="text-xs text-gray-500">LKR {alert.amount.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Conversion Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lead Conversion Pipeline</CardTitle>
              <TrendingUp className="size-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-600">Interested</p>
                  <p className="text-xl font-semibold text-blue-700">
                    {leads.filter(l => l.status === 'interested').length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">New Leads</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-600">In Negotiation</p>
                  <p className="text-xl font-semibold text-orange-700">
                    {leads.filter(l => l.status === 'negotiation').length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Close to signing</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <div>
                  <p className="text-xs text-gray-600">Converted</p>
                  <p className="text-xl font-semibold text-green-700">
                    {leads.filter(l => l.status === 'converted').length}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {leads.length > 0
                      ? `${((leads.filter(l => l.status === 'converted').length / leads.length) * 100).toFixed(0)}% rate`
                      : '0% rate'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Maintenance Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {maintenanceRequests.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {maintenanceRequests.slice(0, 5).map((request) => {
                  const unit = units.find(u => u.id === request.unitId);
                  const tenant = tenants.find(t => t.id === request.tenantId);
                  return (
                    <div key={request.id} className="flex justify-between items-start py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{request.title}</p>
                        <p className="text-xs text-gray-500">
                          {unit?.unitNumber} - {tenant?.name}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${request.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                        }`}>
                        {request.status.replace('_', ' ')}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No maintenance requests</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoices Section */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingInvoices.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {pendingInvoices.slice(0, 5).map((invoice) => {
                  const tenant = tenants.find(t => t.id === invoice.tenantId);
                  const unit = units.find(u => u.id === invoice.unitId);
                  const isOverdue = new Date(invoice.dueDate) < new Date();
                  return (
                    <div key={invoice.id} className="flex justify-between items-start py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">{tenant?.name}</p>
                        <p className="text-xs text-gray-500">
                          Unit {unit?.unitNumber} - Due {invoice.dueDate}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">LKR {invoice.amount}</p>
                        {isOverdue && (
                          <span className="text-xs text-red-600">Overdue</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No pending invoices</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
