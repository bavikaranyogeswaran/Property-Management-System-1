import React, { useState } from 'react';
import { useApp, Receipt as ReceiptType } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileText, CreditCard, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ReceiptViewer } from '@/components/common/ReceiptViewer';
import apiClient from '@/services/api';

export function TenantInvoicesPage() {
  const { user } = useAuth();
  const {
    invoices,
    payments,
    receipts,
    units,
    properties,
    tenants,
    submitPayment,
  } = useApp();
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Bank Transfer',
    referenceNumber: '',
    paymentDate: new Date().toISOString().split('T')[0],
  });
  
  const [preparingPayHere, setPreparingPayHere] = useState(false);
  const [payHereData, setPayHereData] = useState<any>(null);

  // In a real app, filter by actual tenant ID
  const tenantInvoices = invoices;
  const pendingInvoices = tenantInvoices.filter((i) => i.status === 'pending');
  const paidInvoices = tenantInvoices.filter((i) => i.status === 'paid');
  // Fix: Compare dates strictly (YYYY-MM-DD string comparison works if format is ISO)
  // Fix: Compare dates strictly (YYYY-MM-DD string comparison works if format is ISO)
  // Use local date to avoid UTC shifts marking today's invoices as overdue
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const overdueInvoices = pendingInvoices.filter((i) => i.dueDate < todayStr);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const invoice = invoices.find((i) => i.id === selectedInvoice);
    if (!invoice) return;

    // Simulate file upload by creating a local URL
    if (!selectedFile) {
      toast.error('Please upload payment proof to proceed.');
      return;
    }

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('invoiceId', selectedInvoice);
    formData.append('amount', paymentData.amount);
    formData.append('paymentDate', paymentData.paymentDate);
    formData.append('paymentMethod', paymentData.paymentMethod);
    formData.append('referenceNumber', paymentData.referenceNumber);
    formData.append('proof', selectedFile); // Backend expects 'proof'

    // Fix: Await the submission. AppContext handles toasts.
    await submitPayment(formData as any);

    // Close dialog regardless of success/fail or strictly on success?
    // AppContext helper doesn't throw if it handles error, so we might close unconditionally
    // OR we should check if we should close. AppContext submitPayment currently swallows error but logs it.
    // Ideally submitPayment should return success boolean.
    // For now, let's assume success or we can move the close logic.
    // To match current behavior of "optimistic close" but avoiding double toast:
    setIsPaymentDialogOpen(false);
    setIsPaymentDialogOpen(false);
    setSelectedInvoice(null);
    setSelectedFile(null);
    setPaymentData({
      amount: '',
      paymentMethod: 'Bank Transfer',
      referenceNumber: '',
      paymentDate: new Date().toISOString().split('T')[0],
    });
  };

  const getInvoiceBalance = (invoiceId: string, totalAmount: number) => {
    const verifiedPayments = payments
      .filter((p) => p.invoiceId === invoiceId && p.status === 'verified')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, totalAmount - verifiedPayments);
  };

  const getInvoicePayment = (invoiceId: string) => {
    return payments.find((p) => p.invoiceId === invoiceId);
  };

  const getInvoiceReceipt = (invoiceId: string) => {
    return receipts.find((r) => r.invoiceId === invoiceId);
  };

  const stats = [
    {
      label: 'Pending Invoices',
      value: pendingInvoices.length,
      subtitle: `LKR ${pendingInvoices.reduce((sum, i) => sum + getInvoiceBalance(i.id, i.amount), 0).toLocaleString()}`,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Overdue',
      value: overdueInvoices.length,
      subtitle: `LKR ${overdueInvoices.reduce((sum, i) => sum + getInvoiceBalance(i.id, i.amount), 0).toLocaleString()}`,
      color: 'bg-red-50 text-red-700',
    },
    {
      label: 'Paid',
      value: paidInvoices.length,
      subtitle: `LKR ${paidInvoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}`,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Total Spent',
      value: `LKR ${paidInvoices.reduce((sum, i) => sum + i.amount, 0).toLocaleString()}`,
      subtitle: 'All time',
      color: 'bg-blue-50 text-blue-700',
    },
  ];

  const openPaymentDialog = (invoiceId: string) => {
    const invoice = invoices.find((i) => i.id === invoiceId);
    if (invoice) {
      const balance = getInvoiceBalance(invoiceId, invoice.amount);
      setSelectedInvoice(invoiceId);
      setPaymentData({
        ...paymentData,
        amount: balance.toString(),
      });
      setSelectedFile(null);
      setIsPaymentDialogOpen(true);
    }
  };

  const handlePayOnline = async () => {
    if (!selectedInvoice) return;
    
    try {
      setPreparingPayHere(true);
      const response = await apiClient.post('/payhere/checkout', { invoiceId: selectedInvoice });
      const checkoutData = response.data.data;
      
      setPayHereData(checkoutData);
      
      // Auto-submit PayHere form after a short delay
      setTimeout(() => {
        const form = document.getElementById('payhere-checkout-tenant-form') as HTMLFormElement;
        if (form) form.submit();
      }, 100);

    } catch (err: any) {
      toast.error('Failed to initialize online payment. Please use bank transfer or try again.');
      console.error('PayHere Tenant Init Error:', err);
    } finally {
      setPreparingPayHere(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">My Invoices</h2>
        <p className="text-sm text-gray-500 mt-1">
          View and pay your rent invoices
        </p>
      </div>

      {/* Alert for overdue invoices */}
      {overdueInvoices.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">
                  You have {overdueInvoices.length} overdue invoice
                  {overdueInvoices.length > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-red-700">
                  Total overdue amount: LKR{' '}
                  {overdueInvoices
                    .reduce(
                      (sum, i) => sum + getInvoiceBalance(i.id, i.amount),
                      0
                    )
                    .toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantInvoices.map((invoice) => {
                  const unit = units.find((u) => u.id === invoice.unitId);
                  const property = unit
                    ? properties.find((p) => p.id === unit.propertyId)
                    : null;
                  // Fix: Compare dates only
                  // Use local date to avoid UTC shifts marking today's invoices as overdue
                  const d = new Date();
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const todayStr = `${year}-${month}-${day}`;

                  const isOverdue =
                    (invoice.status === 'pending' ||
                      invoice.status === 'partially_paid') &&
                    invoice.dueDate < todayStr;
                  const isLateFee = invoice.description?.includes('Late Fee');
                  const payment = getInvoicePayment(invoice.id);
                  const receipt = getInvoiceReceipt(invoice.id);
                  const balance = getInvoiceBalance(invoice.id, invoice.amount);
                  const isPartial = balance < invoice.amount && balance > 0;

                  return (
                    <TableRow
                      key={invoice.id}
                      className={isLateFee ? 'bg-red-50' : ''}
                    >
                      <TableCell>{invoice.generatedDate}</TableCell>
                      <TableCell className="font-medium">
                        {invoice.description || 'Rent Invoice'}
                        {isLateFee && (
                          <Badge
                            variant="destructive"
                            className="ml-2 bg-red-100 text-red-700 border-red-200"
                          >
                            Late Fee
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{property?.name || 'N/A'}</TableCell>
                      <TableCell>{unit?.unitNumber || 'N/A'}</TableCell>
                      <TableCell className="font-semibold">
                        <div className="flex flex-col">
                          <span>LKR {balance.toLocaleString()}</span>
                          {isPartial && (
                            <span className="text-[10px] text-gray-500">
                              of {invoice.amount.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className={
                            isOverdue ? 'text-red-600 font-medium' : ''
                          }
                        >
                          {invoice.dueDate}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {invoice.status === 'partially_paid' ? (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
                              Partially Paid
                            </Badge>
                          ) : (
                            <Badge
                              variant={
                                invoice.status === 'paid'
                                  ? 'default'
                                  : isOverdue
                                    ? 'destructive'
                                    : 'secondary'
                              }
                            >
                              {isOverdue && invoice.status !== 'paid'
                                ? 'Overdue'
                                : invoice.status}
                            </Badge>
                          )}
                          {payment && payment.status === 'pending' && (
                            <Badge variant="outline" className="ml-2">
                              Payment Pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {invoice.status !== 'paid' && !payment && (
                            <Button
                              size="sm"
                              onClick={() => openPaymentDialog(invoice.id)}
                            >
                              <CreditCard className="size-4 mr-2" />
                              Pay Now
                            </Button>
                          )}
                          {invoice.status === 'paid' &&
                            receipt &&
                            (() => {
                              const receiptPayment = payments.find(
                                (p) => p.id === receipt.paymentId
                              );
                              const tenant = tenants.find(
                                (t) => t.id === invoice.tenantId
                              );
                              const unit = units.find(
                                (u) => u.id === invoice.unitId
                              );
                              const property = unit
                                ? properties.find(
                                    (p) => p.id === unit.propertyId
                                  )
                                : null;

                              if (
                                !receiptPayment ||
                                !tenant ||
                                !unit ||
                                !property
                              )
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
                                      paymentMethod:
                                        receiptPayment.paymentMethod,
                                      paymentDate: receiptPayment.paymentDate,
                                      description: invoice.description || 'Rent Invoice',
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {tenantInvoices.length === 0 && (
              <div className="py-12 text-center">
                <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No invoices yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitPayment} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (LKR)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) =>
                  setPaymentData({ ...paymentData, amount: e.target.value })
                }
                required
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentData.paymentDate}
                onChange={(e) =>
                  setPaymentData({
                    ...paymentData,
                    paymentDate: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={paymentData.paymentMethod}
                onValueChange={(value) =>
                  setPaymentData({ ...paymentData, paymentMethod: value })
                }
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Mobile Payment">Mobile Payment</SelectItem>
                  <SelectItem value="Online Payment">Online Payment (PayHere)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentData.paymentMethod === 'Online Payment' ? (
               <div className="p-6 bg-blue-50 rounded-xl border border-blue-100 flex flex-col items-center text-center space-y-4 animate-in zoom-in duration-300">
                  <img src="https://www.payhere.lk/downloads/images/payhere_short_banner.png" alt="PayHere" className="h-8" />
                  <div>
                    <h4 className="font-bold text-blue-900">Secure Instant Payment</h4>
                    <p className="text-xs text-blue-700">Pay using Visa, Mastercard, or Mobile Wallets. Your invoice will be marked as paid <strong>immediately</strong>.</p>
                  </div>
               </div>
            ) : (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-2">
                  <Label htmlFor="referenceNumber">Reference Number</Label>
                  <Input
                    id="referenceNumber"
                    placeholder="e.g., Transaction ID or Check number"
                    value={paymentData.referenceNumber}
                    onChange={(e) =>
                      setPaymentData({
                        ...paymentData,
                        referenceNumber: e.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proof">Payment Proof (Required)</Label>
                  <Input
                    id="proof"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Upload a screenshot or photo of your payment receipt
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> Your payment will be submitted for
                verification by the treasurer. You'll receive a receipt once
                approved.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPaymentDialogOpen(false);
                  setSelectedInvoice(null);
                  setSelectedFile(null);
                  setPaymentData({
                    amount: '',
                    paymentMethod: 'Bank Transfer',
                    referenceNumber: '',
                    paymentDate: new Date().toISOString().split('T')[0],
                  });
                }}
              >
                Cancel
              </Button>
              {paymentData.paymentMethod === 'Online Payment' ? (
                <Button 
                  type="button" 
                  onClick={handlePayOnline}
                  disabled={preparingPayHere}
                  className="bg-blue-600 hover:bg-blue-700 font-bold"
                >
                  {preparingPayHere ? 'Redirecting...' : 'Pay Online Now'}
                </Button>
              ) : (
                <Button type="submit">Submit Payment</Button>
              )}
            </div>
          </form>

          {/* PayHere Hidden Form for Tenant Portal */}
          {payHereData && (
            <form 
              id="payhere-checkout-tenant-form" 
              method="post" 
              action="https://sandbox.payhere.lk/pay/checkout"
              className="hidden"
            >
              <input type="hidden" name="merchant_id" value={payHereData.merchant_id} />
              <input type="hidden" name="return_url" value={payHereData.return_url} />
              <input type="hidden" name="cancel_url" value={payHereData.cancel_url} />
              <input type="hidden" name="notify_url" value={payHereData.notify_url} />
              <input type="hidden" name="order_id" value={payHereData.order_id} />
              <input type="hidden" name="items" value={payHereData.items} />
              <input type="hidden" name="currency" value={payHereData.currency} />
              <input type="hidden" name="amount" value={payHereData.amount} />
              <input type="hidden" name="first_name" value={payHereData.first_name} />
              <input type="hidden" name="last_name" value={payHereData.last_name} />
              <input type="hidden" name="email" value={payHereData.email} />
              <input type="hidden" name="phone" value={payHereData.phone || ''} />
              <input type="hidden" name="address" value={payHereData.address} />
              <input type="hidden" name="city" value={payHereData.city} />
              <input type="hidden" name="country" value={payHereData.country} />
              <input type="hidden" name="hash" value={payHereData.hash} />
            </form>
          )}
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
