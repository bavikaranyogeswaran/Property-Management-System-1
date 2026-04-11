import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Clock } from 'lucide-react';
import apiClient from '@/services/api';
import { Visit } from '@/app/context/AppContext';

interface RescheduleVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visit: Visit | null;
  onSuccess: () => void;
}

export function RescheduleVisitDialog({
  open,
  onOpenChange,
  visit,
  onSuccess,
}: RescheduleVisitDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    date: '',
    time: '',
    notes: '',
  });

  React.useEffect(() => {
    if (open && visit) {
      const vDate = new Date(visit.scheduledDate);
      setFormData({
        date: vDate.toISOString().split('T')[0],
        time: vDate.toTimeString().slice(0, 5),
        notes: visit.notes || '',
      });
    }
  }, [open, visit]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visit) return;

    setLoading(true);
    try {
      await apiClient.patch(`/visits/${visit.id}/reschedule`, formData);
      toast.success('Visit rescheduled successfully');
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to reschedule visit:', error);
      const msg = error.response?.data?.error || 'Failed to reschedule visit';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!visit) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reschedule Visit</DialogTitle>
          <DialogDescription>
            Move the viewing for <strong>{visit.visitorName}</strong> to a new
            time slot.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">New Date</Label>
              <Input
                id="date"
                type="date"
                required
                min={new Date().toISOString().split('T')[0]}
                value={formData.date}
                onChange={handleChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">New Time Slot</Label>
              <select
                id="time"
                required
                className="w-full h-10 px-3 py-2 border rounded-md text-sm bg-white"
                value={formData.time}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, time: e.target.value }))
                }
              >
                <option value="">Select a slot</option>
                {Array.from({ length: 17 }, (_, i) => {
                  const hour = Math.floor(i / 2) + 9;
                  const minute = i % 2 === 0 ? '00' : '30';
                  const timeStr = `${hour.toString().padStart(2, '0')}:${minute}`;
                  const label = `${hour > 12 ? hour - 12 : hour}:${minute} ${
                    hour >= 12 ? 'PM' : 'AM'
                  }`;
                  return (
                    <option key={timeStr} value={timeStr}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Internal Notes</Label>
              <Textarea
                id="notes"
                placeholder="Reason for rescheduling..."
                value={formData.notes}
                onChange={handleChange}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
