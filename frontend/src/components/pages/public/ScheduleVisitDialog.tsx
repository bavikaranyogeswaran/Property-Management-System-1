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
import { Loader2, Calendar as CalendarIcon, Clock } from 'lucide-react';

interface Property {
  id: string;
  name: string;
}

interface Unit {
  id: string;
  unitNumber: string;
}

interface LeaseTerm {
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
          const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/properties/${property.id}/lease-terms`);
          const data = await response.json();
          setLeaseTerms(data);
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

            <div className="space-y-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                <p className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                    <CalendarIcon className="size-4" />
                    Lease Preferences (Optional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="moveInDate" className="text-xs text-gray-500">Desired Move-in</Label>
                        <Input
                            id="moveInDate"
                            type="date"
                            value={formData.moveInDate}
                            onChange={handleChange}
                            className="bg-white"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="leaseTermId" className="text-xs text-gray-500">Preferred Term</Label>
                        <select
                            id="leaseTermId"
                            className="w-full h-10 px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.leaseTermId}
                            onChange={(e) => {
                                const val = e.target.value;
                                const term = leaseTerms.find(t => String(t.leaseTermId) === val);
                                setFormData(prev => ({
                                    ...prev,
                                    leaseTermId: val,
                                    preferredTermMonths: term?.durationMonths || prev.preferredTermMonths
                                }));
                            }}
                        >
                            <option value="">Custom / Undecided</option>
                            {leaseTerms.map(t => (
                                <option key={t.leaseTermId} value={t.leaseTermId}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {!formData.leaseTermId && (
                    <div className="space-y-1">
                        <Label htmlFor="preferredTermMonths" className="text-xs text-gray-500">Custom Duration (Months)</Label>
                        <Input
                            id="preferredTermMonths"
                            type="number"
                            value={formData.preferredTermMonths}
                            onChange={handleChange}
                            className="bg-white"
                        />
                    </div>
                )}
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
                <Label htmlFor="time">Time</Label>
                <div className="relative">
                  <Input
                    id="time"
                    type="time"
                    required
                    value={formData.time}
                    onChange={handleChange}
                  />
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
