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
import { TrendingUp, Calendar, DollarSign, Clock } from 'lucide-react';
import { formatLKR, formatToLocalDate } from '@/utils/formatters';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AdjustmentDialogProps {
  leaseId: string | null;
  adjustments: any[];
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (date: string, rent: number, notes: string) => Promise<void>;
}

export function AdjustmentDialog({
  leaseId,
  adjustments,
  isLoading,
  onClose,
  onSubmit,
}: AdjustmentDialogProps) {
  const [adjDate, setAdjDate] = useState('');
  const [adjRent, setAdjRent] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaseId) return;
    try {
      setIsSubmitting(true);
      await onSubmit(adjDate, parseFloat(adjRent), adjNotes);
      setAdjDate('');
      setAdjRent('');
      setAdjNotes('');
      // We don't close here because users might want to see the new adjustment added to the list
    } catch (err) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!leaseId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <TrendingUp className="size-5" />
            Manage Rent Adjustments
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Adjustment List */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Scheduled & Past Adjustments
            </Label>
            <ScrollArea className="h-[150px] border rounded-md p-2">
              {isLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  Loading adjustments...
                </div>
              ) : adjustments.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400 italic">
                  No scheduled adjustments found.
                </div>
              ) : (
                <div className="space-y-2">
                  {adjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100 text-xs"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="font-medium flex items-center gap-1">
                          <Calendar className="size-3" />
                          {formatToLocalDate(adj.effective_date)}
                        </div>
                        <div className="text-gray-500 truncate max-w-[150px]">
                          {adj.notes || 'No notes'}
                        </div>
                      </div>
                      <div className="text-right flex flex-col gap-1 items-end">
                        <div className="font-semibold text-emerald-700">
                          {formatLKR(adj.new_monthly_rent)}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 py-0"
                        >
                          {new Date(adj.effective_date) > new Date()
                            ? 'Scheduled'
                            : 'Applied'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <hr />

          {/* New Adjustment Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Schedule New Adjustment
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="adjDate">Effective Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="adjDate"
                    type="date"
                    className="pl-9"
                    value={adjDate}
                    onChange={(e) => setAdjDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjRent">New Monthly Rent</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="adjRent"
                    type="number"
                    placeholder="0.00"
                    className="pl-9"
                    value={adjRent}
                    onChange={(e) => setAdjRent(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjNotes">Reason for Adjustment</Label>
              <Textarea
                id="adjNotes"
                placeholder="Standard annual increase, negotiated rate, etc."
                className="h-20"
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Scheduling...' : 'Schedule Adjustment'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
