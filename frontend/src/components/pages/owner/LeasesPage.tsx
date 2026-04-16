import React, { useState, useEffect } from 'react';
import { useApp, Lease } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Calendar,
  XCircle,
  RotateCcw,
  AlertCircle,
  ShieldCheck,
  User,
  Home,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatLKR, formatToLocalDate } from '@/utils/formatters';

import apiClient from '@/services/api';
import { LeaseStats } from './lease-components/LeaseStats';
import { LeaseTable } from './lease-components/LeaseTable';
import { RefundDialog } from './lease-components/RefundDialog';
import { TerminationDialog } from './lease-components/TerminationDialog';
import { AdjustmentDialog } from './lease-components/AdjustmentDialog';
import { RenewalDialog } from './lease-components/RenewalDialog';
import { VerificationDialog } from './lease-components/VerificationDialog';

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

  // --- Standardized Action State ---
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [endLeaseId, setEndLeaseId] = useState<string | null>(null);
  const [renewLeaseId, setRenewLeaseId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [renewRent, setRenewRent] = useState('');
  const [refundLeaseId, setRefundLeaseId] = useState<string | null>(null);
  const [refundType, setRefundType] = useState<
    'request' | 'approve' | 'dispute'
  >('request');
  const [adjustmentsLeaseId, setAdjustmentsLeaseId] = useState<string | null>(
    null
  );
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
  const [finalizeLeaseId, setFinalizeLeaseId] = useState<string | null>(null);
  const [activateLeaseId, setActivateLeaseId] = useState<string | null>(null);
  const [depositStatus, setDepositStatus] = useState<any>(null);
  const [isLoadingDeposit, setIsLoadingDeposit] = useState(false);
  const [markAvailableUnitId, setMarkAvailableUnitId] = useState<string | null>(
    null
  );
  const [selectedRenewal, setSelectedRenewal] = useState<any | null>(null);
  const [cancelReservationId, setCancelReservationId] = useState<string | null>(
    null
  );
  const [rejectionLeaseId, setRejectionLeaseId] = useState<string | null>(null);
  const [confirmVerifyLeaseId, setConfirmVerifyLeaseId] = useState<
    string | null
  >(null);

  // --- Helper Functions ---
  const handleDocumentUpdate = async (
    leaseId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    try {
      if (!e.target.files || !e.target.files[0]) return;
      const loadingToastId = toast.loading('Uploading document...');
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      const uploadRes = await apiClient.post('/upload/private', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await updateLeaseDocument(leaseId, uploadRes.data.url);
      setSelectedLease((prev) =>
        prev ? { ...prev, documentUrl: uploadRes.data.url } : null
      );
      toast.dismiss(loadingToastId);
    } catch (err) {
      toast.dismiss();
      toast.error('Failed to upload document');
    }
  };

  const handleEndLease = (leaseId: string) => setEndLeaseId(leaseId);

  const confirmEndLease = async (id: string, date: string, fee: number) => {
    try {
      await endLease(id, date, fee);
      setSelectedLease(null);
      setEndLeaseId(null);
    } catch (e) {}
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

  const handleAddAdjustment = async (
    date: string,
    rent: number,
    notes: string
  ) => {
    if (!adjustmentsLeaseId) return;
    try {
      await apiClient.post(`/leases/${adjustmentsLeaseId}/adjustments`, {
        effectiveDate: date,
        newMonthlyRent: rent,
        notes: notes,
      });
      toast.success('Rent adjustment scheduled');
      fetchAdjustments(adjustmentsLeaseId);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add adjustment');
    }
  };

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewLeaseId) return;
    try {
      await renewLease(
        renewLeaseId,
        renewDate,
        renewRent ? parseFloat(renewRent) : undefined
      );
      setRenewLeaseId(null);
      setRenewDate('');
      setRenewRent('');
    } catch (e) {}
  };

  const handleSubmitRenewalProposal = async (
    id: string,
    rent: number,
    date: string,
    notes: string
  ) => {
    try {
      await proposeRenewalTerms(id, {
        proposedMonthlyRent: rent,
        proposedEndDate: date,
        notes: notes,
      });
      setSelectedRenewal(null);
    } catch (e) {}
  };

  const handleRefundAction = async (
    id: string,
    amount: number,
    notes: string,
    type: 'request' | 'approve' | 'dispute'
  ) => {
    try {
      if (type === 'request') {
        await refundDeposit(id, amount, notes);
      } else if (type === 'approve') {
        await approveRefund(id);
      } else if (type === 'dispute') {
        await disputeRefund(id, notes);
      }
      setRefundLeaseId(null);
    } catch (e) {}
  };

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
        toast.error(
          e.response?.data?.error || 'Failed to mark unit as available'
        );
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

  const confirmRejectDocuments = async (leaseId: string, reason: string) => {
    try {
      await rejectLeaseDocuments(leaseId, reason);
      setRejectionLeaseId(null);
    } catch (e) {}
  };

  const confirmVerifyDocuments = async () => {
    if (confirmVerifyLeaseId) {
      try {
        await verifyLeaseDocuments(confirmVerifyLeaseId);
        setConfirmVerifyLeaseId(null);
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (activateLeaseId) {
      const fetchDepositStatus = async () => {
        try {
          setIsLoadingDeposit(true);
          const res = await apiClient.get(
            `/leases/${activateLeaseId}/deposit-status`
          );
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

  // --- Filtered Data ---
  const activeLeases = leases.filter((l) => l.status === 'active');
  const expiredLeases = leases.filter((l) => l.status === 'expired');
  const endedLeases = leases.filter(
    (l) => l.status === 'ended' || l.status === 'cancelled'
  );
  const draftLeases = leases.filter((l) => l.status === 'draft');

  const today = new Date();
  const thirtyDaysFromNow = new Date(
    today.getTime() + 30 * 24 * 60 * 60 * 1000
  );
  const expiringSoon = activeLeases.filter((lease) => {
    if (!lease.endDate) return false;
    const endDate = new Date(lease.endDate);
    return endDate <= thirtyDaysFromNow && endDate >= today;
  });

  const tableProps = {
    user,
    tenants,
    units,
    properties,
    thirtyDaysFromNow,
    today,
    setSelectedLease,
    setConfirmVerifyLeaseId,
    setRejectionLeaseId,
    setActivateLeaseId,
    setCancelReservationId,
    setFinalizeLeaseId,
    setMarkAvailableUnitId,
    setRenewLeaseId,
    setRenewDate,
    setRenewRent,
    handleEndLease,
    setAdjustmentsLeaseId,
    fetchAdjustments,
    setRefundLeaseId,
    setRefundType,
  };

  return (
    <div className="space-y-6">
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

      <LeaseStats leases={leases} />

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
                  Renewals (
                  {
                    renewalRequests.filter(
                      (r) =>
                        r.status === 'pending' || r.status === 'negotiating'
                    ).length
                  }
                  )
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="active" className="m-0">
              <LeaseTable
                leases={activeLeases}
                emptyIcon={FileText}
                emptyMessage="No active leases"
                {...tableProps}
              />
            </TabsContent>

            <TabsContent value="expiring" className="m-0">
              <LeaseTable
                leases={expiringSoon}
                emptyIcon={Calendar}
                emptyMessage="No leases expiring soon"
                {...tableProps}
              />
            </TabsContent>

            <TabsContent value="expired" className="m-0">
              <LeaseTable
                leases={expiredLeases}
                emptyIcon={AlertCircle}
                emptyMessage="No expired leases"
                {...tableProps}
              />
            </TabsContent>

            <TabsContent value="ended" className="m-0">
              <LeaseTable
                leases={endedLeases}
                emptyIcon={FileText}
                emptyMessage="No ended leases"
                {...tableProps}
              />
            </TabsContent>

            <TabsContent value="draft" className="m-0">
              <LeaseTable
                leases={draftLeases}
                emptyIcon={FileText}
                emptyMessage="No draft leases"
                {...tableProps}
              />
            </TabsContent>

            <TabsContent value="renewals" className="m-0">
              <div className="overflow-x-auto px-6 pb-6 pt-2">
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
                            <span className="font-medium">
                              {request.tenantName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">
                              {request.propertyName}
                            </div>
                            <div className="text-gray-500">
                              Unit {request.unitNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatLKR(request.currentMonthlyRent)}
                        </TableCell>
                        <TableCell>
                          {request.proposedMonthlyRent ? (
                            <div className="text-sm">
                              <div className="font-medium text-emerald-600">
                                {formatLKR(request.proposedMonthlyRent)}
                              </div>
                              <div className="text-gray-500">
                                Until {request.proposedEndDate}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic text-sm">
                              Not proposed yet
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              request.status === 'pending'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-blue-100 text-blue-700'
                            }
                          >
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            {(request.status === 'pending' ||
                              request.status === 'negotiating') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedRenewal(request)}
                                >
                                  Negotiate
                                </Button>
                                {request.proposedMonthlyRent && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      approveLeaseRenewal(request.id)
                                    }
                                    className="bg-emerald-600"
                                  >
                                    Approve
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => rejectRenewal(request.id)}
                                  className="text-red-600"
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* --- Specialized Dialogs --- */}
      <RefundDialog
        leaseId={refundLeaseId}
        type={refundType}
        onClose={() => setRefundLeaseId(null)}
        onSubmit={handleRefundAction}
        leases={leases}
      />
      <TerminationDialog
        leaseId={endLeaseId}
        onClose={() => setEndLeaseId(null)}
        onSubmit={confirmEndLease}
        leases={leases}
      />
      <AdjustmentDialog
        leaseId={adjustmentsLeaseId}
        adjustments={adjustments}
        isLoading={isLoadingAdjustments}
        onClose={() => setAdjustmentsLeaseId(null)}
        onSubmit={handleAddAdjustment}
      />
      <RenewalDialog
        request={selectedRenewal}
        leases={leases}
        onClose={() => setSelectedRenewal(null)}
        onSubmit={handleSubmitRenewalProposal}
      />
      <VerificationDialog
        leaseId={rejectionLeaseId}
        onClose={() => setRejectionLeaseId(null)}
        onSubmit={confirmRejectDocuments}
      />

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedLease}
        onOpenChange={(open) => !open && setSelectedLease(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lease Details</DialogTitle>
          </DialogHeader>
          {selectedLease && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded border">
                  <Label className="text-xs text-gray-500">Tenant</Label>
                  <p className="font-medium">
                    {selectedLease.tenantName || 'Unknown'}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded border">
                  <Label className="text-xs text-gray-500">Status</Label>
                  <p className="font-medium capitalize">
                    {selectedLease.status}
                  </p>
                </div>
              </div>
              <div className="p-4 border rounded-md bg-blue-50/30 flex items-center gap-3">
                <ShieldAlert className="size-5 text-blue-600" />
                <div>
                  <Label className="text-xs text-blue-700">
                    Security Deposit Status
                  </Label>
                  <p className="font-semibold text-blue-900 capitalize">
                    {selectedLease.depositStatus?.replace('_', ' ')}
                  </p>
                </div>
              </div>
              {selectedLease.documentUrl && (
                <div className="flex justify-center p-4 border rounded bg-white">
                  <img
                    src={selectedLease.documentUrl || '/placeholder.svg'}
                    alt="Lease Agreement"
                    className="max-h-[300px] object-contain shadow-sm"
                  />
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedLease(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Legacy Dialogs to be phased out */}
      <Dialog
        open={!!finalizeLeaseId}
        onOpenChange={(open) => !open && setFinalizeLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize Move-Out</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to finalize the move-out for this lease? This
            will close the record.
          </p>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setFinalizeLeaseId(null)}>
              Cancel
            </Button>
            <Button onClick={confirmFinalizeCheckout}>Confirm Finalize</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!markAvailableUnitId}
        onOpenChange={(open) => !open && setMarkAvailableUnitId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Unit Available</DialogTitle>
          </DialogHeader>
          <p>Are you sure the unit is ready for new tenants?</p>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="ghost"
              onClick={() => setMarkAvailableUnitId(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmMarkUnitAvailable}
              className="bg-emerald-600"
            >
              Mark Available
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!activateLeaseId}
        onOpenChange={(open) => !open && setActivateLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate Lease</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>
              Ready to activate the lease? Deposit status:{' '}
              <Badge variant="outline">
                {depositStatus?.status || 'checking...'}
              </Badge>
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="ghost" onClick={() => setActivateLeaseId(null)}>
                Cancel
              </Button>
              <Button onClick={confirmActivateLease} className="bg-green-600">
                Confirm Activation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmVerifyLeaseId}
        onOpenChange={(open) => !open && setConfirmVerifyLeaseId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-blue-600">
              <ShieldCheck className="size-5" />
              Verify Lease Documents
            </AlertDialogTitle>
            <AlertDialogDescription>
              Have you reviewed and verified all required documents for this
              tenant? This action confirms that the tenant's ID and supporting
              documents are valid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVerifyDocuments}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Confirm Verification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
