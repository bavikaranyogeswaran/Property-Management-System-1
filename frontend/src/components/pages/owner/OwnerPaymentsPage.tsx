import React, { useState } from 'react';
import { useApp, Payment } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  ImageIcon,
} from 'lucide-react';
import { formatLKR } from '@/utils/formatters';

export function OwnerPaymentsPage() {
  const { user } = useAuth();
  const { payments, invoices, tenants, units, properties } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);

  const verifiedPayments = payments.filter((p) => p.status === 'verified');
  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const rejectedPayments = payments.filter((p) => p.status === 'rejected');

  const totalVerified = verifiedPayments.reduce((s, p) => s + p.amount, 0);
  const totalPending = pendingPayments.reduce((s, p) => s + p.amount, 0);

  const stats = [
    {
      label: 'Total Payments',
      value: payments.length,
      icon: CreditCard,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Pending Verification',
      value: pendingPayments.length,
      subtitle: formatLKR(totalPending),
      icon: Clock,
      color: 'text-yellow-600 bg-yellow-50',
    },
    {
      label: 'Verified',
      value: verifiedPayments.length,
      subtitle: formatLKR(totalVerified),
      icon: CheckCircle,
      color: 'text-green-600 bg-green-50',
    },
    {
      label: 'Rejected',
      value: rejectedPayments.length,
      icon: XCircle,
      color: 'text-red-600 bg-red-50',
    },
  ];

  const statusColors: Record<string, string> = {
    verified: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const filterPayments = (list: Payment[]) => {
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((p) => {
      const tenant = tenants.find((t) => t.id === p.tenantId);
      const invoice = invoices.find((i) => i.id === p.invoiceId);
      const unit = invoice ? units.find((u) => u.id === invoice.unitId) : null;
      return (
        tenant?.name?.toLowerCase().includes(term) ||
        tenant?.email?.toLowerCase().includes(term) ||
        p.referenceNumber?.toLowerCase().includes(term) ||
        p.paymentMethod?.toLowerCase().includes(term) ||
        unit?.unitNumber?.toLowerCase().includes(term) ||
        p.amount.toString().includes(term)
      );
    });
  };

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderPaymentRows = (data: Payment[]) => {
    if (!data || data.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={8} className="text-center py-12">
            <CreditCard className="size-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No payments found</p>
          </TableCell>
        </TableRow>
      );
    }

    const sorted = [...data].sort((a, b) => {
      const dateA = a.paymentDate || a.submittedAt || '';
      const dateB = b.paymentDate || b.submittedAt || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return sorted.map((payment) => {
      const tenant = tenants.find((t) => t.id === payment.tenantId);
      const invoice = invoices.find((i) => i.id === payment.invoiceId);
      const unit = invoice ? units.find((u) => u.id === invoice.unitId) : null;
      const property = unit
        ? properties.find((p) => p.id === unit.propertyId)
        : null;

      return (
        <TableRow key={payment.id}>
          <TableCell>
            <div className="text-sm">
              {formatDate(payment.paymentDate || payment.submittedAt)}
            </div>
            {payment.submittedAt && (
              <div className="text-xs text-gray-500">
                Submitted {formatDate(payment.submittedAt)}
              </div>
            )}
          </TableCell>
          <TableCell>
            <div className="text-sm font-medium">{tenant?.name || 'N/A'}</div>
            <div className="text-xs text-gray-500">{tenant?.email || ''}</div>
          </TableCell>
          <TableCell>
            <div className="text-sm font-medium">{property?.name || 'N/A'}</div>
            <div className="text-xs text-gray-500">
              Unit {unit?.unitNumber || 'N/A'}
            </div>
          </TableCell>
          <TableCell>
            <span className="text-sm capitalize">
              {(payment.paymentMethod || 'N/A').replace('_', ' ')}
            </span>
          </TableCell>
          <TableCell>
            <span className="font-mono text-xs text-gray-600">
              {payment.referenceNumber || '—'}
            </span>
          </TableCell>
          <TableCell className="text-right font-semibold">
            {formatLKR(payment.amount)}
          </TableCell>
          <TableCell>
            <Badge
              className={
                statusColors[payment.status] || 'bg-gray-100 text-gray-800'
              }
            >
              <span className="flex items-center gap-1">
                {payment.status === 'verified' && (
                  <CheckCircle className="size-3" />
                )}
                {payment.status === 'pending' && <Clock className="size-3" />}
                {payment.status === 'rejected' && (
                  <XCircle className="size-3" />
                )}
                {payment.status
                  ? payment.status.charAt(0).toUpperCase() +
                    payment.status.slice(1)
                  : 'Unknown'}
              </span>
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            {payment.proofUrl ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setProofImage(payment.proofUrl!)}
              >
                <ImageIcon className="size-4 mr-1" />
                View
              </Button>
            ) : (
              <span className="text-xs text-gray-400">None</span>
            )}
          </TableCell>
        </TableRow>
      );
    });
  };

  const tableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Tenant</TableHead>
        <TableHead>Property / Unit</TableHead>
        <TableHead>Method</TableHead>
        <TableHead>Reference</TableHead>
        <TableHead className="text-right">Amount</TableHead>
        <TableHead>Status</TableHead>
        <TableHead className="text-right">Proof</TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Payment Tracking
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Monitor all tenant payment submissions and their verification status
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-gray-500 mt-1">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <Icon className="size-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 size-4" />
        <Input
          placeholder="Search by tenant, reference, method, unit, or amount..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabbed Payment Tables */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({payments.length})</TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="size-3.5 mr-1" />
            Pending ({pendingPayments.length})
          </TabsTrigger>
          <TabsTrigger value="verified">
            <CheckCircle className="size-3.5 mr-1" />
            Verified ({verifiedPayments.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <XCircle className="size-3.5 mr-1" />
            Rejected ({rejectedPayments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  {tableHeader}
                  <TableBody>
                    {renderPaymentRows(filterPayments(payments))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  {tableHeader}
                  <TableBody>
                    {renderPaymentRows(filterPayments(pendingPayments))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  {tableHeader}
                  <TableBody>
                    {renderPaymentRows(filterPayments(verifiedPayments))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  {tableHeader}
                  <TableBody>
                    {renderPaymentRows(filterPayments(rejectedPayments))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Proof Image Dialog */}
      <Dialog
        open={proofImage !== null}
        onOpenChange={() => setProofImage(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
          </DialogHeader>
          {proofImage && (
            <div className="flex justify-center">
              <img
                src={proofImage}
                alt="Payment proof"
                className="max-w-full max-h-[60vh] rounded-lg border object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
