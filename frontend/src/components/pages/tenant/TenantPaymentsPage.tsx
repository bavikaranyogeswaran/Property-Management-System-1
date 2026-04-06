import React, { useState } from 'react';
import {
  useApp,
  Payment,
  Receipt as ReceiptType,
} from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  FileText,
} from 'lucide-react';
import { ReceiptViewer } from '@/components/common/ReceiptViewer';
import { formatLKR } from '@/utils/formatters';

export function TenantPaymentsPage() {
  const { user, activeLeaseId, tenantLeases: leasesFromAuth } = useAuth();
  const { payments, receipts, invoices, units, properties, tenants } = useApp();
  const [selectedReceipt, setSelectedReceipt] = useState<{
    receipt: ReceiptType;
    tenantName: string;
    tenantEmail: string;
    propertyName: string;
    unitNumber: string;
    paymentMethod: string;
    paymentDate: string;
    description: string;
  } | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Multi-Unit Logic (E19): Use active lease from context
  const currentLease = leasesFromAuth.find((l) => l.id === activeLeaseId);

  const tenantPayments = currentLease
    ? payments.filter((p) => {
        const inv = invoices.find(i => i.id === p.invoiceId);
        return inv?.leaseId === currentLease.id;
      })
    : [];

  const verifiedPayments = tenantPayments.filter(
    (p) => p.status === 'verified'
  );
  const pendingPayments = tenantPayments.filter((p) => p.status === 'pending');
  const rejectedPayments = tenantPayments.filter(
    (p) => p.status === 'rejected'
  );

  const totalPaid = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);

  const stats = [
    {
      label: 'Total Payments',
      value: tenantPayments.length,
      icon: CreditCard,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Verified',
      value: verifiedPayments.length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Pending Verification',
      value: pendingPayments.length,
      icon: Clock,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Total Paid',
      value: formatLKR(totalPaid),
      subtitle: 'All time',
      icon: FileText,
      color: 'bg-purple-50 text-purple-700',
    },
  ];

  const getPaymentInvoice = (paymentId: string) => {
    const payment = payments.find((p) => p.id === paymentId);
    return payment ? invoices.find((i) => i.id === payment.invoiceId) : null;
  };

  const getPaymentReceipt = (paymentId: string) => {
    return receipts.find((r) => r.paymentId === paymentId);
  };

  const PaymentRow = ({ payment }: { payment: Payment }) => {
    const invoice = getPaymentInvoice(payment.id);
    const unit = invoice ? units.find((u) => u.id === invoice.unitId) : null;
    const property = unit
      ? properties.find((p) => p.id === unit.propertyId)
      : null;
    const receipt = getPaymentReceipt(payment.id);
    const tenant = tenants.find((t) => t.id === payment.tenantId);

    return (
      <TableRow>
        <TableCell>
          <div className="font-medium">{payment.paymentDate}</div>
          <div className="text-xs text-gray-500">
            Submitted: {payment.submittedAt}
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="font-medium">{property?.name || 'N/A'}</div>
            <div className="text-gray-500">
              Unit {unit?.unitNumber || 'N/A'}
            </div>
          </div>
        </TableCell>
        <TableCell className="font-semibold">{formatLKR(payment.amount)}</TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="font-medium">{payment.paymentMethod}</div>
            <div className="text-gray-500 text-xs">
              Ref: {payment.referenceNumber}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={
              payment.status === 'verified'
                ? 'default'
                : payment.status === 'pending'
                  ? 'secondary'
                  : 'destructive'
            }
            className={
              payment.status === 'verified'
                ? 'bg-green-100 text-green-700'
                : payment.status === 'pending'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-red-100 text-red-700'
            }
          >
            {payment.status === 'verified' ? (
              <>
                <CheckCircle className="size-3 mr-1" /> Verified
              </>
            ) : payment.status === 'pending' ? (
              <>
                <Clock className="size-3 mr-1" /> Pending
              </>
            ) : (
              <>
                <XCircle className="size-3 mr-1" /> Rejected
              </>
            )}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedPayment(payment)}
            >
              View Details
            </Button>
            {payment.status === 'verified' &&
              receipt &&
              tenant &&
              unit &&
              property && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedReceipt({
                      receipt,
                      tenantName: tenant.name,
                      tenantEmail: tenant.email,
                      propertyName: property.name,
                      unitNumber: unit.unitNumber,
                      paymentMethod: payment.paymentMethod,
                      paymentDate: payment.paymentDate,
                      description: invoice?.description || 'Rent Payment',
                    });
                  }}
                >
                  <Download className="size-4 mr-2" />
                  Receipt
                </Button>
              )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">My Payments</h2>
        <p className="text-sm text-gray-500 mt-1">
          View your payment history and status
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p
                      className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
                    >
                      {stat.value}
                    </p>
                    {stat.subtitle && (
                      <p className="text-xs text-gray-500 mt-1">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                  <Icon
                    className={`size-8 ${stat.color.split(' ')[1]} opacity-20`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card for Pending Payments */}
      {pendingPayments.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-orange-600" />
              <div>
                <p className="font-medium text-orange-900">
                  You have {pendingPayments.length} payment
                  {pendingPayments.length > 1 ? 's' : ''} awaiting verification
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  Your payments are being reviewed by the treasurer and will be
                  verified soon.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="all" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="all">
                  All Payments ({tenantPayments.length})
                </TabsTrigger>
                <TabsTrigger value="verified">
                  <CheckCircle className="size-4 mr-2" />
                  Verified ({verifiedPayments.length})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  <Clock className="size-4 mr-2" />
                  Pending ({pendingPayments.length})
                </TabsTrigger>
                {rejectedPayments.length > 0 && (
                  <TabsTrigger value="rejected">
                    <XCircle className="size-4 mr-2" />
                    Rejected ({rejectedPayments.length})
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {/* All Payments Tab */}
            <TabsContent value="all" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantPayments.map((payment) => (
                      <PaymentRow key={payment.id} payment={payment} />
                    ))}
                  </TableBody>
                </Table>
                {tenantPayments.length === 0 && (
                  <div className="py-12 text-center">
                    <CreditCard className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No payments yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Your payment history will appear here
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Verified Payments Tab */}
            <TabsContent value="verified" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {verifiedPayments.map((payment) => (
                      <PaymentRow key={payment.id} payment={payment} />
                    ))}
                  </TableBody>
                </Table>
                {verifiedPayments.length === 0 && (
                  <div className="py-12 text-center">
                    <CheckCircle className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No verified payments yet</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Pending Payments Tab */}
            <TabsContent value="pending" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.map((payment) => (
                      <PaymentRow key={payment.id} payment={payment} />
                    ))}
                  </TableBody>
                </Table>
                {pendingPayments.length === 0 && (
                  <div className="py-12 text-center">
                    <Clock className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No pending payments</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Rejected Payments Tab */}
            {rejectedPayments.length > 0 && (
              <TabsContent value="rejected" className="m-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment Date</TableHead>
                        <TableHead>Property & Unit</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rejectedPayments.map((payment) => (
                        <PaymentRow key={payment.id} payment={payment} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Payment Details Dialog */}
      <Dialog
        open={!!selectedPayment}
        onOpenChange={(open) => !open && setSelectedPayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          {selectedPayment &&
            (() => {
              const invoice = getPaymentInvoice(selectedPayment.id);
              const unit = invoice
                ? units.find((u) => u.id === invoice.unitId)
                : null;
              const property = unit
                ? properties.find((p) => p.id === unit.propertyId)
                : null;
              const receipt = getPaymentReceipt(selectedPayment.id);

              return (
                <div className="space-y-4 mt-4">
                  {/* Status */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">
                        Payment Status
                      </span>
                      <Badge
                        variant={
                          selectedPayment.status === 'verified'
                            ? 'default'
                            : selectedPayment.status === 'pending'
                              ? 'secondary'
                              : 'destructive'
                        }
                        className={
                          selectedPayment.status === 'verified'
                            ? 'bg-green-100 text-green-700'
                            : selectedPayment.status === 'pending'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                        }
                      >
                        {selectedPayment.status}
                      </Badge>
                    </div>
                  </div>

                  {/* Payment Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Amount</p>
                      <p className="font-semibold text-lg">
                        {formatLKR(selectedPayment.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payment Date</p>
                      <p className="font-medium">
                        {selectedPayment.paymentDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Payment Method</p>
                      <p className="font-medium">
                        {selectedPayment.paymentMethod}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Reference Number</p>
                      <p className="font-medium font-mono text-sm">
                        {selectedPayment.referenceNumber}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Submitted At</p>
                      <p className="font-medium">
                        {selectedPayment.submittedAt}
                      </p>
                    </div>
                  </div>

                  {/* Property Information */}
                  {property && unit && (
                    <div className="border-t pt-4">
                      <h4 className="font-semibold mb-3">
                        Property Information
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Property</p>
                          <p className="font-medium">{property.name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Unit</p>
                          <p className="font-medium">Unit {unit.unitNumber}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Receipt Info */}
                  {receipt && (
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">
                            Receipt Number
                          </p>
                          <p className="font-medium">{receipt.receiptNumber}</p>
                        </div>
                        <CheckCircle className="size-5 text-green-600" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer Dialog */}
      <Dialog
        open={selectedReceipt !== null}
        onOpenChange={() => setSelectedReceipt(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="sr-only">Payment Receipt</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <ReceiptViewer
              receipt={selectedReceipt.receipt}
              tenantName={selectedReceipt.tenantName}
              tenantEmail={selectedReceipt.tenantEmail}
              propertyName={selectedReceipt.propertyName}
              unitNumber={selectedReceipt.unitNumber}
              paymentMethod={selectedReceipt.paymentMethod}
              paymentDate={selectedReceipt.paymentDate}
              description={selectedReceipt.description}
              onClose={() => setSelectedReceipt(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
