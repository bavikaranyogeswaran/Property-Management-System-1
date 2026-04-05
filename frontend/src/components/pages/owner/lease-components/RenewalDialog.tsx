import React, { useState, useEffect } from 'react';
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
import { RotateCcw, Calendar, DollarSign, MessageSquare } from 'lucide-react';
import { Lease } from '@/app/context/AppContext';
import { toast } from 'sonner';

interface RenewalDialogProps {
  request: any | null;
  leases: Lease[];
  onClose: () => void;
  onSubmit: (requestId: string, rent: number, endDate: string, notes: string) => Promise<void>;
}

export function RenewalDialog({
  request,
  leases,
  onClose,
  onSubmit
}: RenewalDialogProps) {
  const [newRenewalRent, setNewRenewalRent] = useState('');
  const [newRenewalEndDate, setNewRenewalEndDate] = useState('');
  const [renewalNotes, setRenewalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (request) {
      setNewRenewalRent(request.proposedMonthlyRent?.toString() || request.currentMonthlyRent.toString());
      setNewRenewalEndDate(request.proposedEndDate || '');
      setRenewalNotes(request.negotiationNotes || '');
    }
  }, [request]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;

    const currentLease = leases.find(l => String(l.id) === String(request.lease_id));
    const today = new Date();
    const expectedStartDateStr = currentLease?.endDate 
      ? new Date(new Date(currentLease.endDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      : today.toISOString().split('T')[0];

    if (newRenewalEndDate && new Date(newRenewalEndDate) <= new Date(expectedStartDateStr)) {
      toast.error(`The renewal end date must be after the renewal start date (${expectedStartDateStr})`);
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(request.id, parseFloat(newRenewalRent), newRenewalEndDate, renewalNotes);
      onClose();
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-600">
            <RotateCcw className="size-5" />
            Lease Renewal Negotiation
          </DialogTitle>
        </DialogHeader>
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-md mb-4 py-2">
           <p className="text-xs text-blue-700">
             Propose new terms to the tenant for their upcoming lease renewal.
           </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="renewalRent">Proposed Monthly Rent (LKR)</Label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="renewalRent"
                type="number"
                className="pl-9"
                value={newRenewalRent}
                onChange={(e) => setNewRenewalRent(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="renewalEndDate">Proposed End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                id="renewalEndDate"
                type="date"
                className="pl-9"
                value={newRenewalEndDate}
                onChange={(e) => setNewRenewalEndDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="renewalNotes">Negotiation Notes</Label>
            <div className="relative">
              <MessageSquare className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Textarea
                id="renewalNotes"
                placeholder="Standard annual increase, special discount, etc."
                className="pl-9 h-20"
                value={renewalNotes}
                onChange={(e) => setRenewalNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending Proposal...' : 'Send Renewal Proposal'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
