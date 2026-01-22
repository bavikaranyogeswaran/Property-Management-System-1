import React, { useState } from 'react';
import { useApp, Lead, LeadStageHistory } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, Calendar, CheckCircle, ArrowRight, Clock, TrendingUp, LayoutGrid, List, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function LeadsPage() {
  const {
    leads,
    units,
    leadFollowUps,
    leadStageHistory,
    addLead,
    updateLead,
    addLeadFollowUp,
    convertLeadToTenant,
  } = useApp();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isFollowUpDialogOpen, setIsFollowUpDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');
  const [tenantPassword, setTenantPassword] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    interestedUnit: '',
    notes: '',
  });

  const [followUpData, setFollowUpData] = useState({
    date: '',
    notes: '',
    nextAction: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      await addLead({
        ...formData,
        status: 'interested',
      });
      toast.success('Lead added successfully');
      setIsAddDialogOpen(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        interestedUnit: '',
        notes: '',
      });
    } catch (error: any) {
      // If the error object has a response with an error message, show that
      // otherwise show generic error
      toast.error(error.response?.data?.error || 'Failed to add lead');
    }
  };

  const handleStatusChange = async (leadId: string, status: Lead['status']) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Validate transition
    if (status === 'converted' || status === 'dropped') {
      if (lead.status === 'converted' || lead.status === 'dropped') {
        toast.error('Cannot change status of converted or dropped leads');
        return;
      }
    }

    try {
      await updateLead(leadId, { status, lastContactedAt: new Date().toISOString().split('T')[0] });
      toast.success(`Lead moved to ${getStatusLabel(status)}`);
    } catch (error) {
      toast.error('Failed to update status');
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
    if (!tenantPassword) {
      toast.error('Please enter a password for the tenant account');
      return;
    }

    if (tenantPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    try {
      const tenantId = await convertLeadToTenant(selectedLead.id, tenantPassword);
      toast.success('Lead converted to tenant successfully');
      setIsConvertDialogOpen(false);
      setSelectedLead(null);
      setTenantPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to convert lead');
    }
  };

  const getStatusLabel = (status: Lead['status']) => {
    const labels: Record<Lead['status'], string> = {
      interested: 'Interested',
      negotiation: 'Negotiation',
      converted: 'Converted',
      dropped: 'Dropped',
    };
    return labels[status];
  };

  const getStatusBadge = (status: Lead['status']) => {
    const variants: Record<Lead['status'], { variant: any, label: string, color: string }> = {
      interested: { variant: 'default', label: 'Interested', color: 'bg-blue-100 text-blue-700' },
      negotiation: { variant: 'secondary', label: 'Negotiation', color: 'bg-orange-100 text-orange-700' },
      converted: { variant: 'default', label: 'Converted', color: 'bg-green-100 text-green-700' },
      dropped: { variant: 'destructive', label: 'Dropped', color: 'bg-gray-100 text-gray-700' },
    };
    return variants[status];
  };

  const stats = [
    {
      label: 'Total Leads',
      value: leads.length,
      icon: UserPlus,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Interested',
      value: leads.filter(l => l.status === 'interested').length,
      icon: TrendingUp,
      color: 'bg-purple-50 text-purple-700',
    },
    {
      label: 'In Negotiation',
      value: leads.filter(l => l.status === 'negotiation').length,
      icon: Clock,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Converted',
      value: leads.filter(l => l.status === 'converted').length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
  ];

  // Calculate conversion rate
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.status === 'converted').length;
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  const activeLeads = leads.filter(l => !['converted', 'dropped'].includes(l.status));
  const convertedLeadsList = leads.filter(l => l.status === 'converted');
  const droppedLeads = leads.filter(l => l.status === 'dropped');

  // Pipeline view data
  const pipelineStages: Array<{ status: Lead['status'], label: string, color: string }> = [
    { status: 'interested', label: 'Interested', color: 'border-blue-200 bg-blue-50' },
    { status: 'negotiation', label: 'Negotiation', color: 'border-orange-200 bg-orange-50' },
    { status: 'converted', label: 'Converted', color: 'border-green-200 bg-green-50' },
  ];

  const LeadCard = ({ lead }: { lead: Lead }) => {
    const unit = units.find(u => u.id === lead.interestedUnit);
    const leadFollowUpsCount = leadFollowUps.filter(f => f.leadId === lead.id).length;
    const statusBadge = getStatusBadge(lead.status);
    const history = leadStageHistory.filter(h => h.leadId === lead.id);

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
            <span className="font-medium">Unit:</span> {unit?.unitNumber || 'N/A'}
          </p>
          <p className="text-xs text-gray-600">
            <span className="font-medium">Created:</span> {lead.createdAt}
          </p>
          {lead.lastContactedAt && (
            <p className="text-xs text-gray-600">
              <span className="font-medium">Last Contact:</span> {lead.lastContactedAt}
            </p>
          )}
        </div>

        <div className="flex gap-1 items-center">
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

          {lead.status !== 'converted' && lead.status !== 'dropped' && (
            <>
              {lead.status === 'interested' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 inline-flex items-center justify-center flex-shrink-0"
                  onClick={() => handleStatusChange(lead.id, 'negotiation')}
                  title="Move to Negotiation"
                >
                  <ArrowRight className="size-3.5" />
                </Button>
              )}
              {lead.status === 'negotiation' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-green-600 inline-flex items-center justify-center flex-shrink-0"
                  onClick={() => {
                    setSelectedLead(lead);
                    setIsConvertDialogOpen(true);
                  }}
                  title="Convert to Tenant"
                >
                  <CheckCircle className="size-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 inline-flex items-center justify-center flex-shrink-0"
                onClick={() => handleStatusChange(lead.id, 'dropped')}
                title="Drop Lead"
              >
                <XCircle className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const LeadTable = ({ leads: leadsData }: { leads: Lead[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Interested Unit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Contact</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leadsData.map((lead) => {
            const unit = units.find(u => u.id === lead.interestedUnit);
            const statusBadge = getStatusBadge(lead.status);
            const leadFollowUpsCount = leadFollowUps.filter(f => f.leadId === lead.id).length;

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
                  <Select
                    value={lead.status}
                    onValueChange={(value: Lead['status']) => handleStatusChange(lead.id, value)}
                    disabled={lead.status === 'converted' || lead.status === 'dropped'}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="negotiation">Negotiation</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="dropped">Dropped</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">
                    {lead.lastContactedAt || '-'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
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
                        <span className="ml-1 text-xs">({leadFollowUpsCount})</span>
                      )}
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
                    {lead.status !== 'converted' && lead.status !== 'dropped' && (
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
          <h2 className="text-2xl font-semibold text-gray-900">Lead Conversion Pipeline</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track leads through stages: Interested → Negotiation → Converted
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
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="size-4 mr-2" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="Lead's full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+1-555-0000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interestedUnit">Interested Unit</Label>
                  <Select
                    value={formData.interestedUnit}
                    onValueChange={(value) => setFormData({ ...formData, interestedUnit: value })}
                  >
                    <SelectTrigger id="interestedUnit">
                      <SelectValue placeholder="Select a unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units.filter(u => u.status === 'available').map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.unitNumber} - {unit.type} (LKR {unit.monthlyRent}/mo)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional information..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddDialogOpen(false);
                      setFormData({
                        name: '',
                        email: '',
                        phone: '',
                        interestedUnit: '',
                        notes: '',
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Add Lead</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
                    <p className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}>
                      {stat.value}
                    </p>
                  </div>
                  <Icon className={`size-8 ${stat.color.split(' ')[1]} opacity-20`} />
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
          {/* Active Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {pipelineStages.map((stage, index) => {
                  const stageLeads = leads.filter(l => l.status === stage.status);
                  return (
                    <div key={stage.status}>
                      <div className={`border-2 ${stage.color} rounded-lg p-4 min-h-[400px]`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-sm">{stage.label}</h3>
                          <Badge variant="secondary">{stageLeads.length}</Badge>
                        </div>
                        <div className="space-y-2">
                          {stageLeads.map(lead => (
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
                  {droppedLeads.map(lead => (
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
            <Tabs defaultValue="active" className="w-full">
              <div className="border-b px-6 pt-6">
                <TabsList>
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
      <Dialog open={isFollowUpDialogOpen} onOpenChange={setIsFollowUpDialogOpen}>
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
                onChange={(e) => setFollowUpData({ ...followUpData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup-notes">Notes</Label>
              <Textarea
                id="followup-notes"
                placeholder="What was discussed..."
                value={followUpData.notes}
                onChange={(e) => setFollowUpData({ ...followUpData, notes: e.target.value })}
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
                onChange={(e) => setFollowUpData({ ...followUpData, nextAction: e.target.value })}
                required
              />
            </div>

            {/* Show existing follow-ups */}
            {selectedLead && leadFollowUps.filter(f => f.leadId === selectedLead.id).length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Previous Follow-ups:</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {leadFollowUps
                    .filter(f => f.leadId === selectedLead.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((followUp) => (
                      <div key={followUp.id} className="text-sm p-2 bg-gray-50 rounded">
                        <p className="font-medium">{followUp.date}</p>
                        <p className="text-gray-600">{followUp.notes}</p>
                        <p className="text-xs text-gray-500 mt-1">Next: {followUp.nextAction}</p>
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
            {selectedLead && leadStageHistory
              .filter(h => h.leadId === selectedLead.id)
              .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
              .map((history, index, arr) => (
                <div key={history.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`size-8 rounded-full flex items-center justify-center ${getStatusBadge(history.toStatus).color
                      }`}>
                      {index === 0 ? <Clock className="size-4" /> : <CheckCircle className="size-4" />}
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
                              {getStatusLabel(history.fromStatus)} → {getStatusLabel(history.toStatus)}
                            </>
                          ) : (
                            <>Lead created as {getStatusLabel(history.toStatus)}</>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(history.changedAt).toLocaleString()}
                        </p>
                      </div>
                      {history.durationInPreviousStage !== undefined && history.durationInPreviousStage > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {history.durationInPreviousStage} days
                        </Badge>
                      )}
                    </div>
                    {history.notes && (
                      <p className="text-sm text-gray-600 mt-1">{history.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            {selectedLead && leadStageHistory.filter(h => h.leadId === selectedLead.id).length === 0 && (
              <p className="text-gray-500 text-center py-8">No stage history available</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Tenant Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert Lead to Tenant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to convert <strong>{selectedLead?.name}</strong> to a tenant?
            </p>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> After conversion, you'll need to create a lease for this tenant in the Leases section.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-password">Tenant Password</Label>
              <Input
                id="tenant-password"
                type="password"
                placeholder="Enter password for tenant login"
                value={tenantPassword}
                onChange={(e) => setTenantPassword(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                This password will be emailed to the tenant along with their login credentials.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsConvertDialogOpen(false);
                  setSelectedLead(null);
                  setTenantPassword('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleConvert}>Convert to Tenant</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
