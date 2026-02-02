import React from 'react';
import { useApp } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, FileText, CreditCard, Wrench, AlertCircle, CheckCircle, MessageSquare, History } from 'lucide-react';
import { NotificationBanner } from '@/components/common/NotificationBanner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChatInterface } from '@/components/common/ChatInterface';
import apiClient from '@/services/api';

export function TenantDashboard() {
  const { user } = useAuth();
  const { units, leases, invoices, payments, receipts, maintenanceRequests, tenants, notifications } = useApp();
  const [leadHistory, setLeadHistory] = React.useState<any>(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  React.useEffect(() => {
    // Fetch lead history
    apiClient.get('/leads/my-profile').then(res => {
      setLeadHistory(res.data);
    }).catch(err => {
      // Ignore if no history found
      console.log('No application history found');
    });
  }, []);

  // Find tenant's data - in real app, user.id would match tenant.id
  const tenantLeases = leases.filter(l => l.status === 'active');
  const currentLease = tenantLeases[0]; // Simplified: assuming one active lease

  const tenantInvoices = invoices;
  const pendingInvoices = tenantInvoices.filter(i => i.status === 'pending');
  const paidInvoices = tenantInvoices.filter(i => i.status === 'paid');

  const tenantPayments = payments;
  const pendingPayments = tenantPayments.filter(p => p.status === 'pending');
  const verifiedPayments = tenantPayments.filter(p => p.status === 'verified');

  const tenantMaintenanceRequests = maintenanceRequests;
  const openRequests = tenantMaintenanceRequests.filter(
    r => r.status === 'submitted' || r.status === 'in_progress'
  );

  const currentUnit = currentLease ? units.find(u => u.id === currentLease.unitId) : null;

  const overdueInvoices = pendingInvoices.filter(inv => new Date(inv.dueDate) < new Date());
  const totalDue = pendingInvoices.reduce((sum, inv) => sum + inv.amount, 0);

  const stats = [
    {
      title: 'Current Rent',
      value: currentLease ? `LKR ${currentLease.monthlyRent}` : 'N/A',
      subtitle: 'Monthly',
      icon: Home,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Pending Invoices',
      value: pendingInvoices.length,
      subtitle: `LKR ${totalDue} due`,
      icon: FileText,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Payment Status',
      value: pendingPayments.length,
      subtitle: 'Awaiting verification',
      icon: CreditCard,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Maintenance',
      value: openRequests.length,
      subtitle: 'Open requests',
      icon: Wrench,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Tenant Dashboard</h2>
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.name}</p>
          {leadHistory && (
            <Button variant="outline" size="sm" onClick={() => setIsHistoryOpen(true)}>
              <History className="size-4 mr-2" />
              Application Chat
            </Button>
          )}
        </div>
      </div>

      {/* Current Lease Info */}
      {currentLease && currentUnit && (
        <Card>
          <CardHeader>
            <CardTitle>Current Lease Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Unit Number</p>
                <p className="text-lg font-semibold mt-1">{currentUnit.unitNumber}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Unit Type</p>
                <p className="text-lg font-semibold mt-1">{currentUnit.type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Lease Period</p>
                <p className="text-sm font-semibold mt-1">
                  {currentLease.startDate} to {currentLease.endDate}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monthly Rent</p>
                <p className="text-lg font-semibold mt-1">LKR {currentLease.monthlyRent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
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

      {/* Lease Expiration Notifications */}
      <NotificationBanner
        notifications={notifications}
        userRole="tenant"
        tenantId={tenantLeases[0]?.tenantId}
      />

      {/* Alerts */}
      {overdueInvoices.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">
                  You have {overdueInvoices.length} overdue invoice{overdueInvoices.length > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-red-700">
                  Total amount: LKR {overdueInvoices.reduce((sum, inv) => sum + inv.amount, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantInvoices.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {tenantInvoices.slice(0, 5).map((invoice) => {
                  const unit = units.find(u => u.id === invoice.unitId);
                  const isPaid = invoice.status === 'paid';
                  const isOverdue = invoice.status === 'pending' && new Date(invoice.dueDate) < new Date();
                  return (
                    <div key={invoice.id} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        {isPaid ? (
                          <CheckCircle className="size-4 text-green-600" />
                        ) : (
                          <AlertCircle className={`size-4 ${isOverdue ? 'text-red-600' : 'text-orange-600'}`} />
                        )}
                        <div>
                          <p className="text-sm font-medium">{invoice.description || `Unit ${unit?.unitNumber}`}</p>
                          <p className="text-xs text-gray-500">Due: {invoice.dueDate}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">LKR {invoice.amount}</p>
                        <p className={`text-xs ${isPaid ? 'text-green-600' :
                          isOverdue ? 'text-red-600' :
                            'text-orange-600'
                          }`}>
                          {isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Pending'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No invoices available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantMaintenanceRequests.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {tenantMaintenanceRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="py-2 border-b last:border-0">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-medium">{request.title}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${request.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          request.status === 'completed' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                        {request.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} Priority - {request.submittedDate}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No maintenance requests</p>
            )}
          </CardContent>
        </Card>
      </div>


      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Application Chat History</DialogTitle>
          </DialogHeader>
          {leadHistory && (
            <ChatInterface leadId={leadHistory.id} readOnly={true} title="Archived Chat" />
          )}
        </DialogContent>
      </Dialog>
    </div >
  );
}
