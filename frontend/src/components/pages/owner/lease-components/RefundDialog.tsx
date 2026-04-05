import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RotateCcw } from 'lucide-react';
import { Lease } from '@/app/context/AppContext';

interface RefundDialogProps {
  leaseId: string | null;
  type: 'request' | 'approve' | 'dispute';
  onClose: () => void;
  onSubmit: (leaseId: string, amount: number, notes: string, type: 'request' | 'approve' | 'dispute') => Promise<void>;
  leases: Lease[];
}

export function RefundDialog({
  leaseId,
  type,
  onClose,
  onSubmit,
  leases
}: RefundDialogProps) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lease = leases.find(l => String(l.id) === String(leaseId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaseId) return;
    try {
      setIsSubmitting(true);
      await onSubmit(leaseId, parseFloat(amount), notes, type);
      setAmount('');
      setNotes('');
      onClose();
    } catch (err) {
      // Error handled by parent/toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!leaseId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-orange-600" />
            {type === 'request' ? 'Request Security Deposit Refund' : 
             type === 'approve' ? 'Approve Refund Request' : 'Dispute Refund Request'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {type === 'request' && (
            <div className="space-y-2">
              <Label htmlFor="refundAmount">Refund Amount (LKR)</Label>
              <Input
                id="refundAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500 italic">
                Verified Ledger Balance: LKR {lease?.currentDepositBalance || '0'}
              </p>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="refundNotes">
              {type === 'dispute' ? 'Reason for Dispute' : 'Notes / Remarks'}
            </Label>
            <Textarea
              id="refundNotes"
              placeholder={type === 'dispute' ? 'Explain why part or all of the refund is being disputed...' : 'Optional notes...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              required={type === 'dispute'}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className={type === 'dispute' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 
               type === 'request' ? 'Submit Request' : 
               type === 'approve' ? 'Confirm Approval' : 'Submit Dispute'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
