import React, { useState } from 'react';
import { useLease } from '@/app/context/LeaseContext';
import { useAuth } from '@/app/context/AuthContext';
import { useProperty } from '@/app/context/PropertyContext';
import { useUser } from '@/app/context/UserContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Home,
  RotateCcw,
} from 'lucide-react';
import { formatLKR } from '@/utils/formatters';

export function RefundRequestsPage() {
  const { user } = useAuth();
  const { leases, approveRefund, disputeRefund, recordDisbursement } =
    useLease();
  const { properties, units } = useProperty();
  const { tenants } = useUser();

  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<
    'approve' | 'dispute' | 'disburse' | null
  >(null);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [disbursementDate, setDisbursementDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requests = leases.filter((l) =>
    ['awaiting_approval', 'disputed', 'awaiting_acknowledgment'].includes(
      l.depositStatus || ''
    )
  );

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaseId || !actionType) return;

    setIsSubmitting(true);
    try {
      if (actionType === 'approve') {
        await approveRefund(selectedLeaseId);
      } else if (actionType === 'disburse') {
        await recordDisbursement(selectedLeaseId, {
          bankReferenceId: bankRef,
          disbursementDate: disbursementDate,
        });
      } else {
        await disputeRefund(selectedLeaseId, disputeNotes);
      }
      setSelectedLeaseId(null);
      setActionType(null);
      setDisputeNotes('');
      setBankRef('');
    } catch (e) {
      // toast handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Refund Requests</h1>
          <p className="text-muted-foreground">
            Manage security deposit refunds submitted by Treasurers.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending & Disputed Requests</CardTitle>
          <CardDescription>
            {requests.length} requests requiring your attention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Property & Unit</TableHead>
                <TableHead>Amount (LKR)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No pending refund requests found.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((lease) => {
                  const tenant = tenants.find((t) => t.id === lease.tenantId);
                  const property = properties.find(
                    (p) => p.id === lease.propertyId
                  );
                  const unit = units.find((u) => u.id === lease.unitId);

                  return (
                    <TableRow key={lease.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-gray-400" />
                          <span className="font-medium">
                            {tenant?.name || 'Unknown'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Home className="size-4 text-gray-400" />
                          <div className="text-sm">
                            <div className="font-medium">
                              {property?.name || 'Unknown'}
                            </div>
                            <div className="text-gray-500">
                              Unit {unit?.unitNumber || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-orange-600">
                          {formatLKR(lease.proposedRefundAmount || 0)}
                        </div>
                        {lease.refundNotes && (
                          <div
                            className="text-xs text-gray-500 italic mt-1 max-w-[200px] truncate"
                            title={lease.refundNotes}
                          >
                            "{lease.refundNotes}"
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            lease.depositStatus === 'awaiting_approval'
                              ? 'secondary'
                              : lease.depositStatus ===
                                  'awaiting_acknowledgment'
                                ? 'outline'
                                : 'destructive'
                          }
                          className={
                            lease.depositStatus === 'awaiting_approval'
                              ? 'bg-blue-100 text-blue-700'
                              : lease.depositStatus ===
                                  'awaiting_acknowledgment'
                                ? 'bg-orange-100 text-orange-700 border-orange-200'
                                : 'bg-red-100 text-red-700'
                          }
                        >
                          {lease.depositStatus === 'awaiting_approval'
                            ? 'Awaiting Approval'
                            : lease.depositStatus === 'awaiting_acknowledgment'
                              ? 'Awaiting Disbursement'
                              : 'Disputed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="size-3" />
                          {new Date(lease.createdAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          {lease.depositStatus === 'awaiting_acknowledgment' ? (
                            <Button
                              size="sm"
                              className="bg-orange-600 hover:bg-orange-700 text-white"
                              onClick={() => {
                                setSelectedLeaseId(lease.id);
                                setActionType('disburse');
                              }}
                            >
                              <RotateCcw className="size-4 mr-1" />
                              Record Transfer
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => {
                                  setSelectedLeaseId(lease.id);
                                  setActionType('approve');
                                }}
                              >
                                <CheckCircle className="size-4 mr-1" />
                                Approve
                              </Button>
                              {lease.depositStatus !== 'disputed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => {
                                    setSelectedLeaseId(lease.id);
                                    setActionType('dispute');
                                  }}
                                >
                                  <AlertCircle className="size-4 mr-1" />
                                  Dispute
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={!!selectedLeaseId}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedLeaseId(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve'
                ? 'Approve Refund'
                : actionType === 'disburse'
                  ? 'Record Bank Disbursement'
                  : 'Dispute Refund'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAction} className="space-y-4 pt-4">
            {actionType === 'approve' ? (
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
                <p>
                  Approve this refund request. This will move it to the{' '}
                  <strong>Awaiting Disbursement</strong> state where the
                  Treasurer can record the bank transfer.
                </p>
                <p className="mt-2 font-semibold">
                  Amount:{' '}
                  {formatLKR(
                    leases.find((l) => l.id === selectedLeaseId)
                      ?.proposedRefundAmount || 0
                  )}
                </p>
              </div>
            ) : actionType === 'disburse' ? (
              <div className="space-y-4">
                <div className="bg-orange-50 text-orange-800 p-4 rounded-lg text-sm">
                  <p>
                    Provide the physical bank transfer details to finalize this
                    refund and record the cash outflow in the ledger.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankRef">
                    Bank Reference ID / UTR (Required)
                  </Label>
                  <Input
                    id="bankRef"
                    required
                    placeholder="e.g. TXN12345678"
                    value={bankRef}
                    onChange={(e) => setBankRef(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disbDate">Transfer Date</Label>
                  <Input
                    id="disbDate"
                    type="date"
                    required
                    value={disbursementDate}
                    onChange={(e) => setDisbursementDate(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>
                  Reasons for Deduction / Dispute (Shared with Tenant)
                </Label>
                <Input
                  required
                  placeholder="Explain why the full amount is not being refunded..."
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedLeaseId(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                variant={
                  actionType === 'dispute'
                    ? 'destructive'
                    : actionType === 'disburse'
                      ? 'default'
                      : 'default'
                }
                className={
                  actionType === 'disburse'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : ''
                }
              >
                {isSubmitting
                  ? 'Processing...'
                  : actionType === 'approve'
                    ? 'Confirm Approval'
                    : actionType === 'disburse'
                      ? 'Finalize Disbursement'
                      : 'Submit Dispute'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
