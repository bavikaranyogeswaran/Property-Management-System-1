import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useApp,
  Lead,
  LeadStageHistory,
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
  Clock,
  TrendingUp,
  LayoutGrid,
  List,
  XCircle,
  MessageSquare,
  Check,
  X,
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
    leadFollowUps,
    leadStageHistory,
    addLead,
    updateLead,
    addLeadFollowUp,
    convertLeadToTenant,
    updateVisitStatus,
  } = useApp();

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [isNegotiationDialogOpen, setIsNegotiationDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');

  const [followUpData, setFollowUpData] = useState({
    date: '',
    notes: '',
    nextAction: '',
  });

  const [conversionData, setConversionData] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    unitId: '',
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

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    addLeadFollowUp({
      leadId: selectedLead.id,
      ...followUpData,
    });

    try {
      // Update last contacted date
      await updateLead(selectedLead.id, { lastContactedAt: followUpData.date });

      toast.success('Follow-up added successfully');
      setIsFollowUpDialogOpen(false);
      setFollowUpData({
        date: '',
        notes: '',
        nextAction: '',
      });
    } catch (error) {
      toast.error('Failed to update lead');
    }
  };

  const handleConvert = async () => {
    if (!selectedLead) return;

    try {
      const tenantId = await convertLeadToTenant(
        selectedLead.id,
        conversionData.startDate,
        conversionData.endDate || undefined,
        conversionData.unitId || undefined
      );
      toast.success('Lead converted to tenant successfully');
      setIsConvertDialogOpen(false);
      setSelectedLead(null);
      // Reset dates
      setConversionData({
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        unitId: '',
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

  // Pipeline view data
  const pipelineStages: Array<{
    status: Lead['status'];
    label: string;
    color: string;
  }> = [
    {
      status: 'interested',
      label: 'Interested',
      color: 'border-blue-200 bg-blue-50',
    },
    {
      status: 'converted',
      label: 'Converted',
      color: 'border-green-200 bg-green-50',
    },
  ];

  const LeadCard = ({ lead }: { lead: Lead }) => {
    const unit = units.find((u) => u.id === lead.interestedUnit);
    const property = properties.find((p) => p.id === lead.propertyId);
    const leadFollowUpsCount = leadFollowUps.filter(
      (f) => f.leadId === lead.id
    ).length;
    const statusBadge = getStatusBadge(lead.status);
    const history = leadStageHistory.filter((h) => h.leadId === lead.id);

    // Determine unit display text
    const unitDisplay =
      unit?.unitNumber ||
      (property?.name ? `${property.name} (General)` : 'N/A');

    return (
      <div className="p-3 bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h4 className="font-medium text-sm">{lead.name}</h4>
            <p className="text-xs text-gray-500">{lead.email}</p>
            <p className="text-xs text-gray-500">{lead.phone}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 inline-flex items-center justify-center flex-shrink-0"
            onClick={() => {
              setSelectedLead(lead);
              setIsHistoryDialogOpen(true);
            }}
            title="View Stage History"
          >
            <Clock className="size-3.5" />
          </Button>
        </div>

        <div className="space-y-1 mb-3">
          <p className="text-xs text-gray-600">
            <span className="font-medium">Unit:</span> {unitDisplay}
          </p>
          <p className="text-xs text-gray-600">
            <span className="font-medium">Created:</span>{' '}
            {new Date(lead.createdAt).toLocaleString()}
          </p>
          {lead.lastContactedAt && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">Last Contact:</span>{' '}
              {new Date(lead.lastContactedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex gap-1 items-center">
{lead.status !== 'converted' && lead.status !== 'dropped' && (
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-7 text-xs inline-flex items-center justify-center"
              onClick={() => {
                setSelectedLead(lead);
                setIsFollowUpDialogOpen(true);
              }}
            >
              <Calendar className="size-3 mr-1 flex-shrink-0" />
              Follow-up {leadFollowUpsCount > 0 && `(${leadFollowUpsCount})`}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs inline-flex items-center justify-center text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            onClick={() => {
              setSelectedLead(lead);
              setIsNegotiationDialogOpen(true);
            }}
          >
            <MessageSquare className="size-3 mr-1 flex-shrink-0" />
            Chat
          </Button>

          {lead.status === 'converted' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-200 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400"
              onClick={() => navigate('/tenants')}
              title="View Tenant Details"
            >
              View Tenant
            </Button>
          )}

          {lead.status === 'interested' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-200 text-green-700 bg-green-50 hover:bg-green-100"
              onClick={() => {
                setSelectedLead(lead);
                setIsConvertDialogOpen(true);
              }}
              title="Convert to Tenant"
            >
              Convert
            </Button>
          )}
          {lead.status !== 'converted' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 inline-flex items-center justify-center flex-shrink-0"
              onClick={() => handleStatusChange(lead.id, 'dropped')}
              title="Drop Lead"
            >
              <XCircle className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

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
            <TableHead>Details</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Contact</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leadsData.map((lead) => {
            const unit = units.find((u) => u.id === lead.interestedUnit);
            const statusBadge = getStatusBadge(lead.status);
            const leadFollowUpsCount = leadFollowUps.filter(
              (f) => f.leadId === lead.id
            ).length;

            return (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">{lead.name}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{lead.email}</div>
                    <div className="text-gray-500">{lead.phone}</div>
                  </div>
                </TableCell>
                <TableCell>{unit?.unitNumber || 'N/A'}</TableCell>
                <TableCell>
                  <div className="text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Move-in:</span>{' '}
                      {lead.moveInDate
                        ? new Date(lead.moveInDate).toLocaleDateString()
                        : '-'}
                    </div>
                    <div>
                      <span className="font-medium">Occupants:</span>{' '}
                      {lead.occupantsCount || '-'}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={lead.status}
                    onValueChange={(value: Lead['status']) =>
                      handleStatusChange(lead.id, value)
                    }
                    disabled={
                      lead.status === 'converted' || lead.status === 'dropped'
                    }
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="dropped">Dropped</SelectItem>
                    </SelectContent>
                  </Select>
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
{lead.status !== 'converted' &&
                      lead.status !== 'dropped' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedLead(lead);
                            setIsFollowUpDialogOpen(true);
                          }}
                          title="Add Follow-up"
                        >
                          <Calendar className="size-4" />
                          {leadFollowUpsCount > 0 && (
                            <span className="ml-1 text-xs">
                              ({leadFollowUpsCount})
                            </span>
                          )}
                        </Button>
                      )}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedLead(lead);
                        setIsHistoryDialogOpen(true);
                      }}
                      title="View Stage History"
                    >
                      <Clock className="size-4" />
                    </Button>
                    {lead.status !== 'converted' &&
                      lead.status !== 'dropped' && (
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
            Lead Conversion Pipeline
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Track leads through stages: Interested → Converted
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('pipeline')}
            >
              <LayoutGrid className="size-4 mr-2" />
              Pipeline
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="size-4 mr-2" />
              List
            </Button>
          </div>
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

      {/* Pipeline View */}
      {viewMode === 'pipeline' ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="funnel">
                <TabsList>
                  <TabsTrigger value="funnel">Funnel</TabsTrigger>
                  <TabsTrigger value="visits">
                    Upcoming Visits (
                    {
                      visits.filter(
                        (v) =>
                          v.status === 'confirmed' || v.status === 'pending'
                      ).length
                    }
                    )
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="funnel">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    {pipelineStages.map((stage, index) => {
                      const stageLeads = leads.filter(
                        (l) => l.status === stage.status
                      );
                      return (
                        <div key={stage.status}>
                          <div
                            className={`border-2 ${stage.color} rounded-lg p-4 min-h-[400px]`}
                          >
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-semibold text-sm">
                                {stage.label}
                              </h3>
                              <Badge variant="secondary">
                                {stageLeads.length}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              {stageLeads.map((lead) => (
                                <LeadCard key={lead.id} lead={lead} />
                              ))}
                              {stageLeads.length === 0 && (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                  No leads in this stage
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
                <TabsContent value="visits">
                  <VisitTable
                    visits={visits.filter((v) =>
                      ['pending', 'confirmed'].includes(v.status)
                    )}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Dropped Leads */}
          {droppedLeads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Dropped Leads ({droppedLeads.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {droppedLeads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        /* List View */
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
      )}

      {/* Follow-up Dialog */}
      <Dialog
        open={isFollowUpDialogOpen}
        onOpenChange={setIsFollowUpDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up for {selectedLead?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddFollowUp} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="followup-date">Date</Label>
              <Input
                id="followup-date"
                type="date"
                value={followUpData.date}
                onChange={(e) =>
                  setFollowUpData({ ...followUpData, date: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup-notes">Notes</Label>
              <Textarea
                id="followup-notes"
                placeholder="What was discussed..."
                value={followUpData.notes}
                onChange={(e) =>
                  setFollowUpData({ ...followUpData, notes: e.target.value })
                }
                rows={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup-next">Next Action</Label>
              <Input
                id="followup-next"
                placeholder="e.g., Schedule viewing, Send documents"
                value={followUpData.nextAction}
                onChange={(e) =>
                  setFollowUpData({
                    ...followUpData,
                    nextAction: e.target.value,
                  })
                }
                required
              />
            </div>

            {/* Show existing follow-ups */}
            {selectedLead &&
              leadFollowUps.filter((f) => f.leadId === selectedLead.id).length >
                0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">
                    Previous Follow-ups:
                  </p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {leadFollowUps
                      .filter((f) => f.leadId === selectedLead.id)
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() -
                          new Date(a.date).getTime()
                      )
                      .map((followUp) => (
                        <div
                          key={followUp.id}
                          className="text-sm p-2 bg-gray-50 rounded"
                        >
                          <p className="font-medium">{followUp.date}</p>
                          <p className="text-gray-600">{followUp.notes}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Next: {followUp.nextAction}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsFollowUpDialogOpen(false);
                  setFollowUpData({
                    date: '',
                    notes: '',
                    nextAction: '',
                  });
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Add Follow-up</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stage History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stage History for {selectedLead?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedLead &&
              leadStageHistory
                .filter((h) => h.leadId === selectedLead.id)
                .sort(
                  (a, b) =>
                    new Date(b.changedAt).getTime() -
                    new Date(a.changedAt).getTime()
                )
                .map((history, index, arr) => (
                  <div key={history.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`size-8 rounded-full flex items-center justify-center ${
                          getStatusBadge(history.toStatus).color
                        }`}
                      >
                        {index === 0 ? (
                          <Clock className="size-4" />
                        ) : (
                          <CheckCircle className="size-4" />
                        )}
                      </div>
                      {index < arr.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-200 my-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="font-medium text-sm">
                            {history.fromStatus ? (
                              <>
                                {getStatusLabel(history.fromStatus)} →{' '}
                                {getStatusLabel(history.toStatus)}
                              </>
                            ) : (
                              <>
                                Lead created as{' '}
                                {getStatusLabel(history.toStatus)}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(history.changedAt).toLocaleString()}
                          </p>
                        </div>
                        {history.durationInPreviousStage !== undefined &&
                          history.durationInPreviousStage > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {history.durationInPreviousStage} days
                            </Badge>
                          )}
                      </div>
                      {history.notes && (
                        <p className="text-sm text-gray-600 mt-1">
                          {history.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            {selectedLead &&
              leadStageHistory.filter((h) => h.leadId === selectedLead.id)
                .length === 0 && (
                <p className="text-gray-500 text-center py-8">
                  No stage history available
                </p>
              )}
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
                  Leave empty for 1 year default
                </p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> The lead will be promoted to a Tenant.
                They can use their existing credentials to log in. After
                conversion, a lease will be created automatically with the dates
                selected above.
              </p>
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
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                    Pre-selected
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
