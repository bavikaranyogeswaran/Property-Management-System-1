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

export function RefundRequestsPage() {
  const { user } = useAuth();
  const { leases, approveRefund, disputeRefund } = useLease();
  const { properties, units } = useProperty();
  const { tenants } = useUser();

  const [selectedLeaseId, setSelectedLeaseId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'dispute' | null>(null);
  const [disputeNotes, setDisputeNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requests = leases.filter(l => 
    ['awaiting_approval', 'disputed'].includes(l.depositStatus || '')
  );

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeaseId || !actionType) return;

    setIsSubmitting(true);
    try {
      if (actionType === 'approve') {
        await approveRefund(selectedLeaseId);
      } else {
        await disputeRefund(selectedLeaseId, disputeNotes);
      }
      setSelectedLeaseId(null);
      setActionType(null);
      setDisputeNotes('');
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
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No pending refund requests found.
                  </TableCell>
                </TableRow>
              ) : (
                requests.map((lease) => {
                  const tenant = tenants.find(t => t.id === lease.tenantId);
                  const property = properties.find(p => p.id === lease.propertyId);
                  const unit = units.find(u => u.id === lease.unitId);

                  return (
                    <TableRow key={lease.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="size-4 text-gray-400" />
                          <span className="font-medium">{tenant?.name || 'Unknown'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Home className="size-4 text-gray-400" />
                          <div className="text-sm">
                            <div className="font-medium">{property?.name || 'Unknown'}</div>
                            <div className="text-gray-500">Unit {unit?.unitNumber || 'N/A'}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-orange-600">
                          {lease.proposedRefundAmount?.toLocaleString()}
                        </div>
                        {lease.refundNotes && (
                          <div className="text-xs text-gray-500 italic mt-1 max-w-[200px] truncate" title={lease.refundNotes}>
                            "{lease.refundNotes}"
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={lease.depositStatus === 'awaiting_approval' ? 'secondary' : 'outline'}
                          className={lease.depositStatus === 'awaiting_approval' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}
                        >
                          {lease.depositStatus === 'awaiting_approval' ? 'Awaiting Approval' : 'Disputed'}
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

      <Dialog open={!!selectedLeaseId} onOpenChange={(o) => { if(!o) { setSelectedLeaseId(null); setActionType(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Refund' : 'Dispute Refund'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAction} className="space-y-4 pt-4">
            {actionType === 'approve' ? (
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
                <p>Confirming this will finalize the refund of <strong>LKR {leases.find(l => l.id === selectedLeaseId)?.proposedRefundAmount?.toLocaleString()}</strong> and record it in the ledger.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Reason for Dispute</Label>
                <Input
                  required
                  placeholder="Explain why the refund is being disputed..."
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedLeaseId(null)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                variant={actionType === 'dispute' ? 'destructive' : 'default'}
              >
                {isSubmitting ? 'Processing...' : (actionType === 'approve' ? 'Confirm Approval' : 'Submit Dispute')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
