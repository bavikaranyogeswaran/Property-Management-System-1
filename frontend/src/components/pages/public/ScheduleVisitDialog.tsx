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
import {
  Loader2,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
} from 'lucide-react';
import apiClient from '@/services/api';

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  unitNumber: string;
}

interface LeaseTerm {
  id: number;
  leaseTermId: number;
  name: string;
  type: 'fixed' | 'periodic';
  durationMonths?: number;
}

interface ScheduleVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
  unit?: Unit | null;
}

import { useApp } from '@/app/context/AppContext';

export function ScheduleVisitDialog({
  open,
  onOpenChange,
  property,
  unit,
}: ScheduleVisitDialogProps) {
  const { scheduleVisit } = useApp();
  const [loading, setLoading] = useState(false);
  const [leaseTerms, setLeaseTerms] = useState<LeaseTerm[]>([]);
  const [fetchingTerms, setFetchingTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    date: '',
    time: '',
    notes: '',
    moveInDate: '',
    preferredTermMonths: 12,
    leaseTermId: '' as string | number,
  });

  React.useEffect(() => {
    if (open && property) {
      const fetchTerms = async () => {
        setFetchingTerms(true);
        try {
          const response = await apiClient.get(
            `/properties/${property.id}/lease-terms`
          );
          setLeaseTerms(response.data);
        } catch (e) {
          console.error('Failed to fetch terms', e);
        } finally {
          setFetchingTerms(false);
        }
      };
      fetchTerms();
    }
  }, [open, property]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;

    setLoading(true);

    // 1. Term validation
    if (!formData.leaseTermId && formData.preferredTermMonths < 3) {
      toast.error('Minimum lease duration is 3 months');
      setLoading(false);
      return;
    }

    // 2. Lead Time Validation (Min 2 hours)
    const scheduledDateTime = new Date(`${formData.date}T${formData.time}`);
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (scheduledDateTime < twoHoursFromNow) {
      toast.error(
        'Visits must be scheduled at least 2 hours in advance. Please select a later time.'
      );
      setLoading(false);
      return;
    }

    try {
      await scheduleVisit({
        propertyId: property.id,
        unitId: unit?.id || null,
        ...formData,
      });

      toast.success(
        'Visit scheduled successfully! We will contact you to confirm.'
      );
      onOpenChange(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        date: '',
        time: '',
        notes: '',
        moveInDate: '',
        preferredTermMonths: 12,
        leaseTermId: '',
      });
    } catch (error: any) {
      console.error('Failed to schedule visit:', error);
      const msg =
        error.response?.data?.error ||
        'Failed to schedule visit. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!property) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule a Visit</DialogTitle>
          <DialogDescription>
            Request a time to view <strong>{property.name}</strong>{' '}
            {unit ? `- Unit ${unit.unitNumber}` : ''}.
          </DialogDescription>
          <div className="bg-orange-50 border border-orange-100 p-2 rounded text-xs text-orange-800 flex items-center gap-2">
            <Clock className="size-3" />
            <span>Visits are scheduled in 30-minute slots.</span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Your Name"
                required
                value={formData.name}
                onChange={handleChange}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+94 77 123 4567"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Preferred Date</Label>
                <div className="relative">
                  <Input
                    id="date"
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.date}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time Slot</Label>
                <div className="relative">
                  <select
                    id="time"
                    required
                    className="w-full h-10 px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={formData.time}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, time: e.target.value }))
                    }
                  >
                    <option value="">Select a slot</option>
                    {/* Generates slots from 09:00 to 17:00 */}
                    {Array.from({ length: 17 }, (_, i) => {
                      const hour = Math.floor(i / 2) + 9;
                      const minute = i % 2 === 0 ? '00' : '30';
                      const timeStr = `${hour.toString().padStart(2, '0')}:${minute}`;
                      const label = `${hour > 12 ? hour - 12 : hour}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
                      return (
                        <option key={timeStr} value={timeStr}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes / Questions</Label>
              <Textarea
                id="notes"
                placeholder="Is there parking available? etc."
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
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Request Visit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
