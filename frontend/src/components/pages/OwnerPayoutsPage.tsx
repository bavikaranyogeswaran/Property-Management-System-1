import React, { useState, useEffect } from 'react';
import { useAuth } from '../../app/context/AuthContext';
import { payoutApi } from '../../services/api';
import { OwnerPayout } from '../../types/models';

const OwnerPayoutsPage: React.FC = () => {
    const { user } = useAuth();
    const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
    const [loading, setLoading] = useState(false);

    // Generation State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [previewData, setPreviewData] = useState<{ totalIncome: number; totalExpenses: number; netPayout: number } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

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
        if (!startDate || !endDate) {
            setError('Please select both start and end dates.');
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
        if (!startDate || !endDate) return;
        if (!confirm('Are you sure you want to record this payout? This action is permanent.')) return;

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

    if (user?.role !== 'owner') {
        return <div className="p-8 text-red-500">Access Denied. Only Owners can view this page.</div>;
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-6">Owner Payouts</h1>

            {/* Payout Generator Card */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-xl font-semibold mb-4">Generate New Payout</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input
                            type="date"
                            className="w-full border p-2 rounded"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input
                            type="date"
                            className="w-full border p-2 rounded"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <button
                            onClick={handlePreview}
                            disabled={previewLoading}
                            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                            {previewLoading ? 'Calculating...' : 'Preview Payout'}
                        </button>
                    </div>
                </div>

                {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}
                {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded">{success}</div>}

                {previewData && (
                    <div className="mt-6 p-4 border rounded bg-gray-50">
                        <h3 className="font-semibold mb-3">Payout Preview</h3>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <span className="block text-sm text-gray-600">Total Rent Collected</span>
                                <span className="text-lg text-green-600 font-bold">LKR {previewData.totalIncome.toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="block text-sm text-gray-600">Total Expenses</span>
                                <span className="text-lg text-red-600 font-bold">LKR {previewData.totalExpenses.toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="block text-sm text-gray-600">Net Payout</span>
                                <span className="text-xl font-bold">LKR {previewData.netPayout.toFixed(2)}</span>
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
                    <div className="p-8 text-center text-gray-500">Loading history...</div>
                ) : payouts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No payouts recorded yet.</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (LKR)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Generated Date</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {payouts.map((p) => (
                                <tr key={p.payout_id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">#{p.payout_id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(p.period_start).toLocaleDateString()} - {new Date(p.period_end).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                        {Number(p.amount).toLocaleString('en-LK', { style: 'currency', currency: 'LKR' })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(p.generated_at).toLocaleDateString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default OwnerPayoutsPage;
