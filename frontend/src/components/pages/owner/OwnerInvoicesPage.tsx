import React, { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useApp, Receipt as ReceiptType } from '@/app/context/AppContext';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Plus,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { ReceiptViewer } from '@/components/common/ReceiptViewer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Helper Form Component
function RecordCashPaymentForm({
  invoice,
  tenantName,
}: {
  invoice: any;
  tenantName?: string;
}) {
  const { recordCashPayment } = useApp();
  const [amount, setAmount] = useState(invoice.amount.toString());
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await recordCashPayment(invoice.id, parseFloat(amount), date);
      // Close dialog? Ideally parent handles logic, but simple form submission here.
      // We rely on toast from context.
      // To close dialog, we might need a prop or use DialogClose.
      // For now, let it submit.
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Tenant</Label>
        <div className="p-2 bg-gray-50 rounded border">
          {tenantName || 'Unknown'}
        </div>
      </div>
      <div>
        <Label>Amount (LKR)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Payment Date</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Recording...' : 'Confirm Cash Payment'}
      </Button>
    </form>
  );
}

export function OwnerInvoicesPage() {
  const { user } = useAuth();
  const {
    invoices,
    tenants,
    units,
    properties,
    leases,
    receipts,
    payments,
    generateMonthlyInvoices,
  } = useApp();
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

  const pendingInvoices = invoices.filter((i) => i.status === 'pending');
  const paidInvoices = invoices.filter((i) => i.status === 'paid');
  // Fix: Compare dates strictly (YYYY-MM-DD string comparison works if format is ISO)
  // Use local date to avoid UTC shifts marking today's invoices as overdue
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const overdueInvoices = pendingInvoices.filter((i) => i.dueDate < todayStr);

  const handleGenerateInvoices = () => {
    generateMonthlyInvoices();
    toast.success('Monthly invoices generated successfully');
  };

  const stats = [
    {
      label: 'Total Invoices',
      value: invoices.length,
      icon: FileText,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Pending',
      value: pendingInvoices.length,
      subtitle: `LKR ${pendingInvoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}`,
      icon: Clock,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Overdue',
      value: overdueInvoices.length,
      subtitle: `LKR ${overdueInvoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}`,
      icon: AlertCircle,
      color: 'bg-red-50 text-red-700',
    },
    {
      label: 'Paid',
      value: paidInvoices.length,
      subtitle: `LKR ${paidInvoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}`,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
  ];

  const InvoiceTable = ({
    invoicesList,
  }: {
    invoicesList: typeof invoices;
  }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice ID</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead>Property</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Generated</TableHead>
            <TableHead>Status</TableHead>
            {/* Only show the Actions header if the user is a treasurer (who can use Cash Pay) 
                or if we are exclusively viewing paid invoices (the Paid tab) */}
            {(user?.role === 'treasurer' || (invoicesList.length > 0 && invoicesList.every(i => i.status === 'paid'))) && (
              <TableHead className="text-right">Actions</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoicesList.map((invoice) => {
            const tenantName = invoice.tenantName || 'Unknown';
            const propertyName = invoice.propertyName || 'Unknown';
            const unitNumber = invoice.unitNumber || 'Unknown';

            // Fallback object lookups (needed for Receipt/Form logic that use other fields like email)
            const tenant = tenants.find((t) => t.id === invoice.tenantId);
            const unit = units.find((u) => u.id === invoice.unitId);
            const property = unit
              ? properties.find((p) => p.id === unit.propertyId)
              : null;

            // Search query filtering (if implemented) or other logic
            // Note: searchQuery is not defined in this scope. This line will cause a compilation error.
            // Assuming it's a placeholder or intended for a different context.
            // const matchesSearch =
            //   tenantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            //   propertyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            //   unitNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            //   invoice.id.includes(searchQuery); is YYYY-MM-DD
            const isOverdue =
              invoice.status === 'pending' && invoice.dueDate < todayStr;
            const isLateFee = invoice.description?.includes('Late Fee');
            const receipt = receipts.find((r) => r.invoiceId === invoice.id);

            return (
              <TableRow
                key={invoice.id}
                className={isLateFee ? 'bg-red-50' : ''}
              >
                <TableCell className="font-mono text-sm">
                  #{invoice.id}
                </TableCell>
                <TableCell className="font-medium">{tenantName}</TableCell>
                <TableCell>{propertyName}</TableCell>
                <TableCell>{unitNumber}</TableCell>
                <TableCell className="font-semibold">
                  LKR {invoice.amount}
                </TableCell>
                <TableCell className="align-middle h-14">
                  <div className={`flex flex-col gap-0.5 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                    <span>{invoice.dueDate}</span>
                    {isOverdue && <span className="text-xs">Overdue</span>}
                  </div>
                </TableCell>
                <TableCell className="align-middle h-14">{invoice.generatedDate}</TableCell>
                <TableCell className="align-middle h-14">
                  <div className="flex gap-2">
                    <Badge
                      variant={
                        invoice.status === 'paid'
                          ? 'default'
                          : invoice.status === 'partially_paid'
                            ? 'outline' // Changed to outline or custom class for visibility
                            : isOverdue
                              ? 'destructive'
                              : 'secondary'
                      }
                      className={
                        invoice.status === 'partially_paid'
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          : ''
                      }
                    >
                      {isOverdue
                        ? 'Overdue'
                        : invoice.status === 'partially_paid'
                          ? 'Partially Paid'
                          : invoice.status}
                    </Badge>
                    {isLateFee && (
                      <Badge
                        variant="destructive"
                        className="bg-red-100 text-red-700 border-red-200"
                      >
                        Late Fee
                      </Badge>
                    )}
                  </div>
                </TableCell>
                
                {(user?.role === 'treasurer' || (invoicesList.length > 0 && invoicesList.every(i => i.status === 'paid'))) && (
                  <TableCell className="text-right align-middle h-14">
                    <div className="flex items-center justify-end gap-2">
                    {/* Cash Payment Button for Treasurer */}
                    {user?.role === 'treasurer' && invoice.status !== 'paid' && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <DollarSign className="size-3 mr-1" />
                            Cash Pay
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Record Cash Payment</DialogTitle>
                          </DialogHeader>
                          <RecordCashPaymentForm
                            invoice={invoice}
                            tenantName={tenant?.name}
                          />
                        </DialogContent>
                      </Dialog>
                    )}

                    {invoice.status === 'paid' &&
                      receipt &&
                      (() => {
                        const receiptPayment = payments.find(
                          (p) => p.id === receipt.paymentId
                        );
                        if (!receiptPayment || !tenant || !unit || !property)
                          return null;

                        return (
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
                                paymentMethod: receiptPayment.paymentMethod,
                                paymentDate: receiptPayment.paymentDate,
                                description: invoice.description || 'Rent Payment',
                              });
                            }}
                          >
                            <Download className="size-4 mr-2" />
                            Receipt
                          </Button>
                        );
                      })()}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {invoicesList.length === 0 && (
        <div className="py-12 text-center">
          <FileText className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No invoices found</p>
        </div>
      )}
    </div>
  );

  const activeLeases = leases.filter((l) => l.status === 'active');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Invoices</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage rent invoices and payments
          </p>
        </div>
        {user?.role === 'treasurer' && (
          <Button onClick={handleGenerateInvoices}>
            <Plus className="size-4 mr-2" />
            Generate Monthly Invoices
          </Button>
        )}
      </div>

      {/* Info Card */}
      {user?.role === 'treasurer' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <DollarSign className="size-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">
                  Auto-Generate Invoices
                </p>
                <p className="text-sm text-blue-800 mt-1">
                  Click "Generate Monthly Invoices" to automatically create
                  invoices for all active leases. Invoices are generated for the
                  current month with a due date of the 5th.
                </p>
                <p className="text-sm text-blue-700 mt-2">
                  Active leases: <strong>{activeLeases.length}</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
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
                  <div className={`${stat.color.split(' ')[0]} p-2 rounded-lg`}>
                    <Icon className={`size-4 ${stat.color.split(' ')[1]}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Invoices Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="all" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="all">
                  All Invoices ({invoices.length})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending ({pendingInvoices.length})
                </TabsTrigger>
                <TabsTrigger value="overdue">
                  Overdue ({overdueInvoices.length})
                </TabsTrigger>
                <TabsTrigger value="partially_paid">
                  Partially Paid (
                  {invoices.filter((i) => i.status === 'partially_paid').length}
                  )
                </TabsTrigger>
                <TabsTrigger value="paid">
                  Paid ({paidInvoices.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="all" className="m-0">
              <InvoiceTable invoicesList={invoices} />
            </TabsContent>
            <TabsContent value="pending" className="m-0">
              <InvoiceTable invoicesList={pendingInvoices} />
            </TabsContent>
            <TabsContent value="overdue" className="m-0">
              <InvoiceTable invoicesList={overdueInvoices} />
            </TabsContent>
            <TabsContent value="partially_paid" className="m-0">
              <InvoiceTable
                invoicesList={invoices.filter(
                  (i) => i.status === 'partially_paid'
                )}
              />
            </TabsContent>
            <TabsContent value="paid" className="m-0">
              <InvoiceTable invoicesList={paidInvoices} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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

function Clock({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
