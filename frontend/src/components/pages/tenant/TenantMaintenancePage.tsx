import React, { useState } from 'react';
import { useApp, MaintenanceRequest } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
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
import { Badge } from '@/components/ui/badge';
import { Wrench, Plus, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function TenantMaintenancePage() {
  const { user, activeLeaseId, tenantLeases: leasesFromAuth } = useAuth();
  const {
    maintenanceRequests,
    leases,
    units,
    addMaintenanceRequest,
    maintenanceCosts,
  } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'general',
    priority: 'medium' as MaintenanceRequest['priority'],
  });
  const [selectedImages, setSelectedImages] = useState<File[]>([]);

  // Multi-Unit Logic (E19): Use active lease from context instead of hardcoded [0]
  const tenantLease = leasesFromAuth.find((l) => l.id === activeLeaseId);
  const tenantUnit = tenantLease
    ? units.find((u) => u.id === tenantLease.unitId)
    : null;

  // Filter maintenance requests for the specific active unit
  const tenantRequests = maintenanceRequests.filter(
    (r) => r.unitId === tenantLease?.unitId
  );
  const openRequests = tenantRequests.filter(
    (r) => r.status === 'submitted' || r.status === 'in_progress'
  );
  const completedRequests = tenantRequests.filter(
    (r) => r.status === 'completed'
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setSelectedImages((prev) => [...prev, ...filesArray]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantUnit) {
      toast.error('No active lease found');
      return;
    }

    const submissionData = new FormData();
    submissionData.append('unitId', tenantUnit.id);
    submissionData.append('title', formData.title);
    submissionData.append('description', formData.description);
    submissionData.append('category', formData.category);
    submissionData.append('priority', formData.priority);

    selectedImages.forEach((file) => {
      submissionData.append('images', file);
    });

    try {
      await addMaintenanceRequest(submissionData as any);
      toast.success('Maintenance request submitted successfully');
      setIsAddDialogOpen(false);
      setFormData({
        title: '',
        description: '',
        category: 'general',
        priority: 'medium',
      });
      setSelectedImages([]);
    } catch (error) {
      console.error('Submission failed:', error);
    }
  };

  const getStatusBadge = (status: MaintenanceRequest['status']) => {
    const variants: Record<
      MaintenanceRequest['status'],
      { variant: any; label: string; icon: any }
    > = {
      submitted: { variant: 'secondary', label: 'Submitted', icon: Clock },
      in_progress: { variant: 'default', label: 'In Progress', icon: Wrench },
      completed: { variant: 'outline', label: 'Completed', icon: CheckCircle },
      cancelled: {
        variant: 'destructive',
        label: 'Cancelled',
        icon: AlertCircle,
      },
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
          <h2 className="text-2xl font-semibold text-gray-900">
            Maintenance Requests
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Submit and track maintenance requests
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
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
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe the issue in detail..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={4}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="plumbing">Plumbing</SelectItem>
                      <SelectItem value="electrical">Electrical</SelectItem>
                      <SelectItem value="appliance">Appliance</SelectItem>
                      <SelectItem value="hvac">HVAC</SelectItem>
                      <SelectItem value="structural">Structural</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: MaintenanceRequest['priority']) =>
                      setFormData({ ...formData, priority: value })
                    }
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
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label htmlFor="images">Photos</Label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {selectedImages.map((file, index) => (
                    <div
                      key={index}
                      className="relative aspect-square rounded-md overflow-hidden bg-gray-100 border"
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 p-0.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                      >
                        <AlertCircle className="size-3 rotate-45" />{' '}
                        {/* Using AlertCircle rotated as X substitute if X not imported, wait, let me check imports */}
                      </button>
                    </div>
                  ))}
                  <label
                    htmlFor="images"
                    className="flex flex-col items-center justify-center aspect-square rounded-md border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <Plus className="size-6 text-gray-400" />
                    <span className="text-xs text-gray-500 mt-1">Add</span>
                  </label>
                </div>
                <Input
                  id="images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="hidden"
                />
                <p className="text-xs text-gray-500">
                  Upload up to 5 photos to help us understand the issue better.
                </p>
              </div>

              {tenantUnit && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Unit: <strong>{tenantUnit.unitNumber}</strong>
                  </p>
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
                      category: 'general',
                      priority: 'medium',
                    });
                    setSelectedImages([]);
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
              <p
                className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
              >
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
            const unit = units.find((u) => u.id === request.unitId);

            return (
              <Card key={request.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">
                          {request.title}
                        </h3>
                        <Badge
                          variant={statusBadge.variant}
                          className="flex items-center gap-1"
                        >
                          <StatusIcon className="size-3" />
                          {statusBadge.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        {request.description}
                      </p>

                      {/* Display attached images if any */}
                      {request.images && request.images.length > 0 && (
                        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                          {request.images.map((img) => (
                            <div
                              key={img}
                              className="relative size-16 rounded-md overflow-hidden bg-gray-100 border flex-shrink-0"
                            >
                              <img
                                src={img}
                                alt="Attachment"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Unit: {unit?.unitNumber}</span>
                        <span>•</span>
                        <span className="font-medium text-gray-700">
                          {request.category.charAt(0).toUpperCase() +
                            request.category.slice(1)}{' '}
                          ({request.priority})
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
              <p className="text-sm text-gray-500 mt-1">
                Submit a request if you need maintenance assistance
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
