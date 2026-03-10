import React from 'react';
import { useApp } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  CreditCard,
  BarChart3,
} from 'lucide-react';

export function TenantPaymentSummaryPage() {
  const { user } = useAuth();
  const { payments, invoices, receipts } = useApp();

  // Payment stats
  const verifiedPayments = payments.filter((p) => p.status === 'verified');
  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const rejectedPayments = payments.filter((p) => p.status === 'rejected');

  const totalPaid = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

  // Calculate on-time payment rate
  const getOnTimeRate = () => {
    if (verifiedPayments.length === 0) return 0;
    let onTimeCount = 0;
    verifiedPayments.forEach((payment) => {
      const invoice = invoices.find((inv) => inv.id === payment.invoiceId);
      if (invoice) {
        const paymentDate = payment.paymentDate || payment.submittedAt;
        if (paymentDate <= invoice.dueDate) {
          onTimeCount++;
        }
      }
    });
    return Math.round((onTimeCount / verifiedPayments.length) * 100);
  };

  const onTimeRate = getOnTimeRate();

  // Monthly breakdown (last 12 months)
  const getMonthlyBreakdown = () => {
    const months: Record<string, { paid: number; count: number }> = {};
    const now = new Date();

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      months[key] = { paid: 0, count: 0 };
    }

    // Fill in payment data
    verifiedPayments.forEach((p) => {
      const date = new Date(p.paymentDate || p.submittedAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (months[key]) {
        months[key].paid += p.amount;
        months[key].count += 1;
      }
    });

    return Object.entries(months).map(([key, val]) => {
      const [year, month] = key.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return {
        key,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        ...val,
      };
    });
  };

  const monthlyData = getMonthlyBreakdown();
  const maxMonthlyPaid = Math.max(...monthlyData.map((m) => m.paid), 1);

  // Stats cards
  const stats = [
    {
      title: 'Total Paid',
      value: `LKR ${totalPaid.toLocaleString()}`,
      subtitle: `${verifiedPayments.length} verified payments`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Pending Amount',
      value: `LKR ${totalPending.toLocaleString()}`,
      subtitle: `${pendingPayments.length} awaiting verification`,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
    {
      title: 'On-Time Rate',
      value: `${onTimeRate}%`,
      subtitle:
        onTimeRate >= 80
          ? 'Excellent payment record'
          : onTimeRate >= 50
            ? 'Room for improvement'
            : 'Needs attention',
      icon: TrendingUp,
      color:
        onTimeRate >= 80
          ? 'text-green-600'
          : onTimeRate >= 50
            ? 'text-yellow-600'
            : 'text-red-600',
      bgColor:
        onTimeRate >= 80
          ? 'bg-green-50'
          : onTimeRate >= 50
            ? 'bg-yellow-50'
            : 'bg-red-50',
    },
    {
      title: 'Total Receipts',
      value: receipts.length,
      subtitle: 'Payment receipts generated',
      icon: CreditCard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  // Payment status breakdown
  const statusBreakdown = [
    {
      label: 'Verified',
      count: verifiedPayments.length,
      color: 'bg-green-500',
    },
    {
      label: 'Pending',
      count: pendingPayments.length,
      color: 'bg-yellow-500',
    },
    {
      label: 'Rejected',
      count: rejectedPayments.length,
      color: 'bg-red-500',
    },
  ];

  const totalPaymentCount = payments.length || 1;

  const statusColors: Record<string, string> = {
    verified: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Payment Summary
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your payment history and financial analytics
        </p>
      </div>

      {/* Stats Cards */}
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
                    <p className="text-xs text-gray-500 mt-1">
                      {stat.subtitle}
                    </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Breakdown Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-5 text-blue-600" />
              Monthly Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No payment data available yet
              </p>
            ) : (
              <div className="space-y-2">
                {monthlyData.map((month) => (
                  <div key={month.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                      {month.label}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max((month.paid / maxMonthlyPaid) * 100, month.paid > 0 ? 15 : 0)}%`,
                        }}
                      >
                        {month.paid > 0 && (
                          <span className="text-[10px] text-white font-medium whitespace-nowrap">
                            LKR {month.paid.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-8 flex-shrink-0">
                      {month.count > 0 ? `×${month.count}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No payments yet
              </p>
            ) : (
              <div className="space-y-4">
                {/* Visual bar */}
                <div className="flex h-4 rounded-full overflow-hidden">
                  {statusBreakdown.map(
                    (s) =>
                      s.count > 0 && (
                        <div
                          key={s.label}
                          className={`${s.color} transition-all`}
                          style={{
                            width: `${(s.count / totalPaymentCount) * 100}%`,
                          }}
                        />
                      )
                  )}
                </div>

                {/* Legend */}
                <div className="space-y-3">
                  {statusBreakdown.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`size-3 rounded-full ${s.color}`}
                        />
                        <span className="text-sm text-gray-600">
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{s.count}</span>
                        <span className="text-xs text-gray-400">
                          ({Math.round((s.count / totalPaymentCount) * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* On-time indicator */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">
                      On-time payment rate
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        onTimeRate >= 80 ? 'text-green-600' : 'text-yellow-600'
                      }`}
                    >
                      {onTimeRate}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        onTimeRate >= 80
                          ? 'bg-green-500'
                          : onTimeRate >= 50
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${onTimeRate}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5 text-purple-600" />
            Recent Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No payments made yet. Submit your first payment from the Payments
              page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-gray-600">Date</th>
                    <th className="pb-3 font-medium text-gray-600">Amount</th>
                    <th className="pb-3 font-medium text-gray-600">Method</th>
                    <th className="pb-3 font-medium text-gray-600">
                      Reference
                    </th>
                    <th className="pb-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...payments]
                    .sort(
                      (a, b) =>
                        new Date(b.submittedAt).getTime() -
                        new Date(a.submittedAt).getTime()
                    )
                    .slice(0, 15)
                    .map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="py-3">
                          {formatDate(
                            payment.paymentDate || payment.submittedAt
                          )}
                        </td>
                        <td className="py-3 font-medium">
                          LKR {payment.amount.toLocaleString()}
                        </td>
                        <td className="py-3 text-gray-600 capitalize">
                          {payment.paymentMethod.replace('_', ' ')}
                        </td>
                        <td className="py-3 text-gray-500 font-mono text-xs">
                          {payment.referenceNumber || '—'}
                        </td>
                        <td className="py-3">
                          <Badge
                            className={
                              statusColors[payment.status] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            <span className="flex items-center gap-1">
                              {payment.status === 'verified' && (
                                <CheckCircle className="size-3" />
                              )}
                              {payment.status === 'rejected' && (
                                <XCircle className="size-3" />
                              )}
                              {payment.status === 'pending' && (
                                <Clock className="size-3" />
                              )}
                              {payment.status.charAt(0).toUpperCase() +
                                payment.status.slice(1)}
                            </span>
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
