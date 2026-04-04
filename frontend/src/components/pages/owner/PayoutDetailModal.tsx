import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, XCircle, ArrowRight, Wallet, Receipt, Construction } from 'lucide-react';
import { payoutApi } from '@/services/api';
import { formatLKR } from '@/utils/formatters';
import { toast } from 'sonner';

interface PayoutDetailModalProps {
  payoutId: string | null;
  onClose: () => void;
}

export function PayoutDetailModal({ payoutId, onClose }: PayoutDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (payoutId) {
      fetchDetails();
    }
  }, [payoutId]);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const res = await payoutApi.getDetails(payoutId!);
      setData(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payout details');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!payoutId) return;
    try {
      const res = await payoutApi.exportCSV(payoutId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payout_reconciliation_${payoutId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV Exported Successfully');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  if (!payoutId) return null;

  return (
    <Dialog open={!!payoutId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-[90vw] lg:max-w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Receipt className="size-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Payout Reconciliation</DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5 font-mono">ID: #{payoutId}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 self-start sm:self-center shadow-sm">
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="py-24 text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-muted-foreground animate-pulse font-medium">Analyzing transaction ledger...</p>
            </div>
          ) : data ? (
            <div className="space-y-8">
              {/* Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-6 bg-gray-50 border rounded-2xl border-gray-200">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gross Rent</span>
                  <p className="text-xl md:text-2xl font-bold text-gray-900 break-all">{formatLKR(data.summary.totalGross)}</p>
                </div>
                <div className="sm:border-l sm:pl-6 space-y-1 text-center sm:text-left border-gray-200">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Agency Fee</span>
                  <p className="text-xl md:text-2xl font-bold text-red-500 break-all">-{formatLKR(data.summary.totalCommission)}</p>
                </div>
                <div className="lg:border-l lg:pl-6 space-y-1 text-center sm:text-left border-gray-200">
                  <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Maintenance</span>
                  <p className="text-xl md:text-2xl font-bold text-red-600 break-all">-{formatLKR(data.summary.totalExpenses)}</p>
                </div>
                <div className="lg:border-l lg:pl-6 space-y-1 border-gray-200 bg-white sm:bg-transparent rounded-xl p-4 sm:p-0 shadow-sm sm:shadow-none border border-blue-100 sm:border-0 grow text-center sm:text-left">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Final Net Payout</span>
                  <p className="text-2xl md:text-3xl font-black text-gray-900 break-all">{formatLKR(data.summary.netPayout)}</p>
                </div>
              </div>

              {/* Disbursement Info (If Paid/Ack) */}
              {(data.summary.status !== 'pending') && (
                <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <Wallet className="size-4 text-blue-600" />
                        <h3 className="font-bold text-gray-900 text-lg">Disbursement Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase">Bank Reference</span>
                            <p className="font-mono text-sm font-semibold">{data.summary.bankReference || 'N/A'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
                            <div className="mt-1">
                                <Badge variant={data.summary.status === 'acknowledged' ? 'default' : data.summary.status === 'disputed' ? 'destructive' : 'secondary'}>
                                    {data.summary.status.toUpperCase()}
                                </Badge>
                            </div>
                        </div>
                        {data.summary.acknowledgedAt && (
                             <div>
                                <span className="text-xs font-bold text-gray-400 uppercase">Acknowledged On</span>
                                <p className="text-sm font-medium">{new Date(data.summary.acknowledgedAt).toLocaleString()}</p>
                             </div>
                        )}
                        {data.summary.disputeReason && (
                             <div className="col-span-full bg-red-50 p-3 rounded border border-red-100">
                                <span className="text-xs font-bold text-red-600 uppercase">Dispute Reason</span>
                                <p className="text-sm text-red-800 mt-1">{data.summary.disputeReason}</p>
                             </div>
                        )}
                    </div>
                </div>
              )}

              {/* Income Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Wallet className="size-4 text-green-600" />
                  <h3 className="font-bold text-gray-900 text-lg">Income Breakdown</h3>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50">
                        <TableHead className="min-w-[180px]">Property / Unit</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="min-w-[200px]">Period / Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.income.map((item: any) => (
                        <TableRow key={item.payment_id}>
                          <TableCell>
                            <div className="font-semibold text-gray-900">{item.property_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">Unit: {item.unit_number}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.invoice_type === 'late_fee' ? 'destructive' : 'secondary'} className="capitalize whitespace-nowrap">
                              {item.invoice_type === 'late_fee' ? 'Late Fee' : 'Rent'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{item.invoice_description || `${item.month}/${item.year}`}</div>
                            <div className="text-[10px] text-muted-foreground">Paid: {new Date(item.payment_date).toLocaleDateString()}</div>
                          </TableCell>
                          <TableCell className="font-bold text-green-600 text-right whitespace-nowrap font-mono">{formatLKR(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {data.income.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">No income records found.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Construction className="size-4 text-red-600" />
                  <h3 className="font-bold text-gray-900 text-lg">Maintenance Deductions</h3>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/50">
                        <TableHead className="min-w-[180px]">Property / Unit</TableHead>
                        <TableHead className="min-w-[200px]">Title</TableHead>
                        <TableHead>Recorded Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.expenses.map((item: any) => (
                        <TableRow key={item.cost_id}>
                          <TableCell>
                            <div className="font-semibold text-gray-900">{item.property_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">Unit: {item.unit_number}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-semibold">{item.request_title}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px] h-4 py-0 px-1 font-mono uppercase">
                                    {item.bill_to || 'owner'}
                                </Badge>
                                <div className="text-[10px] text-muted-foreground italic line-clamp-1 max-w-[250px]">{item.description}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap font-medium text-gray-500">
                            {new Date(item.recorded_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-bold text-red-600 text-right whitespace-nowrap font-mono">-{formatLKR(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                      {data.expenses.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-12 text-muted-foreground italic">No expense deductions for this period.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-sm text-blue-700 shadow-inner">
                 <div className="shrink-0 p-1.5 bg-blue-100 rounded-lg text-blue-600 border border-blue-200">
                   <FileText className="size-4" />
                 </div>
                 <p className="leading-relaxed">
                   These records capture all <b>verified</b> rent payments and <b>active</b> maintenance costs as of the payout generation date. For certified tax purposes, please use the CSV export.
                 </p>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
