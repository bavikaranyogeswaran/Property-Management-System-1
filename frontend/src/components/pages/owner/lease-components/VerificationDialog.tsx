import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, ShieldX } from 'lucide-react';

interface VerificationDialogProps {
  leaseId: string | null;
  onClose: () => void;
  onSubmit: (leaseId: string, reason: string) => Promise<void>;
}

export function VerificationDialog({
  leaseId,
  onClose,
  onSubmit
}: VerificationDialogProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaseId) return;
    try {
      setIsSubmitting(true);
      await onSubmit(leaseId, rejectionReason);
      setRejectionReason('');
      onClose();
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!leaseId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <ShieldX className="size-5" />
            Reject Lease Documents
          </DialogTitle>
        </DialogHeader>
        <div className="bg-orange-50 border border-orange-200 p-3 rounded-md mb-4 flex items-start gap-2">
           <AlertTriangle className="size-4 text-orange-600 mt-0.5 shrink-0" />
           <p className="text-xs text-orange-700">
             Specify the reason for rejection (e.g., blurred image, expired ID). The tenant will be notified to re-upload.
           </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Rejection Reason</Label>
            <Textarea
              id="rejectReason"
              placeholder="e.g. Identity Document is expired or blurred..."
              className="h-24"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
                type="submit" 
                className="bg-orange-600 hover:bg-orange-700"
                disabled={isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
