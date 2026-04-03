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

  // Action States
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  const handleAcknowledge = async (payoutId: string) => {
    if (!confirm('Are you sure you want to acknowledge receipt of this payout?')) return;
    try {
      setActionLoading(payoutId);
      await payoutApi.acknowledge(payoutId);
      toast.success('Payout acknowledged');
      fetchHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to acknowledge');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDispute = async (payoutId: string) => {
    const reason = prompt('Please enter the reason for this dispute:');
    if (!reason) return;
    try {
      setActionLoading(payoutId);
      await payoutApi.dispute(payoutId, reason);
      toast.success('Dispute recorded');
      fetchHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record dispute');
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

      {/* Info Card */}
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded shadow-sm">
        <div className="flex">
          <div className="flex-shrink-0">
             <FileText className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Payouts are generated and processed by the Treasurer. Once a payout is marked as <strong>Paid</strong>, please verify the transfer in your bank and click <strong>Acknowledge</strong> to confirm receipt.
            </p>
          </div>
        </div>
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
                  Amount (Net)
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
                        p.status === 'acknowledged'
                          ? 'bg-green-100 text-green-800'
                          : p.status === 'paid'
                          ? 'bg-blue-100 text-blue-800'
                          : p.status === 'disputed'
                          ? 'bg-red-100 text-red-800'
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
                    <div className="flex justify-end gap-2 items-center">
                      {p.status === 'paid' && (
                        <>
                          <button
                            onClick={() => handleAcknowledge(p.id)}
                            disabled={!!actionLoading}
                            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-xs shadow-sm"
                          >
                            {actionLoading === p.id ? '...' : 'Acknowledge'}
                          </button>
                          <button
                            onClick={() => handleDispute(p.id)}
                            disabled={!!actionLoading}
                            className="bg-red-100 text-red-600 px-3 py-1 rounded hover:bg-red-200 text-xs"
                          >
                            Dispute
                          </button>
                        </>
                      )}
                       <button
                        onClick={() => setSelectedPayoutId(p.id)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="View Reconciliation"
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
