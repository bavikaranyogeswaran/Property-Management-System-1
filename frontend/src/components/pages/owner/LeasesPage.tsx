import React, { useState, useEffect } from 'react';
import { useApp, Lease } from '@/app/context/AppContext';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Eye,
  Calendar,
  DollarSign,
  Home,
  User,
  XCircle,
  CheckCircle,
  RotateCcw,
  AlertCircle,
  TrendingUp,
  AlertTriangle,
  PlayCircle,
  Unlock,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatLKR } from '@/utils/formatters';

import apiClient from '@/services/api';

// ============================================================================
//  LEASES PAGE (The Contract Filing Cabinet)
// ============================================================================
//  This page manages all the Rental Agreements.
//  It tracks who is staying where, when their contract ends, and if they have paid their deposit.
// ============================================================================

export function LeasesPage() {
  const {
    tenants,
    leases,
    units,
    properties,
    endLease,
    renewLease,
    refundDeposit,
    approveRefund,
    disputeRefund,
    updateLeaseDocument,
    finalizeCheckout,
    activateLease,
    verifyLeaseDocuments,
    rejectLeaseDocuments,
    cancelLease,
    markUnitAvailable,
    renewalRequests,
    proposeRenewalTerms,
    approveRenewal: approveLeaseRenewal,
    rejectRenewal,
  } = useApp();
  const { user } = useAuth();
  // --- State Hooks ---
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [endLeaseId, setEndLeaseId] = useState<string | null>(null);
  const [renewLeaseId, setRenewLeaseId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [renewRent, setRenewRent] = useState('');
  const [refundLeaseId, setRefundLeaseId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundType, setRefundType] = useState<'request' | 'approve' | 'dispute'>('request');
  const [adjustmentsLeaseId, setAdjustmentsLeaseId] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [adjDate, setAdjDate] = useState('');
  const [adjRent, setAdjRent] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
  const [finalizeLeaseId, setFinalizeLeaseId] = useState<string | null>(null);
  const [activateLeaseId, setActivateLeaseId] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<any>(null);
  const [isLoadingDeposit, setIsLoadingDeposit] = useState(false);
  const [markAvailableUnitId, setMarkAvailableUnitId] = useState<string | null>(null);
  const [selectedRenewal, setSelectedRenewal] = useState<any | null>(null);
  const [isRenewalDialogOpen, setIsRenewalDialogOpen] = useState(false);
  const [newRenewalRent, setNewRenewalRent] = useState('');
  const [newRenewalEndDate, setNewRenewalEndDate] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [cancelReservationId, setCancelReservationId] = useState<string | null>(null);
  const [rejectionLeaseId, setRejectionLeaseId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // --- Helper Functions ---
  const handleDocumentUpdate = async (leaseId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || !e.target.files[0]) return;
      const loadingToastId = toast.loading("Uploading document...");
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      const uploadRes = await apiClient.post('/upload/private', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await updateLeaseDocument(leaseId, uploadRes.data.url);
      setSelectedLease((prev) => prev ? { ...prev, documentUrl: uploadRes.data.url } : null);
      toast.dismiss(loadingToastId);
    } catch(err) {
      toast.dismiss();
      toast.error('Failed to upload document');
    }
  };

  const handleEndLease = (leaseId: string) => setEndLeaseId(leaseId);
  
  const confirmEndLease = async () => {
    if (endLeaseId) {
      try {
        await endLease(endLeaseId);
        setSelectedLease(null);
        setEndLeaseId(null);
      } catch (e) {}
    }
  };

  const confirmActivateLease = async () => {
    if (activateLeaseId) {
      try {
        await activateLease(activateLeaseId);
        setActivateLeaseId(null);
      } catch (e) {}
    }
  };

  const fetchAdjustments = async (leaseId: string) => {
    try {
      setIsLoadingAdjustments(true);
      const res = await apiClient.get(`/leases/${leaseId}/adjustments`);
      setAdjustments(res.data);
    } catch (err) {
      toast.error('Failed to fetch rent adjustments');
    } finally {
      setIsLoadingAdjustments(false);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentsLeaseId) return;
    try {
      await apiClient.post(`/leases/${adjustmentsLeaseId}/adjustments`, {
        effectiveDate: adjDate,
        newMonthlyRent: parseFloat(adjRent),
        notes: adjNotes,
      });
      toast.success('Rent adjustment scheduled');
      fetchAdjustments(adjustmentsLeaseId);
      setAdjDate('');
      setAdjRent('');
      setAdjNotes('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add adjustment');
    }
  };

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewLeaseId) return;
    try {
      await renewLease(renewLeaseId, renewDate, renewRent ? parseFloat(renewRent) : undefined);
      setRenewLeaseId(null);
      setRenewDate('');
      setRenewRent('');
    } catch (e) {}
  };

  const handleOpenRenewalNegotiation = (request: any) => {
    setSelectedRenewal(request);
    setNewRenewalRent(request.proposedMonthlyRent?.toString() || request.currentMonthlyRent.toString());
    setNewRenewalEndDate(request.proposedEndDate || '');
    setRenewalNotes(request.negotiationNotes || '');
    setIsRenewalDialogOpen(true);
  };

  const handleSubmitRenewalProposal = async () => {
    if (!selectedRenewal) return;
    // Get the current lease being renewed to find its end date
    const currentLease = leases.find(l => String(l.id) === String(selectedRenewal?.lease_id));
    const expectedStartDateStr = currentLease?.endDate 
      ? new Date(new Date(currentLease.endDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : today.toISOString().split('T')[0];

    if (newRenewalEndDate && new Date(newRenewalEndDate) <= new Date(expectedStartDateStr)) {
      toast.error(`The renewal end date must be after the renewal start date (${expectedStartDateStr})`);
      return;
    }

    try {
      await proposeRenewalTerms(selectedRenewal.id, {
        proposedMonthlyRent: parseFloat(newRenewalRent),
        proposedEndDate: newRenewalEndDate,
        notes: renewalNotes
      });
      setIsRenewalDialogOpen(false);
    } catch (e) {}
  };

  const handleApproveRenewal = async (id: string) => {
    try {
      await approveLeaseRenewal(id);
    } catch (e) {}
  };

  const handleRefundAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundLeaseId) return;
    try {
      if (refundType === 'request') {
        await refundDeposit(refundLeaseId, parseFloat(refundAmount), refundNotes);
      } else if (refundType === 'approve') {
        await approveRefund(refundLeaseId);
      } else if (refundType === 'dispute') {
        await disputeRefund(refundLeaseId, refundNotes);
      }
      setRefundLeaseId(null);
      setRefundAmount('');
      setRefundNotes('');
      setRefundType('request');
    } catch (e) {}
  };

  // --- Filtered Data & Stats ---
  const activeLeases = leases.filter((l) => l.status === 'active');
  const expiredLeases = leases.filter((l) => l.status === 'expired');
  const endedLeases = leases.filter((l) => l.status === 'ended' || l.status === 'cancelled');
  const draftLeases = leases.filter((l) => l.status === 'draft');

  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = activeLeases.filter((lease) => {
    if (!lease.endDate) return false;
    const endDate = new Date(lease.endDate);
    return endDate <= thirtyDaysFromNow && endDate >= today;
  });

  const stats = [
    { label: 'Total Leases', value: leases.length, icon: FileText, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Leases', value: activeLeases.length, icon: CheckCircle, color: 'bg-green-50 text-green-700' },
    { label: 'Expiring Soon', value: expiringSoon.length, icon: Calendar, color: 'bg-orange-50 text-orange-700' },
    { label: 'Expired (Move-Out)', value: expiredLeases.length, icon: AlertCircle, color: 'bg-amber-50 text-amber-700' },
    { label: 'Ended Leases', value: endedLeases.length, icon: XCircle, color: 'bg-gray-50 text-gray-700' },
  ];

  const confirmFinalizeCheckout = async () => {
    if (finalizeLeaseId) {
      try {
        await finalizeCheckout(finalizeLeaseId);
        setFinalizeLeaseId(null);
      } catch (e) {}
    }
  };

  const confirmMarkUnitAvailable = async () => {
    if (markAvailableUnitId) {
      try {
        await markUnitAvailable(markAvailableUnitId);
        toast.success('Unit is now available for new leads');
        setMarkAvailableUnitId(null);
      } catch (e: any) {
        toast.error(e.response?.data?.error || 'Failed to mark unit as available');
      }
    }
  };
  
  const confirmCancelReservation = async () => {
    if (cancelReservationId) {
      try {
        await cancelLease(cancelReservationId);
        setCancelReservationId(null);
      } catch (e) {}
    }
  };

  const confirmRejectDocuments = async () => {
    if (rejectionLeaseId && rejectionReason) {
      try {
        await rejectLeaseDocuments(rejectionLeaseId, rejectionReason);
        setRejectionLeaseId(null);
        setRejectionReason('');
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (activateLeaseId) {
      const fetchDepositStatus = async () => {
        try {
          setIsLoadingDeposit(true);
          const res = await apiClient.get(`/leases/${activateLeaseId}/deposit-status`);
          setDepositStatus(res.data);
        } catch (error) {
          console.error('Failed to fetch deposit status:', error);
        } finally {
          setIsLoadingDeposit(false);
        }
      };
      fetchDepositStatus();
    } else {
      setDepositStatus(null);
    }
  }, [activateLeaseId]);

  const LeaseRow = ({ lease }: { lease: Lease }) => {
    // ... (keep existing LeaseRow component logic)
    const tenant = tenants.find((t) => t.id === lease.tenantId);
    const unit = units.find((u) => u.id === lease.unitId);
    const property = unit
      ? properties.find((p) => p.id === unit.propertyId)
      : null;

    // Check if expiring soon
    let isExpiringSoon = false;
    if (lease.status === 'active' && lease.endDate) {
      const endDate = new Date(lease.endDate);
      isExpiringSoon = endDate <= thirtyDaysFromNow && endDate >= today;
    }

    return (
      <TableRow key={lease.id} className={isExpiringSoon ? 'bg-orange-50' : ''}>
        <TableCell>
          <div className="flex items-center gap-2">
            <User className="size-4 text-gray-400" />
            <span className="font-medium">{lease.tenantName || tenant?.name || 'Unknown'}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Home className="size-4 text-gray-400" />
            <div className="text-sm">
              <div className="font-medium">{property?.name || 'Unknown'}</div>
              <div className="text-gray-500">
                Unit {unit?.unitNumber || 'N/A'}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <Calendar className="size-3 text-gray-400" />
              {lease.startDate}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <Calendar className="size-3 text-gray-400" />
              {lease.endDate || <span className="text-blue-600 font-medium italic italic">Month-to-Month</span>}
            </div>
            {isExpiringSoon && (
              <Badge
                variant="outline"
                className="text-xs mt-1 border-orange-300 text-orange-700"
              >
                Expiring Soon
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 font-medium">
            {formatLKR(lease.monthlyRent)}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={
              lease.status === 'active' ? 'secondary' : 
              lease.status === 'expired' ? 'outline' : 
              'outline'
            }
            className={
              lease.status === 'active' ? 'bg-green-100 text-green-700' : 
              lease.status === 'expired' ? 'bg-amber-100 text-amber-700 border-amber-200' :
              lease.status === 'draft' ? 'bg-gray-100 text-gray-700 border-gray-200' :
              ''
            }
          >
            {lease.status === 'draft' ? (
              lease.depositStatus === 'paid' ? 'Awaiting Verification' : 'Awaiting Deposit'
            ) : lease.status}
          </Badge>
          {lease.status === 'draft' && lease.verificationStatus === 'verified' && (
            <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-700 border-blue-200">
               Docs OK
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedLease(lease)}
              title="View Details"
            >
              <Eye className="size-4" />
            </Button>
            {lease.status === 'draft' && (
              <>
                {lease.verificationStatus !== 'verified' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (window.confirm('Have you reviewed and verified all required documents for this tenant?')) {
                        await verifyLeaseDocuments(lease.id);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    title="Verify Documents"
                  >
                    <ShieldCheck className="size-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRejectionLeaseId(lease.id)}
                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  title="Reject Documents"
                >
                  <AlertTriangle className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActivateLeaseId(lease.id)}
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  title="Sign & Activate Lease"
                >
                  <PlayCircle className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCancelReservationId(lease.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Cancel Reservation"
                >
                  <XCircle className="size-4" />
                </Button>
              </>
            )}
            {lease.status === 'draft' && lease.magicToken && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const url = `${window.location.origin}/pay/${lease.magicToken}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Payment Link copied to clipboard');
                }}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Copy Guest Payment Link"
              >
                <Share2 className="size-4" />
              </Button>
            )}
            {lease.status === 'expired' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFinalizeLeaseId(lease.id)}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                title="Finalize Move-Out"
              >
                <CheckCircle className="size-4" />
              </Button>
            )}
            {/* Mark Available: shown on ended/expired leases where unit is still in maintenance */}
            {(lease.status === 'ended' || lease.status === 'expired') && unit?.status === 'maintenance' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unit && setMarkAvailableUnitId(unit.id)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Mark Unit as Available"
              >
                <Unlock className="size-4" />
              </Button>
            )}
            {lease.status === 'active' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenewLeaseId(lease.id);
                    setRenewDate(
                      lease.endDate 
                        ? new Date(lease.endDate).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]
                    ); 
                    setRenewRent(lease.monthlyRent.toString());
                  }}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title="Renew Lease"
                >
                  <Calendar className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEndLease(lease.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="End Lease"
                >
                  <XCircle className="size-4" />
                </Button>
                {user?.role === 'owner' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdjustmentsLeaseId(lease.id);
                    fetchAdjustments(lease.id);
                  }}
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  title="Manage Rent Adjustments"
                >
                  <TrendingUp className="size-4" />
                </Button>
              )}
              </>
            )}

            {/* Refund / Approval Actions - Only show for ended leases or those vacating */}
            {(lease.status === 'ended' || lease.noticeStatus === 'vacating') && lease.depositStatus !== 'refunded' && (
              <>
                {((user?.role === 'treasurer') || (user?.role === 'owner' && ['paid', 'partially_refunded'].includes(lease.depositStatus || ''))) &&
                  !['awaiting_approval', 'disputed'].includes(lease.depositStatus || '') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefundLeaseId(lease.id);
                        setRefundType('request');
                      }}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      title="Request Refund / Offset"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  )}

                {/* Refund Approval/Dispute now handled in dedicated Refunds page */}
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };


  return (
    <div className="space-y-6">
      {/* ... existing header ... */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Lease Management
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage rental agreements and lease contracts
          </p>
        </div>
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

      {/* Leases Table */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="active" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList className="grid w-full grid-cols-6 mb-6">
                <TabsTrigger value="active">
                  <FileText className="size-4 mr-2" />
                  Active ({activeLeases.length})
                </TabsTrigger>
                <TabsTrigger value="expiring">
                  <Calendar className="size-4 mr-2" />
                  Expiring ({expiringSoon.length})
                </TabsTrigger>
                <TabsTrigger value="expired">
                  <AlertCircle className="size-4 mr-2" />
                  Expired ({expiredLeases.length})
                </TabsTrigger>
                <TabsTrigger value="ended">
                  <XCircle className="size-4 mr-2" />
                  Ended ({endedLeases.length})
                </TabsTrigger>
                <TabsTrigger value="draft">
                  <FileText className="size-4 mr-2" />
                  Draft ({draftLeases.length})
                </TabsTrigger>
                <TabsTrigger value="renewals" className="relative">
                  <RotateCcw className="size-4 mr-2" />
                  Renewals ({renewalRequests.filter(r => r.status === 'pending' || r.status === 'negotiating').length})
                  {renewalRequests.some(r => r.status === 'pending') && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Active Leases Tab */}
            <TabsContent value="active" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {activeLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No active leases</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Create a lease to get started
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Expiring Soon Tab */}
            <TabsContent value="expiring" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringSoon.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {expiringSoon.length === 0 && (
                  <div className="py-12 text-center">
                    <Calendar className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No leases expiring soon</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Leases expiring within 30 days will appear here
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Expired Leases Tab */}
            <TabsContent value="expired" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiredLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {expiredLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <AlertCircle className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No expired leases requiring move-out</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Ended Leases Tab */}
            <TabsContent value="ended" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endedLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {endedLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No ended leases</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Draft Leases Tab */}
            <TabsContent value="draft" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {draftLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No draft leases</p>
                  </div>
                )}
              </div>
            </TabsContent>
            {/* Draft Leases Tab Content... (omitted for brevity) */}
            <TabsContent value="renewals" className="m-0">
                <div className="overflow-x-auto px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Current Rent</TableHead>
                      <TableHead>Proposed Terms</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renewalRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-gray-400" />
                            <span className="font-medium">{request.tenantName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{request.propertyName}</div>
                            <div className="text-gray-500">Unit {request.unitNumber}</div>
                          </div>
                        </TableCell>
                        <TableCell>LKR {request.currentMonthlyRent}</TableCell>
                        <TableCell>
                          {request.proposedMonthlyRent ? (
                            <div className="text-sm">
                              <div className="font-medium text-emerald-600">LKR {request.proposedMonthlyRent}</div>
                              <div className="text-gray-500">Until {request.proposedEndDate}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-sm">Not proposed yet</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={
                              request.status === 'pending' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                              request.status === 'negotiating' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              request.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                              'bg-gray-100 text-gray-700'
                            }
                          >
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {(request.status === 'pending' || request.status === 'negotiating') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenRenewalNegotiation(request)}
                                  className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  Propose/Edit
                                </Button>
                                {request.proposedMonthlyRent && (request.proposedEndDate || true) && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleApproveRenewal(request.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    Approve & Create Lease
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => rejectRenewal(request.id)}
                                  className="text-red-600 hover:bg-red-50"
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {renewalRequests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                          <RotateCcw className="size-12 mx-auto mb-4 opacity-20" />
                          No renewal requests found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Lease Details Dialog */}
      <Dialog
        open={!!selectedLease}
        onOpenChange={(open) => !open && setSelectedLease(null)}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <div className="flex flex-col max-h-[90vh]">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle>Lease Agreement Details</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 pt-2">
          {selectedLease &&
            (() => {
              const tenant = tenants.find(
                (t) => t.id === selectedLease.tenantId
              );
              const unit = units.find((u) => u.id === selectedLease.unitId);
              const property = unit
                ? properties.find((p) => p.id === unit.propertyId)
                : null;

              // Calculate lease duration
              const startDate = new Date(selectedLease.startDate);
              let durationMonths: number | null = null;
              
              if (selectedLease.endDate) {
                const endDate = new Date(selectedLease.endDate);
                durationMonths = Math.round(
                  (endDate.getTime() - startDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                );
              }

              return (
                <div className="space-y-6">
                  {/* Status & Deposit Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Lease Status */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-600">Lease Status</p>
                        <p className="text-lg font-semibold capitalize">
                          {selectedLease.status}
                        </p>
                      </div>
                      <Badge
                        variant={
                          selectedLease.status === 'active'
                            ? 'secondary'
                            : 'outline'
                        }
                        className={
                          selectedLease.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : ''
                        }
                      >
                        {selectedLease.status}
                      </Badge>
                    </div>

                    {/* Deposit Info */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm text-gray-600">Deposit Status</p>
                        <p className="text-lg font-semibold flex items-center gap-2 capitalize">
                          {selectedLease.depositStatus?.replace('_', ' ')}
                        </p>
                      </div>
                      {selectedLease.depositStatus === 'awaiting_approval' && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-100 px-2 py-1 rounded">Action Required</span>
                      )}
                    </div>
                  </div>

                  {(selectedLease.depositStatus === 'awaiting_approval' || selectedLease.depositStatus === 'disputed') && (
                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg flex justify-between items-center">
                       <p className="text-sm text-orange-800 font-medium">Proposed Refund Amount</p>
                       <p className="text-lg font-bold text-orange-600">LKR {selectedLease.proposedRefundAmount}</p>
                    </div>
                  )}

                  {(selectedLease.refundNotes) && (
                    <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-900">
                      <strong>Notes:</strong> {selectedLease.refundNotes}
                    </div>
                  )}

                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <User className="size-4" />
                        Tenant
                      </h4>
                      <p className="font-medium">{tenant?.name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {tenant?.email}
                      </p>
                      <p className="text-sm text-gray-600">{tenant?.phone}</p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Home className="size-4" />
                        Property
                      </h4>
                      <p className="font-medium">{property?.name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Unit {unit?.unitNumber}
                      </p>
                      <p className="text-sm text-gray-600">{unit?.type}</p>
                    </div>
                  </div>

                  {/* Lease Terms */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3">Lease Terms</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Start Date</p>
                        <p className="font-medium flex items-center gap-1">
                          <Calendar className="size-4 text-gray-400" />
                          {selectedLease.startDate}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">End Date</p>
                        <p className="font-medium flex items-center gap-1">
                          <Calendar className="size-4 text-gray-400" />
                          {selectedLease.endDate}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Lease Duration</p>
                        <p className={`font-medium ${durationMonths !== null && durationMonths < 0 ? 'text-red-600' : ''}`}>
                          {durationMonths !== null 
                            ? (durationMonths < 0 ? `Invalid (${durationMonths} months)` : `${durationMonths} months`) 
                            : 'Periodic (Indefinite)'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Monthly Rent</p>
                        <p className="font-medium flex items-center gap-1">
                          {formatLKR(selectedLease.monthlyRent)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Document View */}
                  <div className="border rounded-lg p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className={`size-4 ${selectedLease.documentUrl ? 'text-blue-600' : 'text-gray-400'}`} />
                        {selectedLease.documentUrl ? 'Lease Document Attached' : 'No Lease Document Attached'}
                      </div>
                      
                      {selectedLease.documentUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedLease.id) {
                              const baseUrl = apiClient.defaults.baseURL || '/api';
                              window.open(`${baseUrl}/documents/view/${selectedLease.id}?type=lease`, '_blank');
                            }
                          }}
                        >
                          View Document
                        </Button>
                      )}
                    </div>

                    {selectedLease.status === 'active' && (
                      <div className="pt-2 border-t">
                        <label className="flex items-center justify-center w-full px-4 py-2 bg-white text-blue-500 hover:text-blue-600 border border-blue-200 hover:border-blue-300 rounded-md shadow-sm text-sm font-medium cursor-pointer transition-colors">
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            className="hidden"
                            onChange={(e) => handleDocumentUpdate(selectedLease.id, e)}
                          />
                          {selectedLease.documentUrl ? 'Update Document' : 'Upload Document'}
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {selectedLease.status === 'active' && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button
                        variant="destructive"
                        onClick={() => handleEndLease(selectedLease.id)}
                      >
                        <XCircle className="size-4 mr-2" />
                        End Lease
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renew Lease Dialog */}
      <Dialog
        open={!!renewLeaseId}
        onOpenChange={(open) => !open && setRenewLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Lease (Instant)</DialogTitle>
            <p className="text-sm text-gray-500 mt-2">
              This will automatically approve a renewal and generate a <strong>New Draft Lease</strong> for the selected dates.
              The tenant will be notified via email to review the new draft.
            </p>
          </DialogHeader>
          <form onSubmit={handleRenew} className="space-y-4">
            <div className="space-y-2">
              <Label>New End Date</Label>
              <Input
                type="date"
                value={renewDate}
                onChange={(e) => setRenewDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>New Monthly Rent (LKR) (Optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={renewRent}
                onChange={(e) => setRenewRent(e.target.value)}
                placeholder="Leave empty to keep current rent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenewLeaseId(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Renew Lease</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* End Lease Confirmation Dialog */}
      <Dialog
        open={!!endLeaseId}
        onOpenChange={(open) => !open && setEndLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Lease</DialogTitle>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to end this lease? This action will mark the
              lease as ended and free up the unit.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndLeaseId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmEndLease}
            >
              End Lease
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Deposit / Action Dialog */}
      <Dialog
        open={!!refundLeaseId}
        onOpenChange={(open) => !open && setRefundLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {refundType === 'request' && 'Request Security Deposit Refund'}
              {refundType === 'approve' && 'Approve Refund Request'}
              {refundType === 'dispute' && 'Dispute Refund Request'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRefundAction} className="space-y-4">
            {refundType === 'request' && (
              <>
                <div className="space-y-2">
                  <Label>Refund Amount (LKR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the amount to be returned to the tenant. (Max:{' '}
                    {leases.find((l) => l.id === refundLeaseId)?.securityDeposit || 0}
                    )
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Notes / Reason for Deduction (Shared with Tenant)</Label>
                  <Input
                    type="text"
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder="E.g., LKR 5,000 withheld for professional cleaning"
                  />
                </div>
              </>
            )}

            {refundType === 'approve' && (
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg text-sm">
                <p>Are you sure you want to approve this refund? This action will generate the necessary ledger entries and cannot be easily undone.</p>
              </div>
            )}

            {refundType === 'dispute' && (
              <div className="space-y-2">
                <Label>Dispute Reason / Notes</Label>
                <Input
                  type="text"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  required
                  placeholder="Reason for disputing"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundLeaseId(null)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant={refundType === 'dispute' ? 'destructive' : 'default'}
              >
                {refundType === 'request' && 'Submit Request'}
                {refundType === 'approve' && 'Approve & Finalize'}
                {refundType === 'dispute' && 'Mark as Disputed'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rent Adjustment Dialog */}
      <Dialog
        open={!!adjustmentsLeaseId}
        onOpenChange={(open) => !open && setAdjustmentsLeaseId(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Rent Adjustments (Lease Addendums)</DialogTitle>
            <p className="text-sm text-gray-500 mt-1">
              Schedule mid-lease rent hikes or adjustments without renewing the contract.
            </p>
          </DialogHeader>

          <div className={`grid grid-cols-1 ${user?.role === 'owner' ? 'md:grid-cols-2' : ''} gap-6 mt-4`}>
            {/* Current Adjustments List */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Calendar className="size-4" />
                Scheduled Adjustments
              </h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="py-2">Effective</TableHead>
                      <TableHead className="py-2">New Rent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingAdjustments ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-4">Loading...</TableCell>
                      </TableRow>
                    ) : adjustments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-4 text-gray-500 text-sm">
                          No adjustments scheduled.
                        </TableCell>
                      </TableRow>
                    ) : (
                      adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell className="py-2 text-sm font-medium">{adj.effectiveDate}</TableCell>
                          <TableCell className="py-2 text-sm">LKR {adj.newMonthlyRent}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Add New Adjustment Form - Only for Owners */}
            {user?.role === 'owner' && (
              <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100">
                <h4 className="font-semibold text-sm text-emerald-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="size-4" />
                  Schedule New Hike
                </h4>
                <form onSubmit={handleAddAdjustment} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-emerald-900">Effective Date</Label>
                    <Input
                      type="date"
                      value={adjDate}
                      onChange={(e) => setAdjDate(e.target.value)}
                      required
                      className="bg-white"
                    />
                    <p className="text-[10px] text-emerald-700">The first day the new rent applies.</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-emerald-900">New Monthly Rent (LKR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1"
                      value={adjRent}
                      onChange={(e) => setAdjRent(e.target.value)}
                      required
                      className="bg-white"
                      placeholder="e.g. 55000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-emerald-900">Notes (Addendum Reason)</Label>
                    <Input
                      value={adjNotes}
                      onChange={(e) => setAdjNotes(e.target.value)}
                      className="bg-white"
                      placeholder="e.g. Annual 10% increase"
                    />
                  </div>
                  <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700">
                    Schedule Adjustment
                  </Button>
                </form>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Finalize Checkout Confirmation Dialog */}
      <Dialog
        open={!!finalizeLeaseId}
        onOpenChange={(open) => !open && setFinalizeLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Move-Out</DialogTitle>
            <div className="text-sm text-gray-500 mt-2 space-y-2">
              <p>Are you sure you want to finalize the move-out for this lease?</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>The lease status will be changed to <strong>Ended</strong>.</li>
                <li>The unit status will be changed from Maintenance to <strong>Available</strong> for new tenants.</li>
                <li>An actual checkout timestamp will be recorded.</li>
              </ul>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFinalizeLeaseId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={confirmFinalizeCheckout}
            >
              Confirm & Release Unit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Activate & Sign Lease Confirmation Dialog */}
      <Dialog
        open={!!activateLeaseId}
        onOpenChange={(open) => !open && setActivateLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign & Activate Lease</DialogTitle>
            <div className="text-sm text-gray-500 mt-2 space-y-2">
              <p>Are you sure you want to sign and activate this draft lease?</p>
              
              <div className="p-3 bg-gray-50 border rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <span>Document Verification</span>
                  {leases.find(l => String(l.id) === String(activateLeaseId))?.verificationStatus === 'verified' ? (
                    <Badge className="bg-blue-100 text-blue-700 border-none">Verified OK</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 border-none">Pending Review</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <span>Security Deposit Verification</span>
                  {isLoadingDeposit ? (
                    <span className="animate-pulse">Checking Ledger...</span>
                  ) : depositStatus?.isFullyPaid ? (
                    <Badge className="bg-green-100 text-green-700 border-none">Verified</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700 border-none">Pending Payment</Badge>
                  )}
                </div>

                {isLoadingDeposit ? (
                  <div className="h-8 bg-gray-100 animate-pulse rounded"></div>
                ) : depositStatus ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Requirement:</span>
                      <span className="font-medium">{formatLKR(depositStatus.targetAmount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Paid Amount (Ledger):</span>
                      <span className={`font-bold ${depositStatus.isFullyPaid ? 'text-green-600' : 'text-red-600'}`}>
                        {formatLKR(depositStatus.paidAmount || 0)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 italic">No deposit record found in ledger.</p>
                )}
              </div>

              {!isLoadingDeposit && depositStatus && !depositStatus.isFullyPaid && (
                <div className="p-2 bg-red-50 border border-red-100 rounded text-[10px] text-red-700 flex gap-2">
                  <AlertCircle className="size-3 mt-0.5" />
                  <p><strong>Warning:</strong> The security deposit has not been fully verified in the ledger. Automatic onboarding will trigger once the Treasurer verifies the payment.</p>
                </div>
              )}

              {activateLeaseId && leases.find(l => String(l.id) === String(activateLeaseId))?.verificationStatus !== 'verified' && (
                <div className="p-2 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-700 flex gap-2">
                  <AlertTriangle className="size-3 mt-0.5" />
                  <p><strong>Required:</strong> You must manually verify the tenant's documents (ID, Proof of Income, etc.) before this lease can be activated. Use the <ShieldCheck className="inline size-3" /> icon in the Drafts tab.</p>
                </div>
              )}

              <ul className="list-disc pl-5 space-y-1">
                <li>The lease status will change to <strong>Active</strong>.</li>
                <li>The unit will be reserved or marked as <strong>Occupied</strong> if the lease has started.</li>
                <li>Any pending lead conversions or visits for this unit will be automatically cancelled.</li>
              </ul>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActivateLeaseId(null)}
            >
              Cancel
            </Button>
            <Button
                type="button"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={confirmActivateLease}
                disabled={
                  isLoadingDeposit || 
                  (depositStatus && !depositStatus.isFullyPaid) || 
                  leases.find(l => String(l.id) === String(activateLeaseId))?.verificationStatus !== 'verified'
                }
              >
              <PlayCircle className="size-4 mr-2" />
              Sign & Activate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Renewal Negotiation Dialog */}
      <Dialog open={isRenewalDialogOpen} onOpenChange={setIsRenewalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Negotiate Lease Renewal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 rounded text-sm text-blue-800 border border-blue-100">
              Negotiating renewal for <strong>{selectedRenewal?.tenant_name}</strong> at {selectedRenewal?.property_name}.
              {(() => {
                const currentLease = leases.find(l => String(l.id) === String(selectedRenewal?.lease_id));
                if (!currentLease?.endDate) return null;
                const nextStartDate = new Date(new Date(currentLease.endDate).getTime() + 24 * 60 * 60 * 1000);
                const nextStartDateStr = nextStartDate.toISOString().split('T')[0];
                const isFarFuture = nextStartDate > new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000 * 2); // 2 years
                
                return (
                  <div className="mt-2 text-xs">
                    <span className="font-semibold">Expected Renewal Start:</span> {nextStartDateStr}
                    {isFarFuture && (
                      <div className="text-amber-600 mt-1 font-medium flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        Warning: This start date is far in the future! Check the original lease dates.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>New Monthly Rent (LKR)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                  <Input 
                    className="pl-9"
                    type="number" 
                    value={newRenewalRent} 
                    onChange={(e) => setNewRenewalRent(e.target.value)} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Proposed End Date</Label>
                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                        <Input 
                            className="pl-9"
                            type="date" 
                            disabled={!newRenewalEndDate && newRenewalEndDate !== ''} // fallback safety
                            value={newRenewalEndDate} 
                            onChange={(e) => setNewRenewalEndDate(e.target.value)} 
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            id="m2m-renewal"
                            checked={!newRenewalEndDate}
                            onChange={(e) => setNewRenewalEndDate(e.target.checked ? '' : (selectedRenewal?.proposed_end_date || ''))}
                        />
                        <Label htmlFor="m2m-renewal" className="text-xs text-gray-600">Month-to-Month (No End Date)</Label>
                    </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Negotiation Notes</Label>
              <textarea
                className="w-full min-h-[100px] p-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Message for the tenant or internal notes..."
                value={renewalNotes}
                onChange={(e) => setRenewalNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsRenewalDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitRenewalProposal}>
                Submit Proposal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Unit Available Confirmation Dialog */}
      <Dialog open={!!markAvailableUnitId} onOpenChange={(open) => !open && setMarkAvailableUnitId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Unlock className="size-5" />
              Mark Unit as Available
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-gray-600">
              This will set the unit status to <span className="font-semibold text-emerald-700">Available</span>, allowing new leads to submit interest for this unit.
            </p>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-md p-3 border">
              Only do this once maintenance or turnover work is complete and the unit is ready for a new tenant.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setMarkAvailableUnitId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={confirmMarkUnitAvailable}
              >
                <Unlock className="size-4 mr-2" />
                Mark as Available
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Reservation Confirmation Dialog */}
      <Dialog
        open={!!cancelReservationId}
        onOpenChange={(open) => !open && setCancelReservationId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-5" />
              Cancel Lease Reservation
            </DialogTitle>
            <div className="text-sm text-gray-500 mt-3 space-y-3">
              <p>
                Are you sure you want to <strong className="text-red-600">CANCEL</strong> this lease reservation?
              </p>
              <div className="bg-red-50 border border-red-100 p-3 rounded-md text-red-800 text-xs">
                <p className="font-semibold mb-1">Impact:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>The guest payment link will be immediately deactivated.</li>
                  <li>Any pending payments for this reservation will be voided.</li>
                  <li>The unit will be returned to <strong>Available</strong> status for other leads.</li>
                </ul>
              </div>
              <p className="text-xs italic">This action is permanent and cannot be undone.</p>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelReservationId(null)}
            >
              Keep Reservation
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancelReservation}
            >
              Cancel Reservation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Rejection Dialog */}
      <Dialog open={!!rejectionLeaseId} onOpenChange={(open) => !open && setRejectionLeaseId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Tenant Documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Input
                placeholder="e.g. NIC photo is blurry, please re-upload"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                This reason will be shown to the tenant on their portal.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setRejectionLeaseId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={confirmRejectDocuments}
                disabled={!rejectionReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
