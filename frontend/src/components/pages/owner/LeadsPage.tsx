import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useApp,
  Lead,
  Visit,
} from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  UserPlus,
  Calendar,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  Check,
  X,
  UserX,
  AlertCircle,
} from 'lucide-react';
import { ChatInterface } from '@/components/common/ChatInterface';
import { toast } from 'sonner';

export function LeadsPage() {
  const navigate = useNavigate();
  const {
    leads,
    units,
    properties,
    visits,
    addLead,
    updateLead,
    convertLeadToTenant,
    updateVisitStatus,
  } = useApp();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isNegotiationDialogOpen, setIsNegotiationDialogOpen] = useState(false);
  const [isDropConfirmOpen, setIsDropConfirmOpen] = useState(false);

  const [conversionData, setConversionData] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    unitId: '',
    ignoreRenewalConflict: false,
  });

  const handleStatusChange = async (leadId: string, status: Lead['status']) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    // Validate transition
    if (status === 'converted' || status === 'dropped') {
      if (lead.status === 'converted' || lead.status === 'dropped') {
        toast.error('Cannot change status of converted or dropped leads');
        return;
      }
    }

    try {
      await updateLead(leadId, {
        status,
        lastContactedAt: new Date().toISOString().split('T')[0],
      });
      toast.success(`Lead moved to ${getStatusLabel(status)}`);
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleVisitStatusChange = async (
    visitId: string,
    status: Visit['status']
  ) => {
    try {
      await updateVisitStatus(visitId, status);
    } catch (e) {
      // Toast handled in context
    }
  };


  useEffect(() => {
    if (selectedLead) {
      const initialStartDate = selectedLead.moveInDate 
        ? new Date(selectedLead.moveInDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      
      setConversionData(prev => ({
        ...prev,
        startDate: initialStartDate,
        unitId: selectedLead.interestedUnit || ''
      }));
    }
  }, [selectedLead]);

  useEffect(() => {
    if (selectedLead?.preferredTermMonths && conversionData.startDate) {
      const start = new Date(conversionData.startDate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + selectedLead.preferredTermMonths);
      setConversionData((prev) => ({
        ...prev,
        endDate: end.toISOString().split('T')[0],
      }));
    }
  }, [selectedLead?.preferredTermMonths, conversionData.startDate]);

  const handleConvert = async () => {
    if (!selectedLead) return;

    try {
      await convertLeadToTenant(
        selectedLead.id,
        conversionData.startDate,
        conversionData.endDate || undefined,
        {
          unitId: conversionData.unitId || undefined,
        }
      );
      toast.success('Lead converted to tenant successfully');
      setIsConvertDialogOpen(false);
      setSelectedLead(null);
      // Reset dates
      setConversionData({
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        unitId: '',
        ignoreRenewalConflict: false,
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to convert lead');
    }
  };

  const getStatusLabel = (status: Lead['status']) => {
    const labels: Record<Lead['status'], string> = {
      interested: 'Interested',
      converted: 'Converted',
      dropped: 'Dropped',
    };
    return labels[status];
  };

  const getVisitStatusBadge = (status: Visit['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-red-100 text-red-800',
      completed: 'bg-green-100 text-green-800',
    };
    return (
      <Badge variant="outline" className={styles[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getStatusBadge = (status: Lead['status']) => {
    const variants: Record<
      Lead['status'],
      { variant: any; label: string; color: string }
    > = {
      interested: {
        variant: 'default',
        label: 'Interested',
        color: 'bg-blue-100 text-blue-700',
      },
      converted: {
        variant: 'default',
        label: 'Converted',
        color: 'bg-green-100 text-green-700',
      },
      dropped: {
        variant: 'destructive',
        label: 'Dropped',
        color: 'bg-gray-100 text-gray-700',
      },
    };
    return variants[status];
  };

  const stats = [
    {
      label: 'Scheduled Visits',
      value: visits.filter(
        (v) => v.status === 'pending' || v.status === 'confirmed'
      ).length,
      icon: Calendar,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Total Leads',
      value: leads.length,
      icon: UserPlus,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Interested',
      value: leads.filter((l) => l.status === 'interested').length,
      icon: TrendingUp,
      color: 'bg-purple-50 text-purple-700',
    },
    {
      label: 'Converted',
      value: leads.filter((l) => l.status === 'converted').length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
  ];

  // Calculate conversion rate
  const totalLeads = leads.length;
  const convertedLeads = leads.filter((l) => l.status === 'converted').length;
  const conversionRate =
    totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  const activeLeads = leads.filter(
    (l) => !['converted', 'dropped'].includes(l.status)
  );
  const convertedLeadsList = leads.filter((l) => l.status === 'converted');
  const droppedLeads = leads.filter((l) => l.status === 'dropped');

  const VisitTable = ({ visits: data }: { visits: Visit[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Visitor</TableHead>
            <TableHead>Date & Time</TableHead>
            <TableHead>Property/Unit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((visit) => {
            const visitDate = new Date(visit.scheduled_date).toLocaleString();
            return (
              <TableRow key={visit.visit_id}>
                <TableCell>
                  <div className="font-medium">{visit.visitor_name}</div>
                  <div className="text-xs text-gray-500">
                    {visit.visitor_email}
                  </div>
                  <div className="text-xs text-gray-500">
                    {visit.visitor_phone}
                  </div>
                </TableCell>
                <TableCell>{visitDate}</TableCell>
                <TableCell>
                  <div>{visit.property_name}</div>
                  {visit.unit_number && (
                    <div className="text-xs text-gray-500">
                      Unit: {visit.unit_number}
                    </div>
                  )}
                </TableCell>
                <TableCell>{getVisitStatusBadge(visit.status)}</TableCell>
                <TableCell className="max-w-xs truncate" title={visit.notes}>
                  {visit.notes}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    {visit.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-green-600 hover:bg-green-50"
                          onClick={() =>
                            handleVisitStatusChange(visit.visit_id, 'confirmed')
                          }
                          title="Confirm Visit"
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() =>
                            handleVisitStatusChange(visit.visit_id, 'cancelled')
                          }
                          title="Cancel Visit"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    )}
                    {visit.status === 'confirmed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:bg-blue-50"
                        onClick={() =>
                          handleVisitStatusChange(visit.visit_id, 'completed')
                        }
                        title="Mark as Completed"
                      >
                        <CheckCircle className="size-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {data.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No scheduled visits.
        </div>
      )}
    </div>
  );

  const LeadTable = ({ leads: leadsData }: { leads: Lead[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Interested Unit</TableHead>
            <TableHead>Preferences</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Contact</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leadsData.map((lead) => {
            const statusBadge = getStatusBadge(lead.status);

            return (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{lead.email}</div>
                    <div className="text-gray-500">{lead.phone}</div>
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const unit = units.find((u) => u.id === lead.interestedUnit);
                    const property = properties.find((p) => p.id === lead.propertyId);
                    
                    if (unit) {
                      return (
                        <div>
                          <div className="font-medium text-gray-900">{property?.name || 'Unknown Property'}</div>
                          <div className="text-xs text-gray-500">Unit: {unit.unitNumber}</div>
                        </div>
                      );
                    }
                    
                    if (property) {
                      return (
                        <div>
                          <div className="font-medium text-gray-900">{property.name}</div>
                          <div className="text-xs text-blue-600 font-medium italic">Whole Property</div>
                        </div>
                      );
                    }

                    return <span className="text-gray-400 italic">N/A</span>;
                  })()}
                </TableCell>
                <TableCell>
                  <div className="text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Move-in:</span>{' '}
                      {lead.moveInDate
                        ? new Date(lead.moveInDate).toLocaleDateString()
                        : '-'}
                    </div>
                    <div>
                      <span className="font-medium">Term:</span>{' '}
                      {lead.preferredTermMonths ? `${lead.preferredTermMonths} months` : '-'}
                    </div>
                    <div>
                      <span className="font-medium">Occupants:</span>{' '}
                      {lead.occupantsCount || '-'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusBadge.variant}
                    className={statusBadge.color}
                  >
                    {statusBadge.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">
                    {lead.lastContactedAt
                      ? new Date(lead.lastContactedAt).toLocaleDateString()
                      : '-'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedLead(lead);
                        setIsNegotiationDialogOpen(true);
                      }}
                      title="Negotiate / Chat"
                    >
                      <MessageSquare className="size-4 text-blue-600" />
                    </Button>
                    {lead.status !== 'converted' &&
                      lead.status !== 'dropped' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLead(lead);
                              setIsConvertDialogOpen(true);
                            }}
                            title="Convert to Tenant"
                          >
                            <CheckCircle className="size-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLead(lead);
                              setIsDropConfirmOpen(true);
                            }}
                            title="Drop Lead"
                          >
                            <UserX className="size-4 text-red-600" />
                          </Button>
                        </>
                      )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {leadsData.length === 0 && (
        <div className="py-12 text-center">
          <UserPlus className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No leads found</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Leads
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage prospective tenants and upcoming visits
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p
                      className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <Icon
                    className={`size-8 ${stat.color.split(' ')[1]} opacity-20`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-semibold mt-1 text-green-700">
                  {conversionRate}%
                </p>
              </div>
              <TrendingUp className="size-8 text-green-700 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List View */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="visits" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="visits">
                  Scheduled Visits ({visits.length})
                </TabsTrigger>
                <TabsTrigger value="active">
                  Active Leads ({activeLeads.length})
                </TabsTrigger>
                <TabsTrigger value="converted">
                  Converted ({convertedLeadsList.length})
                </TabsTrigger>
                <TabsTrigger value="dropped">
                  Dropped ({droppedLeads.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="visits" className="m-0">
              <VisitTable visits={visits} />
            </TabsContent>
            <TabsContent value="active" className="m-0">
              <LeadTable leads={activeLeads} />
            </TabsContent>
            <TabsContent value="converted" className="m-0">
              <LeadTable leads={convertedLeadsList} />
            </TabsContent>
            <TabsContent value="dropped" className="m-0">
              <LeadTable leads={droppedLeads} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Drop Confirmation Dialog */}
      <Dialog open={isDropConfirmOpen} onOpenChange={setIsDropConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="size-5" />
              Drop Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to drop <strong>{selectedLead?.name}</strong>? 
              This will move them to the "Dropped" category and stop any further processing.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDropConfirmOpen(false);
                  setSelectedLead(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={async () => {
                  if (selectedLead) {
                    await handleStatusChange(selectedLead.id, 'dropped');
                    setIsDropConfirmOpen(false);
                    setSelectedLead(null);
                  }
                }}
              >
                Drop Lead
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to convert{' '}
              <strong>{selectedLead?.name}</strong> to a tenant?
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="conv-start-date">Lease Start Date</Label>
                <Input
                  id="conv-start-date"
                  type="date"
                  value={conversionData.startDate}
                  onChange={(e) =>
                    setConversionData({
                      ...conversionData,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conv-end-date">Lease End Date</Label>
                <Input
                  id="conv-end-date"
                  type="date"
                  value={conversionData.endDate}
                  onChange={(e) =>
                    setConversionData({
                      ...conversionData,
                      endDate: e.target.value,
                    })
                  }
                />
                <p className="text-[10px] text-gray-500">
                  {selectedLead?.preferredTermMonths 
                    ? `Pre-filled with lead's ${selectedLead.preferredTermMonths}mo preference`
                    : 'Required (Min 90 days recommended)'}
                </p>
              </div>
            </div>
            {/* Unit Selection Logic */}
            <div className="space-y-2 pt-2 border-t">
              <Label>Unit Assignment</Label>
              {selectedLead?.interestedUnit ? (
                <div className="p-3 bg-gray-50 rounded-md border text-sm text-gray-700 flex justify-between items-center">
                  <span>
                    Interested Unit:{' '}
                    <strong>
                      {units.find((u) => u.id === selectedLead.interestedUnit)
                        ?.unitNumber || 'Unknown'}
                    </strong>
                  </span>

                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    This lead is interested in the{' '}
                    <strong>Whole Property</strong>. Select a unit to create a
                    lease automatically.
                  </p>
                  <select
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={conversionData.unitId}
                    onChange={(e) =>
                      setConversionData({
                        ...conversionData,
                        unitId: e.target.value,
                      })
                    }
                  >
                    <option value="">Select a Unit (Optional)</option>
                    {selectedLead &&
                      units
                        .filter(
                          (u) =>
                            u.propertyId === selectedLead.propertyId &&
                            u.status === 'available'
                        )
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            Unit {u.unitNumber} - {u.type} (LKR {u.monthlyRent})
                          </option>
                        ))}
                  </select>
                  {conversionData.unitId && (
                    <p className="text-xs text-green-600">
                      Lease will be created for this unit.
                    </p>
                  )}
                  {!conversionData.unitId && (
                    <p className="text-xs text-amber-600">
                      No unit selected. Tenant will be created WITHOUT an active
                      lease.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsConvertDialogOpen(false);
                  setSelectedLead(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConvert}>Convert to Tenant</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Negotiation Chat Dialog */}
      <Dialog
        open={isNegotiationDialogOpen}
        onOpenChange={setIsNegotiationDialogOpen}
      >
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Chat with {selectedLead?.name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <ChatInterface
              leadId={selectedLead.id}
              className="flex-1 min-h-0 border-0 shadow-none"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
