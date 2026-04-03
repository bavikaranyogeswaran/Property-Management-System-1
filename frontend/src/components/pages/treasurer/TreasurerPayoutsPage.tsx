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
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TreasurerPayoutsPage: React.FC = () => {
  const { user } = useAuth();
  const { owners } = useUser();
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter/Selection State
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Preview State
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
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
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to preview payout');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedOwnerId || !endDate) return;
    if (!confirm('Proceed with recording this payout in the system?')) return;

    try {
      setActionLoading('creating');
      await payoutApi.create({ ownerId: selectedOwnerId, startDate, endDate });
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
    const bankReference = prompt('Please enter the Bank Transfer Reference Number:');
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
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Payout Management</h2>
          <p className="text-muted-foreground mt-1 text-sm">Generate disbursements and track bank transfers for property owners.</p>
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
              <CardDescription>Select an owner to calculate pending rent and expenses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Select Owner</Label>
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
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
             <Card className="bg-blue-50/50 border-blue-200 animate-in fade-in slide-in-from-top-2 duration-300">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-blue-600">Calculated Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-3 rounded border shadow-sm">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold">Gross Rent</span>
                            <p className="text-lg font-bold text-gray-900">{formatLKR(previewData.totalGross)}</p>
                        </div>
                        <div className="bg-white p-3 rounded border shadow-sm">
                            <span className="text-[10px] text-red-500 uppercase font-bold">Agency Fee</span>
                            <p className="text-lg font-bold text-red-600">-{formatLKR(previewData.totalCommission)}</p>
                        </div>
                        <div className="bg-white p-3 rounded border shadow-sm">
                            <span className="text-[10px] text-red-500 uppercase font-bold">Maintenance</span>
                            <p className="text-lg font-bold text-red-600">-{formatLKR(previewData.totalExpenses)}</p>
                        </div>
                        <div className="bg-blue-600 p-3 rounded border shadow-md text-white">
                            <span className="text-[10px] opacity-80 uppercase font-bold">Net Net Payout</span>
                            <p className="text-xl font-black">{formatLKR(previewData.netPayout)}</p>
                        </div>
                    </div>
                    <Button 
                        onClick={handleCreate} 
                        className="w-full bg-green-600 hover:bg-green-700 font-bold"
                        disabled={actionLoading === 'creating'}
                    >
                        {actionLoading === 'creating' ? 'Recording...' : 'Generate Payout Record'}
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
                            {selectedOwnerId ? `History for selected owner` : 'Recent payouts across all owners'}
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={fetchHistory} disabled={loading}>
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
                                     <tr><td colSpan={4} className="p-12 text-center text-muted-foreground animate-pulse">Loading ledgers...</td></tr>
                                ) : payouts.length === 0 ? (
                                    <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">No records found.</td></tr>
                                ) : (
                                    payouts.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 font-mono">#{p.id}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                    <User className="size-3" />
                                                    Owner ID: {p.ownerId}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className="font-semibold" variant={
                                                    p.status === 'acknowledged' ? 'default' : 
                                                    p.status === 'paid' ? 'secondary' : 
                                                    p.status === 'disputed' ? 'destructive' : 'outline'
                                                }>
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
