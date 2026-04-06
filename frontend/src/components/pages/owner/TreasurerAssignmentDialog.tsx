import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Building } from 'lucide-react';
import { apiClient } from '@/services/api';
import { toast } from 'sonner';
import { Treasurer, Property } from '@/app/context/AppContext';

interface TreasurerAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treasurer: Treasurer | null;
  properties: Property[];
}

export function TreasurerAssignmentDialog({
  open,
  onOpenChange,
  treasurer,
  properties,
}: TreasurerAssignmentDialogProps) {
  const [assignedPropertyIds, setAssignedPropertyIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && treasurer) {
      fetchAssignments();
    } else {
      setAssignedPropertyIds([]);
    }
  }, [open, treasurer]);

  const fetchAssignments = async () => {
    if (!treasurer) return;
    setIsLoading(true);
    try {
      const response = await apiClient.get(
        `/users/${treasurer.id}/assigned-properties`
      );
      // Assuming response.data is an array of properties
      const assignedIds = response.data.map((p: any) => Number(p.id));
      setAssignedPropertyIds(assignedIds);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
      toast.error('Failed to load current assignments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (propertyId: number, checked: boolean) => {
    // Optimistic update
    setAssignedPropertyIds((prev) =>
      checked ? [...prev, propertyId] : prev.filter((id) => id !== propertyId)
    );
  };

  const handleSave = async () => {
    if (!treasurer) return;
    setIsSaving(true);
    try {
      // We can't batch update simply with current API (it's one by one).
      // A better API would be "setAssignments" taking a list.
      // But for now, we'll implement a "sync" logic:
      // 1. Get original server state (or assume we loaded it correctly).
      // Actually, querying the server state again is safer, but let's just diff against what we loaded.
      // Simplified approach: For this demo, we'll just send individual requests for now.
      // A "Bulk Assign" endpoint would be better, but we only added single add/remove.

      // To properly sync without race conditions or complex diffing on frontend,
      // the best way with current API is:
      // - Calculate additions
      // - Calculate removals
      // - Execute in parallel

      // Re-fetch true server state to diff against (in case user closed/reopened quickly)
      const response = await apiClient.get(
        `/users/${treasurer.id}/assigned-properties`
      );
      const serverAssignedIds: number[] = response.data.map((p: any) =>
        Number(p.id)
      );

      const toAdd = assignedPropertyIds.filter(
        (id) => !serverAssignedIds.includes(id)
      );
      const toRemove = serverAssignedIds.filter(
        (id: number) => !assignedPropertyIds.includes(id)
      );

      const promises = [
        ...toAdd.map((id: number) =>
          apiClient.post('/users/assign-property', {
            userId: treasurer.id,
            propertyId: id,
          })
        ),
        ...toRemove.map((id: number) =>
          apiClient.delete(`/users/${treasurer.id}/assign-property/${id}`)
        ),
      ];

      await Promise.all(promises);
      toast.success('Assignments updated successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save assignments:', error);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Properties</DialogTitle>
          <DialogDescription>
            Select the properties that {treasurer?.name} helps manage.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 max-h-[60vh] overflow-y-auto space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin size-8 text-gray-400" />
            </div>
          ) : properties.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              No active properties found.
            </p>
          ) : (
            properties.map((property) => (
              <div
                key={property.id}
                className="flex items-start space-x-3 p-3 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
              >
                <Checkbox
                  id={`prop-${property.id}`}
                  checked={assignedPropertyIds.includes(Number(property.id))}
                  onCheckedChange={(checked) =>
                    handleToggle(Number(property.id), checked as boolean)
                  }
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor={`prop-${property.id}`}
                    className="font-medium cursor-pointer"
                  >
                    {property.name}
                  </Label>
                  <p className="text-xs text-gray-500">
                    {property.city}, {property.district}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
