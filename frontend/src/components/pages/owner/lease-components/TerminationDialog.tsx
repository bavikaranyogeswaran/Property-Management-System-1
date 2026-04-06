import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, XCircle } from 'lucide-react';
import { Lease } from '@/app/context/AppContext';

interface TerminationDialogProps {
  leaseId: string | null;
  onClose: () => void;
  onSubmit: (leaseId: string, date: string, fee: number) => Promise<void>;
  leases: Lease[];
}

export function TerminationDialog({
  leaseId,
  onClose,
  onSubmit,
  leases,
}: TerminationDialogProps) {
  const [terminationDate, setTerminationDate] = useState('');
  const [terminationFee, setTerminationFee] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lease = leases.find((l) => String(l.id) === String(leaseId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaseId) return;
    try {
      setIsSubmitting(true);
      await onSubmit(leaseId, terminationDate, parseFloat(terminationFee) || 0);
      setTerminationDate('');
      setTerminationFee('');
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
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="size-5" />
            End Lease Agreement
          </DialogTitle>
        </DialogHeader>
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-md mb-4 flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Ending a lease will mark the unit as vacating. You must still
            perform the final checkout and deposit refund after the move-out
            date.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="termDate" className="text-right">
              End Date
            </Label>
            <Input
              id="termDate"
              type="date"
              className="col-span-3"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="termFee" className="text-right">
              Fee (Optional)
            </Label>
            <Input
              id="termFee"
              type="number"
              placeholder="0.00"
              className="col-span-3"
              value={terminationFee}
              onChange={(e) => setTerminationFee(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Terminating...' : 'Terminate Lease'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
