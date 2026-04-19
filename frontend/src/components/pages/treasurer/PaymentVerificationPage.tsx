import React, { useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  Eye,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatLKR } from '@/utils/formatters';

export function PaymentVerificationPage() {
  const { payments, invoices, tenants, units, properties, verifyPayment } =
    useApp();
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);

  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const verifiedPayments = payments.filter((p) => p.status === 'verified');
  const rejectedPayments = payments.filter((p) => p.status === 'rejected');

  const handleVerify = (paymentId: string, approved: boolean) => {
    verifyPayment(paymentId, approved);
    if (approved) {
      toast.success('Payment verified and receipt generated');
    } else {
      toast.error('Payment rejected');
    }
    setSelectedPayment(null);
  };

  const stats = [
    {
      label: 'Pending Verification',
      value: pendingPayments.length,
      subtitle: formatLKR(
        pendingPayments.reduce((sum, p) => sum + p.amount, 0)
      ),
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Verified Today',
      value: verifiedPayments.filter((p) =>
        p.submittedAt.startsWith(new Date().toISOString().split('T')[0])
      ).length,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Total Verified',
      value: verifiedPayments.length,
      subtitle: formatLKR(
        verifiedPayments.reduce((sum, p) => sum + p.amount, 0)
      ),
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Rejected',
      value: rejectedPayments.length,
      color: 'bg-red-50 text-red-700',
    },
  ];

  const PaymentDetailsDialog = () => {
    const payment = payments.find((p) => p.id === selectedPayment);
    if (!payment) return null;

    const invoice = invoices.find(
      (i) => String(i.id) === String(payment.invoiceId)
    );
    const tenant = tenants.find(
      (t) => String(t.id) === String(payment.tenantId)
    );
    const unit = invoice
      ? units.find((u) => String(u.id) === String(invoice.unitId))
      : null;
    const property = unit
      ? properties.find((p) => String(p.id) === String(unit.propertyId))
      : null;

    return (
      <Dialog
        open={!!selectedPayment}
        onOpenChange={(open) => !open && setSelectedPayment(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Payment Information */}
            <div>
              <h3 className="font-medium text-sm text-gray-700 mb-3">
                Payment Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Payment ID</p>
                  <p className="font-mono text-sm">{payment.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="text-lg font-semibold">
                    {formatLKR(payment.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Method</p>
                  <p className="font-medium">{payment.paymentMethod}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reference Number</p>
                  <p className="font-mono text-sm">{payment.referenceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Date</p>
                  <p>{payment.paymentDate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Submitted At</p>
                  <p>{new Date(payment.submittedAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Payment Proof */}
              {payment.proofUrl && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-blue-800 uppercase tracking-wide">
                      Payment Proof / Bank Slip
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-700 hover:text-blue-900 h-7 px-2"
                      onClick={() => window.open(payment.proofUrl!, '_blank')}
                    >
                      <ExternalLink className="size-3 mr-1" />
                      Open
                    </Button>
                  </div>
                  {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(payment.proofUrl) ? (
                    <img
                      src={payment.proofUrl}
                      alt="Payment proof"
                      className="w-full max-h-64 object-contain rounded border border-blue-200 bg-white cursor-pointer"
                      onClick={() => window.open(payment.proofUrl!, '_blank')}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full bg-white hover:bg-blue-50 text-blue-700 border-blue-200"
                      onClick={() => window.open(payment.proofUrl!, '_blank')}
                    >
                      <ExternalLink className="size-4 mr-2" />
                      View Attached Proof (PDF / Document)
                    </Button>
                  )}
                </div>
              )}
              {!payment.proofUrl &&
                payment.paymentMethod?.toLowerCase().includes('bank') && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">
                      No Proof Uploaded
                    </p>
                    <p className="text-xs text-amber-600">
                      The tenant did not attach a bank slip. Contact them before
                      approving.
                    </p>
                  </div>
                )}
            </div>

            {/* Tenant Information */}
            <div className="border-t pt-4">
              <h3 className="font-medium text-sm text-gray-700 mb-3">
                Tenant Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Name</p>
                  <p className="font-medium">{tenant?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p>{tenant?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p>{tenant?.phone}</p>
                </div>
              </div>
            </div>

            {/* Property Information */}
            {property && unit && (
              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">
                  Property Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Property</p>
                    <p className="font-medium">{property.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Unit</p>
                    <p className="font-medium">{unit.unitNumber}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice Information */}
            {invoice && (
              <div className="border-t pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-3">
                  Invoice Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Invoice ID</p>
                    <p className="font-mono text-sm">{invoice.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Invoice Amount</p>
                    <p className="font-semibold">{formatLKR(invoice.amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Due Date</p>
                    <p>{invoice.dueDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Invoice Status</p>
                    <Badge
                      variant={
                        invoice.status === 'paid' ? 'default' : 'secondary'
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {payment.status === 'pending' && (
              <div className="flex gap-3 justify-end border-t pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleVerify(payment.id, false)}
                >
                  <XCircle className="size-4 mr-2" />
                  Reject Payment
                </Button>
                <Button onClick={() => handleVerify(payment.id, true)}>
                  <CheckCircle className="size-4 mr-2" />
                  Approve Payment
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Payment Verification
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Review and verify tenant payments
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-600">{stat.label}</p>
              <p
                className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
              >
                {stat.value}
              </p>
              {stat.subtitle && (
                <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            Pending Verification
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Property/Unit</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.map((payment) => {
                  const tenant = tenants.find(
                    (t) => String(t.id) === String(payment.tenantId)
                  );
                  const invoice = invoices.find(
                    (i) => String(i.id) === String(payment.invoiceId)
                  );
                  const unit = invoice
                    ? units.find((u) => String(u.id) === String(invoice.unitId))
                    : null;
                  const property = unit
                    ? properties.find(
                        (p) => String(p.id) === String(unit.propertyId)
                      )
                    : null;

                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.submittedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {tenant?.name}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{property?.name}</div>
                          <div className="text-gray-500">
                            Unit {unit?.unitNumber}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatLKR(payment.amount)}
                      </TableCell>
                      <TableCell>{payment.paymentMethod}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {payment.referenceNumber}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedPayment(payment.id)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVerify(payment.id, false)}
                          >
                            <XCircle className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleVerify(payment.id, true)}
                          >
                            <CheckCircle className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {pendingPayments.length === 0 && (
              <div className="py-12 text-center">
                <CreditCard className="size-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No pending payments</p>
                <p className="text-sm text-gray-500 mt-1">
                  All payments have been processed
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Verified</CardTitle>
          </CardHeader>
          <CardContent>
            {verifiedPayments.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {verifiedPayments.slice(0, 5).map((payment) => {
                  const tenant = tenants.find((t) => t.id === payment.tenantId);
                  return (
                    <div
                      key={payment.id}
                      className="flex justify-between items-center py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{tenant?.name}</p>
                        <p className="text-xs text-gray-500">
                          {payment.paymentMethod}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatLKR(payment.amount)}
                        </p>
                        <Badge variant="default" className="text-xs">
                          Verified
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No verified payments yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            {rejectedPayments.slice(0, 5).length > 0 ? (
              <div className="space-y-3">
                {rejectedPayments.slice(0, 5).map((payment) => {
                  const tenant = tenants.find((t) => t.id === payment.tenantId);
                  return (
                    <div
                      key={payment.id}
                      className="flex justify-between items-center py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{tenant?.name}</p>
                        <p className="text-xs text-gray-500">
                          {payment.paymentMethod}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatLKR(payment.amount)}
                        </p>
                        <Badge variant="destructive" className="text-xs">
                          Rejected
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No rejected payments</p>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentDetailsDialog />
    </div>
  );
}
