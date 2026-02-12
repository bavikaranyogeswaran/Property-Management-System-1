import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Phone, Calendar, Plus } from 'lucide-react';
import { BehaviorLog } from '@/types/models';
import { Tenant, Lease, Unit, Property } from '@/app/context/AppContext';
import { TenantScoreCard } from './TenantScoreCard';
import { BehaviorLogList } from './BehaviorLogList';
import { AddBehaviorModal, BehaviorLogFormData } from './AddBehaviorModal';
import { useApp } from '@/app/context/AppContext';

interface TenantDetailsDialogProps {
  tenant: Tenant | null;
  isOpen: boolean;
  onClose: () => void;
  // Pass these as props to avoid context complexity if possible, or use hooks
  leases: Lease[];
  units: Unit[];
  properties: Property[];
}

export const TenantDetailsDialog: React.FC<TenantDetailsDialogProps> = ({
  tenant,
  isOpen,
  onClose,
  leases,
  units,
  properties,
}) => {
  const [behaviorLogs, setBehaviorLogs] = useState<BehaviorLog[]>([]);
  const [score, setScore] = useState<number>(100);
  const [isAddBehaviorOpen, setIsAddBehaviorOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // In a real app, use environment variable or context for API URL
  const API_URL = 'http://localhost:3000/api';

  const fetchBehaviorData = async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/behavior/${tenant.id}`);
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        setBehaviorLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch behavior data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tenant) {
      fetchBehaviorData();
    }
  }, [isOpen, tenant]);

  const handleAddBehavior = async (data: BehaviorLogFormData) => {
    if (!tenant) return;
    try {
      const res = await fetch(`${API_URL}/behavior/${tenant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id, // Controller expects tenantId (which is userId for tenant) in params, but body might use it too?
          // The route is POST /:tenantId, so params handle it.
          ...data,
          recordedBy: 1, // TODO: Get logged in user ID
        }),
      });

      if (res.ok) {
        fetchBehaviorData(); // Refresh data
      }
    } catch (error) {
      console.error('Failed to add behavior log', error);
    }
  };

  if (!tenant) return null;

  const lease = leases.find(
    (l) => l.tenantId === tenant.id && l.status === 'active'
  );
  const unit = lease ? units.find((u) => u.id === lease.unitId) : null;
  const property = unit
    ? properties.find((p) => p.id === unit.propertyId)
    : null;
  const allTenantLeases = leases.filter((l) => l.tenantId === tenant.id);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tenant Profile</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Header Section with ScoreCard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                {/* Tenant Info */}
                <div className="flex items-start gap-4">
                  <div className="size-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-2xl">
                    {tenant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{tenant.name}</h3>
                    <div className="space-y-1 mt-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="size-4" />
                        {tenant.email}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="size-4" />
                        {tenant.phone}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="size-4" />
                        Member since{' '}
                        {tenant.createdAt
                          ? new Date(tenant.createdAt).toLocaleDateString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                  {lease ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700"
                    >
                      Active Tenant
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-500">
                      Inactive
                    </Badge>
                  )}
                </div>

                {/* Current Residence */}
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-3">Current Residence</h4>
                  {lease && unit && property ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Property</p>
                        <p className="font-medium">{property.name}</p>
                        <p className="text-sm text-gray-500">
                          {property.propertyNo} {property.street},{' '}
                          {property.city}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Unit</p>
                        <p className="font-medium">Unit {unit.unitNumber}</p>
                        <p className="text-sm text-gray-500">{unit.type}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">No active lease</p>
                  )}
                </div>
              </div>

              {/* Score Card Column */}
              <div>
                <TenantScoreCard score={score} />
              </div>
            </div>

            {/* Behavior Logs Section */}
            <div className="border-t pt-6">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold">Behavior History</h4>
                <Button size="sm" onClick={() => setIsAddBehaviorOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Record
                </Button>
              </div>
              <BehaviorLogList logs={behaviorLogs} />
            </div>

            {/* Lease History */}
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3">Lease History</h4>
              {allTenantLeases.length > 0 ? (
                <div className="space-y-2">
                  {allTenantLeases.map((l) => {
                    const lUnit = units.find((u) => u.id === l.unitId);
                    const lProp = lUnit
                      ? properties.find((p) => p.id === lUnit.propertyId)
                      : null;
                    return (
                      <div
                        key={l.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded"
                      >
                        <div className="text-sm">
                          <span className="font-medium">{lProp?.name}</span> -
                          Unit {lUnit?.unitNumber}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {l.startDate} - {l.endDate}
                          </span>
                          <Badge
                            variant={
                              l.status === 'active' ? 'secondary' : 'outline'
                            }
                            className="text-xs"
                          >
                            {l.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No lease history</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AddBehaviorModal
        isOpen={isAddBehaviorOpen}
        onClose={() => setIsAddBehaviorOpen(false)}
        onSubmit={handleAddBehavior}
      />
    </>
  );
};
