import React, { useState, useEffect } from 'react';
import { useAuth } from '../../app/context/AuthContext';
import { payoutApi } from '../../services/api';
import { OwnerPayout } from '../../types/models';
import { formatLKR } from '../../utils/formatters';
import { PayoutDetailModal } from './owner/PayoutDetailModal';
import { FileText, Download, Eye, Table as TableIcon } from 'lucide-react';
import { toast } from 'sonner';

const OwnerPayoutsPage: React.FC = () => {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [loading, setLoading] = useState(false);

  // Generation State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [previewData, setPreviewData] = useState<{
    totalIncome: number;
    totalExpenses: number;
    netPayout: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await payoutApi.getHistory();
      setPayouts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!endDate) {
      setError('Please select an end date.');
      return;
    }
    setError('');
    setPreviewLoading(true);
    try {
      const res = await payoutApi.preview(startDate, endDate);
      setPreviewData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to preview payout');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!endDate) return;
    if (
      !confirm(
        'Are you sure you want to record this payout? This action is permanent.'
      )
    )
      return;

    try {
      await payoutApi.create({ startDate, endDate });
      setSuccess('Payout recorded successfully!');
      setPreviewData(null);
      setStartDate('');
      setEndDate('');
      fetchHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create payout');
    }
  };

  const handleExport = async (payoutId: string) => {
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

  if (user?.role !== 'owner') {
    return (
      <div className="p-8 text-red-500">
        Access Denied. Only Owners can view this page.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Owner Payouts</h2>
          <p className="text-sm text-gray-500 mt-1">Manage and reconcile your payouts</p>
        </div>
      </div>

      {/* Payout Generator Card */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold mb-2">Generate New Payout</h2>
        <p className="text-sm text-gray-600 mb-4">
          This will capture all verified payments and maintenance expenses that have not yet been paid out, up to the selected end date (<b>Cash-Basis Accounting</b>).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Optional"
            />
            <p className="text-[10px] text-gray-500 mt-1">Leave empty to include all previous unpaid items.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <div className="h-4"></div> {/* Alignment spacer to match Start Date subtext */}
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Action
            </label>
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {previewLoading ? 'Calculating...' : 'Preview Payout'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded">
            {success}
          </div>
        )}

        {previewData && (
          <div className="mt-6 p-4 border rounded bg-gray-50">
            <h3 className="font-semibold mb-3">Payout Preview</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <span className="block text-sm text-gray-600">
                  Total Rent Collected
                </span>
                <span className="text-lg text-green-600 font-bold">
                  {formatLKR(previewData.totalIncome)}
                </span>
              </div>
              <div>
                <span className="block text-sm text-gray-600">
                  Total Expenses
                </span>
                <span className="text-lg text-red-600 font-bold">
                  {formatLKR(previewData.totalExpenses)}
                </span>
              </div>
              <div>
                <span className="block text-sm text-gray-600">Net Payout</span>
                <span className="text-xl font-bold">
                  {formatLKR(previewData.netPayout)}
                </span>
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
            >
              Confirm & Record Payout
            </button>
          </div>
        )}
      </div>

      {/* History Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Payout History</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Loading history...
          </div>
        ) : payouts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No payouts recorded yet.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount (LKR)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Generated Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    #{p.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(p.periodStart).toLocaleDateString()} -{' '}
                    {new Date(p.periodEnd).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    {formatLKR(p.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        p.status === 'processed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(p.generatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                       <button
                        onClick={() => setSelectedPayoutId(p.id)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="View Breakdown"
                      >
                        <Eye className="size-4" />
                      </button>
                      <button
                        onClick={() => handleExport(p.id)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                        title="Export CSV"
                      >
                        <Download className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PayoutDetailModal 
        payoutId={selectedPayoutId} 
        onClose={() => setSelectedPayoutId(null)} 
      />
    </div>
  );
};

export default OwnerPayoutsPage;
