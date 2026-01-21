import React, { useState } from 'react';
import { useApp, MaintenanceRequest } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Wrench, Plus, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function TenantMaintenancePage() {
  const { user } = useAuth();
  const { maintenanceRequests, leases, units, addMaintenanceRequest } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as MaintenanceRequest['priority'],
  });

  // In real app, filter by actual tenant ID
  const tenantLeases = leases.filter(l => l.status === 'active');
  const tenantUnit = tenantLeases[0] ? units.find(u => u.id === tenantLeases[0].unitId) : null;
  
  // Filter maintenance requests for this tenant
  const tenantRequests = maintenanceRequests;
  const openRequests = tenantRequests.filter(r => r.status === 'submitted' || r.status === 'in_progress');
  const completedRequests = tenantRequests.filter(r => r.status === 'completed');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenantUnit) {
      toast.error('No active lease found');
      return;
    }

    addMaintenanceRequest({
      tenantId: 'tenant-1', // In real app, use actual tenant ID
      unitId: tenantUnit.id,
      title: formData.title,
      description: formData.description,
      priority: formData.priority,
      status: 'submitted',
    });

    toast.success('Maintenance request submitted successfully');
    setIsAddDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
    });
  };

  const getStatusBadge = (status: MaintenanceRequest['status']) => {
    const variants: Record<MaintenanceRequest['status'], { variant: any, label: string, icon: any }> = {
      submitted: { variant: 'secondary', label: 'Submitted', icon: Clock },
      in_progress: { variant: 'default', label: 'In Progress', icon: Wrench },
      completed: { variant: 'outline', label: 'Completed', icon: CheckCircle },
      cancelled: { variant: 'destructive', label: 'Cancelled', icon: AlertCircle },
    };
    return variants[status];
  };

  const getPriorityBadge = (priority: MaintenanceRequest['priority']) => {
    const colors: Record<MaintenanceRequest['priority'], string> = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800',
    };
    return colors[priority];
  };

  const stats = [
    {
      label: 'Total Requests',
      value: tenantRequests.length,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Open',
      value: openRequests.length,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Completed',
      value: completedRequests.length,
      color: 'bg-green-50 text-green-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Maintenance Requests</h2>
          <p className="text-sm text-gray-500 mt-1">Submit and track maintenance requests</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Maintenance Request</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Issue Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Leaking faucet, Broken door handle"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe the issue in detail..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: MaintenanceRequest['priority']) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tenantUnit && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Unit: <strong>{tenantUnit.unitNumber}</strong></p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    setFormData({
                      title: '',
                      description: '',
                      priority: 'medium',
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Submit Request</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-600">{stat.label}</p>
              <p className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Maintenance Requests */}
      <div className="space-y-4">
        {tenantRequests.length > 0 ? (
          tenantRequests.map((request) => {
            const statusBadge = getStatusBadge(request.status);
            const StatusIcon = statusBadge.icon;
            const unit = units.find(u => u.id === request.unitId);

            return (
              <Card key={request.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{request.title}</h3>
                        <Badge
                          variant={statusBadge.variant}
                          className="flex items-center gap-1"
                        >
                          <StatusIcon className="size-3" />
                          {statusBadge.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{request.description}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Unit: {unit?.unitNumber}</span>
                        <span>•</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityBadge(request.priority)}`}>
                          {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)} Priority
                        </span>
                        <span>•</span>
                        <span>Submitted: {request.submittedDate}</span>
                        {request.completedDate && (
                          <>
                            <span>•</span>
                            <span>Completed: {request.completedDate}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Wrench className="size-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No maintenance requests yet</p>
              <p className="text-sm text-gray-500 mt-1">Submit a request if you need maintenance assistance</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
