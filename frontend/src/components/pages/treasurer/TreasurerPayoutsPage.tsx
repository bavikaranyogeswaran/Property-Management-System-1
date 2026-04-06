import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useUser } from '@/app/context/UserContext';
import { payoutApi } from '@/services/api';
import { OwnerPayout } from '@/types/models';
import { formatLKR } from '@/utils/formatters';
import { PayoutDetailModal } from '../owner/PayoutDetailModal';
import {
  FileText,
  Download,
  Eye,
  Plus,
  CheckCircle2,
  Search,
  Wallet,
  Calendar,
  User,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const TreasurerPayoutsPage: React.FC = () => {
  const { user } = useAuth();
  const { owners } = useUser();
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter/Selection State
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Preview State
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Selection State (Partial Payouts)
  const [selectedIncomeIds, setSelectedIncomeIds] = useState<string[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);

  // Action state
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [selectedOwnerId]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await payoutApi.getHistory(selectedOwnerId || undefined);
      setPayouts(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load payout history');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedOwnerId) {
      toast.error('Please select an owner first');
      return;
    }
    if (!endDate) {
      toast.error('Please select an end date');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await payoutApi.preview(selectedOwnerId, startDate, endDate);
      setPreviewData(res.data);
      // Initialize with all IDs selected
      setSelectedIncomeIds(res.data.incomeIds || []);
      setSelectedExpenseIds(res.data.expenseIds || []);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to preview payout');
    } finally {
      setPreviewLoading(false);
    }
  };

  const calculateLiveTotals = () => {
    if (!previewData) return { gross: 0, commission: 0, expenses: 0, net: 0 };

    const income =
      previewData.details?.income?.filter((i: any) =>
        selectedIncomeIds.includes(i.paymentId)
      ) || [];
    const expenses =
      previewData.details?.expenses?.filter((e: any) =>
        selectedExpenseIds.includes(e.costId)
      ) || [];

    const gross = income.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0
    );
    const commission = income.reduce((sum: number, r: any) => {
      if (['rent', 'late_fee'].includes(r.invoiceType)) {
        const fee = Number(r.fee || 0);
        return sum + Math.round(Number(r.amount) * (fee / 100));
      }
      return sum;
    }, 0);
    const totalExp = expenses.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0
    );

    return {
      gross,
      commission,
      expenses: totalExp,
      net: gross - commission - totalExp,
    };
  };

  const liveTotals = calculateLiveTotals();

  const handleCreate = async () => {
    if (!selectedOwnerId || !endDate) return;

    if (selectedIncomeIds.length === 0 && selectedExpenseIds.length === 0) {
      toast.error(
        'You must select at least one transaction to create a payout'
      );
      return;
    }

    if (!confirm('Proceed with recording this payout in the system?')) return;

    try {
      setActionLoading('creating');
      await payoutApi.create({
        ownerId: selectedOwnerId,
        startDate,
        endDate,
        selection: {
          incomeIds: selectedIncomeIds,
          expenseIds: selectedExpenseIds,
        },
      });
      toast.success('Payout record created successfully!');
      setPreviewData(null);
      fetchHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create payout');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkAsPaid = async (payoutId: string) => {
    const bankReference = prompt(
      'Please enter the Bank Transfer Reference Number:'
    );
    if (!bankReference) return;

    try {
      setActionLoading(payoutId);
      await payoutApi.markAsPaid(payoutId, { bankReference });
      toast.success('Payout marked as PAID');
      fetchHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExport = async (payoutId: string) => {
    try {
      const res = await payoutApi.exportCSV(payoutId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `payout_export_${payoutId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  if (user?.role !== 'treasurer' && user?.role !== 'owner') {
    return <div className="p-8 text-red-500 font-bold">Access Denied.</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
            Payout Management
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate disbursements and track bank transfers for property owners.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Generator */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="shadow-lg border-blue-100 overflow-hidden">
            <div className="h-1 bg-blue-600 w-full" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="size-5 text-blue-600" />
                New Disbursement
              </CardTitle>
              <CardDescription>
                Select an owner to calculate pending rent and expenses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Owner</Label>
                <Select
                  value={selectedOwnerId}
                  onValueChange={setSelectedOwnerId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose an owner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id.toString()}>
                        {owner.name} ({owner.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date (Opt)</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handlePreview}
                className="w-full mt-4"
                disabled={previewLoading || !selectedOwnerId}
              >
                {previewLoading ? 'Calculating...' : 'Preview Calculation'}
              </Button>
            </CardContent>
          </Card>

          {previewData && (
            <Card className="bg-blue-50/50 border-blue-200 animate-in fade-in slide-in-from-top-2 duration-300 xl:sticky xl:top-8">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-600">
                    Calculated Payout
                  </CardTitle>
                  {(selectedIncomeIds.length <
                    (previewData.incomeIds?.length || 0) ||
                    selectedExpenseIds.length <
                      (previewData.expenseIds?.length || 0)) && (
                    <Badge
                      variant="outline"
                      className="bg-orange-50 text-orange-700 border-orange-200 text-[10px]"
                    >
                      Partial
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-[10px]">
                  Select/Deselect transactions to exclude disputed items.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Financial Summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-2 rounded border shadow-sm">
                    <span className="text-[9px] text-muted-foreground uppercase font-bold block">
                      Gross Rent
                    </span>
                    <p className="text-sm font-bold text-gray-900">
                      {formatLKR(liveTotals.gross)}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border shadow-sm">
                    <span className="text-[9px] text-red-500 uppercase font-bold block">
                      Agency Fee
                    </span>
                    <p className="text-sm font-bold text-red-600">
                      -{formatLKR(liveTotals.commission)}
                    </p>
                  </div>
                  <div className="bg-white p-2 rounded border shadow-sm">
                    <span className="text-[9px] text-red-500 uppercase font-bold block">
                      Maintenance
                    </span>
                    <p className="text-sm font-bold text-red-600">
                      -{formatLKR(liveTotals.expenses)}
                    </p>
                  </div>
                  <div className="bg-blue-600 p-2 rounded border shadow-md text-white">
                    <span className="text-[9px] opacity-80 uppercase font-bold block">
                      Net Payout
                    </span>
                    <p className="text-base font-black">
                      {formatLKR(liveTotals.net)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Transaction Selection List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between">
                    Eligible Transactions
                    <span className="text-blue-600 lowercase bg-blue-100 px-1.5 rounded-full">
                      {selectedIncomeIds.length + selectedExpenseIds.length}{' '}
                      items
                    </span>
                  </h4>

                  <ScrollArea className="h-[300px] pr-4">
                    <div className="space-y-4">
                      {/* Income Section */}
                      {previewData.details?.income?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded inline-block">
                            Revenue
                          </p>
                          {previewData.details.income.map((item: any) => (
                            <div
                              key={item.paymentId}
                              className="flex items-start gap-2 p-2 rounded hover:bg-white/80 border border-transparent hover:border-gray-100 transition-all"
                            >
                              <Checkbox
                                checked={selectedIncomeIds.includes(
                                  item.paymentId
                                )}
                                onCheckedChange={(checked) => {
                                  if (checked)
                                    setSelectedIncomeIds([
                                      ...selectedIncomeIds,
                                      item.paymentId,
                                    ]);
                                  else
                                    setSelectedIncomeIds(
                                      selectedIncomeIds.filter(
                                        (id) => id !== item.paymentId
                                      )
                                    );
                                }}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <p className="text-[11px] font-bold text-gray-900 truncate">
                                    Unit {item.unit_number}
                                  </p>
                                  <p className="text-[11px] font-black text-gray-900">
                                    {formatLKR(item.amount)}
                                  </p>
                                </div>
                                <p className="text-[9px] text-gray-500 truncate leading-tight">
                                  {item.invoice_description ||
                                    `${item.invoiceType} for ${item.month}/${item.year}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Expenses Section */}
                      {previewData.details?.expenses?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded inline-block">
                            Expenses
                          </p>
                          {previewData.details.expenses.map((item: any) => (
                            <div
                              key={item.costId}
                              className="flex items-start gap-2 p-2 rounded hover:bg-white/80 border border-transparent hover:border-gray-100 transition-all"
                            >
                              <Checkbox
                                checked={selectedExpenseIds.includes(
                                  item.costId
                                )}
                                onCheckedChange={(checked) => {
                                  if (checked)
                                    setSelectedExpenseIds([
                                      ...selectedExpenseIds,
                                      item.costId,
                                    ]);
                                  else
                                    setSelectedExpenseIds(
                                      selectedExpenseIds.filter(
                                        (id) => id !== item.costId
                                      )
                                    );
                                }}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <p className="text-[11px] font-bold text-gray-900 truncate">
                                    Unit {item.unit_number}
                                  </p>
                                  <p className="text-[11px] font-black text-red-600">
                                    -{formatLKR(item.amount)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] h-3.5 border-red-100 text-red-400 font-normal px-1"
                                  >
                                    Maintenance
                                  </Badge>
                                  <p className="text-[9px] text-gray-500 truncate leading-tight">
                                    {item.description || item.request_title}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {liveTotals.net < 0 && (
                  <Alert
                    variant="destructive"
                    className="py-2 px-3 border-red-200 bg-red-50/50"
                  >
                    <AlertCircle className="size-3.5 text-red-600" />
                    <AlertDescription className="text-[10px] text-red-800 leading-tight">
                      Warning: Expenses exceed Revenue. Creating this payout
                      will record a negative balance for the owner.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleCreate}
                  className="w-full bg-green-600 hover:bg-green-700 font-bold shadow-sm"
                  disabled={actionLoading === 'creating'}
                >
                  {actionLoading === 'creating'
                    ? 'Recording...'
                    : 'Generate Payout Record'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: History */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-2">
              <div>
                <CardTitle>Disbursement History</CardTitle>
                <CardDescription>
                  {selectedOwnerId
                    ? `History for selected owner`
                    : 'Recent payouts across all owners'}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchHistory}
                disabled={loading}
              >
                <Search className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="px-6 py-4">ID / Owner</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Net Amount</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-12 text-center text-muted-foreground animate-pulse"
                        >
                          Loading ledgers...
                        </td>
                      </tr>
                    ) : payouts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-12 text-center text-muted-foreground"
                        >
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      payouts.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900 font-mono">
                              #{p.id}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="size-3" />
                              Owner ID: {p.ownerId}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              className="font-semibold"
                              variant={
                                p.status === 'acknowledged'
                                  ? 'default'
                                  : p.status === 'paid'
                                    ? 'secondary'
                                    : p.status === 'disputed'
                                      ? 'destructive'
                                      : 'outline'
                              }
                            >
                              {p.status.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right font-black text-gray-900">
                            {formatLKR(p.amount)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {p.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-2 h-8"
                                  onClick={() => handleMarkAsPaid(p.id)}
                                  disabled={!!actionLoading}
                                >
                                  <CheckCircle2 className="size-3" />
                                  Mark Paid
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                onClick={() => setSelectedPayoutId(p.id)}
                              >
                                <Eye className="size-4 text-gray-400" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                onClick={() => handleExport(p.id)}
                              >
                                <Download className="size-4 text-gray-400" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PayoutDetailModal
        payoutId={selectedPayoutId}
        onClose={() => setSelectedPayoutId(null)}
      />
    </div>
  );
};

export default TreasurerPayoutsPage;
