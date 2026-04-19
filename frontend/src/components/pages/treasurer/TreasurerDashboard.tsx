import React from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { formatLKR } from '@/utils/formatters';

// ============================================================================
//  TREASURER DASHBOARD (The Vault)
// ============================================================================
//  This dashboard focuses on cash collection efficiency.
//  It shows pending bank slip verifications, monthly collection rates,
//  and a summary of total receipts issued across the system.
// ============================================================================

export function TreasurerDashboard() {
  const { invoices, payments, receipts, leases } = useApp();

  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const verifiedPayments = payments.filter((p) => p.status === 'verified');
  const rejectedPayments = payments.filter((p) => p.status === 'rejected');

  const totalPendingAmount = pendingPayments.reduce(
    (sum, p) => sum + p.amount,
    0
  );
  const totalVerifiedAmount = verifiedPayments.reduce(
    (sum, p) => sum + p.amount,
    0
  );

  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  const pendingInvoices = invoices.filter((i) => i.status === 'pending');

  const expectedMonthlyRevenue = leases
    .filter((l) => l.status === 'active')
    .reduce((sum, l) => sum + l.monthlyRent, 0);

  const collectionRate =
    expectedMonthlyRevenue > 0
      ? ((totalVerifiedAmount / expectedMonthlyRevenue) * 100).toFixed(1)
      : '0';

  const stats = [
    {
      title: 'Pending Verification',
      value: pendingPayments.length,
      subtitle: formatLKR(totalPendingAmount),
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Verified This Month',
      value: verifiedPayments.length,
      subtitle: formatLKR(totalVerifiedAmount),
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Receipts Generated',
      value: receipts.length,
      subtitle: 'Total issued',
      icon: DollarSign,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Collection Rate',
      value: `${collectionRate}%`,
      subtitle: 'Current month',
      icon: CheckCircle,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Treasurer Dashboard
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Payment verification and financial overview
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-semibold mt-2">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-gray-500 mt-1">
                        {stat.subtitle}
                      </p>
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

      {/* Alert for pending verifications */}
      {pendingPayments.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-orange-600" />
              <div>
                <p className="font-medium text-orange-900">
                  {pendingPayments.length} payment
                  {pendingPayments.length > 1 ? 's' : ''} awaiting verification
                </p>
                <p className="text-sm text-orange-700">
                  Please review and verify pending payments to generate receipts
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
            <CardTitle>Recent Payments for Verification</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.slice(0, 8).length > 0 ? (
              <div className="space-y-3">
                {payments.slice(0, 8).map((payment) => {
                  const invoice = invoices.find(
                    (i) => i.id === payment.invoiceId
                  );
                  return (
                    <div
                      key={payment.id}
                      className="flex justify-between items-center py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {payment.paymentMethod}
                        </p>
                        <p className="text-xs text-gray-500">
                          {invoice?.description} • Ref:{' '}
                          {payment.referenceNumber}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatLKR(payment.amount)}
                        </p>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            payment.status === 'verified'
                              ? 'bg-green-100 text-green-800'
                              : payment.status === 'pending'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No payments to display</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-gray-700">Expected Revenue</span>
                <span className="text-lg font-semibold">
                  {formatLKR(expectedMonthlyRevenue)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm text-gray-700">Collected</span>
                <span className="text-lg font-semibold text-green-700">
                  {formatLKR(totalVerifiedAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="text-sm text-gray-700">
                  Pending Verification
                </span>
                <span className="text-lg font-semibold text-orange-700">
                  {formatLKR(totalPendingAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Outstanding</span>
                <span className="text-lg font-semibold text-gray-700">
                  {formatLKR(
                    expectedMonthlyRevenue -
                      totalVerifiedAmount -
                      totalPendingAmount
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Status */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Status Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-gray-700">Paid Invoices</p>
              <p className="text-2xl font-semibold text-green-700 mt-2">
                {paidInvoices.length}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {formatLKR(paidInvoices.reduce((sum, i) => sum + i.amount, 0))}
              </p>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm text-gray-700">Pending Invoices</p>
              <p className="text-2xl font-semibold text-orange-700 mt-2">
                {pendingInvoices.length}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {formatLKR(
                  pendingInvoices.reduce((sum, i) => sum + i.amount, 0)
                )}
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700">Total Invoices</p>
              <p className="text-2xl font-semibold text-blue-700 mt-2">
                {invoices.length}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {formatLKR(invoices.reduce((sum, i) => sum + i.amount, 0))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
