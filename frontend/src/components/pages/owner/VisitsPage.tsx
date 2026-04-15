import React, { useState, useEffect } from 'react';
import { useApp, Visit } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Check,
  X,
  CheckCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { format } from 'date-fns';
import { RescheduleVisitDialog } from './RescheduleVisitDialog';

export function VisitsPage() {
  console.log('!!! VISITS PAGE LOADED (Property Management System 2) !!!');
  const { visits, updateVisitStatus, fetchVisits } = useApp();
  const [filter, setFilter] = useState<Visit['status'] | 'all'>('all');
  const [rescheduleData, setRescheduleData] = useState<{
    open: boolean;
    visit: Visit | null;
  }>({ open: false, visit: null });

  useEffect(() => {
    console.log('!!! VISITS PAGE LOADED (Property Management System 2) !!!');
  }, []);

  const filteredVisits = visits
    .filter((v) => (filter === 'all' ? true : v.status === filter))
    .sort(
      (a, b) =>
        new Date(a.scheduledDate).getTime() -
        new Date(b.scheduledDate).getTime()
    );

  const handleStatusUpdate = async (id: string, newStatus: Visit['status']) => {
    await updateVisitStatus(id, newStatus);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'no-show':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Property Visits
          </h2>
          <p className="text-sm text-gray-500">
            Manage scheduled property viewings
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              'all',
              'pending',
              'confirmed',
              'completed',
              'cancelled',
              'no-show',
            ] as const
          ).map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {filteredVisits.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No visits found for the selected filter.
            </CardContent>
          </Card>
        ) : (
          filteredVisits.map((visit) => (
            <Card key={visit.id} className="overflow-hidden">
              <div className="p-6 flex flex-col lg:flex-row flex-wrap gap-6 items-start lg:items-center justify-between">
                {/* Visitor Info */}
                <div className="flex items-start gap-4 min-w-[200px] flex-[1.2]">
                  <div className="bg-gray-100 p-3 rounded-full shrink-0">
                    <User className="size-6 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {visit.visitorName}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <Mail className="size-3" />
                      {visit.visitorEmail}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                      <Phone className="size-3" />
                      {visit.visitorPhone}
                    </div>
                  </div>
                </div>

                {/* Property Info */}
                <div className="flex flex-col gap-2 min-w-[180px] flex-1">
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="size-4 text-blue-500" />
                    <span className="font-medium truncate">
                      {visit.propertyName || 'Unknown Property'}
                    </span>
                  </div>
                  {visit.unitNumber && (
                    <div className="text-sm text-gray-500 ml-6">
                      Unit {visit.unitNumber}
                    </div>
                  )}
                </div>

                {/* Schedule Info */}
                <div className="flex flex-col gap-2 min-w-[140px] flex-[0.8]">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="size-4 text-purple-500" />
                    <span>
                      {format(new Date(visit.scheduledDate), 'MMM dd, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Clock className="size-4 text-purple-500" />
                    <span>
                      {format(new Date(visit.scheduledDate), 'hh:mm a')}
                    </span>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex flex-col lg:items-end items-start gap-3 flex-[1.5] min-w-[240px]">
                  <Badge
                    className={`${getStatusColor(visit.status)} capitalize px-3 py-1 text-xs font-semibold`}
                  >
                    {visit.status}
                  </Badge>

                  {visit.status === 'pending' && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white shrink-0 whitespace-nowrap"
                        onClick={() =>
                          handleStatusUpdate(visit.id, 'confirmed')
                        }
                      >
                        <Check className="size-4 mr-1" /> Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 shrink-0 whitespace-nowrap min-w-[100px]"
                        onClick={() =>
                          handleStatusUpdate(visit.id, 'cancelled')
                        }
                      >
                        <X className="size-4 mr-1" /> Reject
                      </Button>
                    </div>
                  )}

                  {visit.status === 'confirmed' && (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                        onClick={() =>
                          handleStatusUpdate(visit.id, 'completed')
                        }
                      >
                        <CheckCircle className="size-4 mr-1.5" /> Complete
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-600 hover:bg-orange-50 border-orange-100 border h-8"
                          onClick={() =>
                            handleStatusUpdate(visit.id, 'no-show')
                          }
                        >
                          No-Show
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            setRescheduleData({ open: true, visit })
                          }
                        >
                          Reschedule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 h-8"
                          onClick={() =>
                            handleStatusUpdate(visit.id, 'cancelled')
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {visit.notes && (
                <div className="bg-gray-50 px-6 py-3 border-t text-sm text-gray-600">
                  <span className="font-semibold mr-2">Notes:</span>{' '}
                  {visit.notes}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <RescheduleVisitDialog
        open={rescheduleData.open}
        onOpenChange={(open) =>
          setRescheduleData((prev) => ({ ...prev, open }))
        }
        visit={rescheduleData.visit}
        onSuccess={() => fetchVisits()}
      />
    </div>
  );
}
