import React, { useState } from 'react';
import {
  useApp,
  MaintenanceRequest,
  MaintenanceCost,
} from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Wrench,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Edit,
  Eye,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

export function OwnerMaintenancePage() {
  const {
    maintenanceRequests,
    maintenanceCosts,
    tenants,
    units,
    properties,
    updateMaintenanceRequest,
    addMaintenanceCost,
    deleteMaintenanceCost,
    createMaintenanceInvoice,
  } = useApp();

  const [selectedRequest, setSelectedRequest] =
    useState<MaintenanceRequest | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isCostDialogOpen, setIsCostDialogOpen] = useState(false);
  const [isBillDialogOpen, setIsBillDialogOpen] = useState(false);
  const [costFormData, setCostFormData] = useState({
    amount: '',
    description: '',
  });
  const [billFormData, setBillFormData] = useState({
    amount: '',
    description: '',
    dueDate: '',
  });

  // Deletion States
  const [isDeleteCostDialogOpen, setIsDeleteCostDialogOpen] = useState(false);
  const [costToDelete, setCostToDelete] = useState<MaintenanceCost | null>(
    null
  );

  const submittedRequests = maintenanceRequests.filter(
    (r) => r.status === 'submitted'
  );
  const inProgressRequests = maintenanceRequests.filter(
    (r) => r.status === 'in_progress'
  );
  const completedRequests = maintenanceRequests.filter(
    (r) => r.status === 'completed'
  );

  const handleUpdateStatus = (
    request: MaintenanceRequest,
    newStatus: MaintenanceRequest['status']
  ) => {
    updateMaintenanceRequest(request.id, {
      status: newStatus,
      completedDate:
        newStatus === 'completed'
          ? new Date().toISOString().split('T')[0]
          : undefined,
    });
    toast.success('Request status updated');
    setIsStatusDialogOpen(false);
    setSelectedRequest(null);
  };

  const handleAddCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    addMaintenanceCost({
      requestId: selectedRequest.id,
      amount: parseFloat(costFormData.amount),
      description: costFormData.description,
    });

    toast.success('Maintenance cost recorded');
    setIsCostDialogOpen(false);
    setSelectedRequest(null);
    setCostFormData({
      amount: '',
      description: '',
    });
  };

  const handleBillTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    try {
      await createMaintenanceInvoice(
        selectedRequest.id,
        parseFloat(billFormData.amount),
        billFormData.description,
        billFormData.dueDate
      );
      setIsBillDialogOpen(false);
      setSelectedRequest(null);
      setBillFormData({ amount: '', description: '', dueDate: '' });
    } catch (error) {
      // Error handling done in context
    }
  };

  const getRequestCosts = (requestId: string) => {
    return maintenanceCosts.filter((c) => c.requestId === requestId);
  };

  const getTotalCost = (requestId: string) => {
    const costs = getRequestCosts(requestId);
    return costs.reduce((sum, c) => sum + c.amount, 0);
  };

  const getStatusBadge = (status: MaintenanceRequest['status']) => {
    const variants: Record<
      MaintenanceRequest['status'],
      { variant: any; label: string }
    > = {
      submitted: { variant: 'secondary', label: 'Submitted' },
      in_progress: { variant: 'default', label: 'In Progress' },
      completed: { variant: 'outline', label: 'Completed' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    return variants[status];
  };

  const getPriorityColor = (priority: MaintenanceRequest['priority']) => {
    const colors: Record<MaintenanceRequest['priority'], string> = {
      low: 'text-gray-600',
      medium: 'text-blue-600',
      high: 'text-orange-600',
      urgent: 'text-red-600',
    };
    return colors[priority];
  };

  const totalMaintenanceCost = maintenanceCosts.reduce(
    (sum, c) => sum + c.amount,
    0
  );

  const stats = [
    {
      label: 'New Requests',
      value: submittedRequests.length,
      icon: AlertCircle,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'In Progress',
      value: inProgressRequests.length,
      icon: Wrench,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Completed',
      value: completedRequests.length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Total Cost',
      value: `LKR ${totalMaintenanceCost.toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-purple-50 text-purple-700',
    },
  ];

  const RequestTable = ({ requests }: { requests: MaintenanceRequest[] }) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Submitted</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Tenant</TableHead>
            <TableHead>Property/Unit</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cost</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => {
            const tenant = tenants.find((t) => t.id === request.tenantId);
            const unit = units.find((u) => u.id === request.unitId);
            const property = unit
              ? properties.find((p) => p.id === unit.propertyId)
              : null;
            const costs = getRequestCosts(request.id);
            const totalCost = getTotalCost(request.id);
            const statusBadge = getStatusBadge(request.status);

            return (
              <TableRow key={request.id}>
                <TableCell>{request.submittedDate}</TableCell>
                <TableCell className="font-medium max-w-xs">
                  <div>{request.title}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {request.description}
                  </div>
                </TableCell>
                <TableCell>{tenant?.name}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{property?.name}</div>
                    <div className="text-gray-500">Unit {unit?.unitNumber}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`font-medium ${getPriorityColor(request.priority)}`}
                  >
                    {request.priority.charAt(0).toUpperCase() +
                      request.priority.slice(1)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadge.variant}>
                    {statusBadge.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {costs.length > 0 ? (
                    <div>
                      <span className="font-semibold">LKR {totalCost}</span>
                      <span className="text-xs text-gray-500 ml-1">
                        ({costs.length})
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedRequest(request);
                        // Ensure other dialogs are closed to trigger the 'details' view
                        setIsStatusDialogOpen(false);
                        setIsCostDialogOpen(false);
                      }}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedRequest(request);
                        setIsStatusDialogOpen(true);
                        setIsCostDialogOpen(false);
                      }}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelectedRequest(request);
                        setIsCostDialogOpen(true);
                      }}
                    >
                      <DollarSign className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {requests.length === 0 && (
        <div className="py-12 text-center">
          <Wrench className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No requests found</p>
        </div>
      )}
    </div>
  );

  const confirmDeleteCost = () => {
    if (!costToDelete) return;
    deleteMaintenanceCost(costToDelete.id);
    toast.success('Maintenance cost deleted');
    setIsDeleteCostDialogOpen(false);
    setCostToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">
          Maintenance Management
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Track and manage maintenance requests
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p
                      className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <div className={`${stat.color.split(' ')[0]} p-2 rounded-lg`}>
                    <Icon className={`size-4 ${stat.color.split(' ')[1]}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Requests Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="submitted" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="submitted">
                  New ({submittedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="in_progress">
                  In Progress ({inProgressRequests.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({completedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All ({maintenanceRequests.length})
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="submitted" className="m-0">
              <RequestTable requests={submittedRequests} />
            </TabsContent>
            <TabsContent value="in_progress" className="m-0">
              <RequestTable requests={inProgressRequests} />
            </TabsContent>
            <TabsContent value="completed" className="m-0">
              <RequestTable requests={completedRequests} />
            </TabsContent>
            <TabsContent value="all" className="m-0">
              <RequestTable requests={maintenanceRequests} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Request Status</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedRequest.title}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedRequest.description}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Current Status</Label>
                <Badge variant={getStatusBadge(selectedRequest.status).variant}>
                  {getStatusBadge(selectedRequest.status).label}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Update Status To</Label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant={
                      selectedRequest.status === 'in_progress'
                        ? 'secondary'
                        : 'outline'
                    }
                    onClick={() =>
                      handleUpdateStatus(selectedRequest, 'in_progress')
                    }
                    disabled={selectedRequest.status === 'in_progress'}
                  >
                    <Wrench className="size-4 mr-2" />
                    Mark as In Progress
                  </Button>
                  <Button
                    variant={
                      selectedRequest.status === 'completed'
                        ? 'secondary'
                        : 'outline'
                    }
                    onClick={() =>
                      handleUpdateStatus(selectedRequest, 'completed')
                    }
                    disabled={selectedRequest.status === 'completed'}
                  >
                    <CheckCircle className="size-4 mr-2" />
                    Mark as Completed
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      handleUpdateStatus(selectedRequest, 'cancelled')
                    }
                    disabled={selectedRequest.status === 'cancelled'}
                  >
                    Cancel Request
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Cost Dialog */}
      <Dialog open={isCostDialogOpen} onOpenChange={setIsCostDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Maintenance Cost</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <form onSubmit={handleAddCost} className="space-y-4 mt-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedRequest.title}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedRequest.description}
                </p>
              </div>

              {/* Show existing costs */}
              {getRequestCosts(selectedRequest.id).length > 0 && (
                <div className="border rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Existing Costs:</p>
                  <div className="space-y-2">
                    {getRequestCosts(selectedRequest.id).map((cost) => (
                      <div
                        key={cost.id}
                        className="flex justify-between text-sm group items-center"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">
                            {cost.description}
                          </span>
                          <span className="text-gray-400 text-xs">
                            ({cost.recordedDate})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">
                            LKR {cost.amount}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCostToDelete(cost);
                              setIsDeleteCostDialogOpen(true);
                            }}
                            className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete Cost"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>LKR {getTotalCost(selectedRequest.id)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="cost-amount">Amount (LKR)</Label>
                <Input
                  id="cost-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 150.00"
                  value={costFormData.amount}
                  onChange={(e) =>
                    setCostFormData({ ...costFormData, amount: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost-description">Description</Label>
                <Input
                  id="cost-description"
                  placeholder="e.g., Parts and labor"
                  value={costFormData.description}
                  onChange={(e) =>
                    setCostFormData({
                      ...costFormData,
                      description: e.target.value,
                    })
                  }
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCostDialogOpen(false);
                    setSelectedRequest(null);
                    setCostFormData({
                      amount: '',
                      description: '',
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Record Cost</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {/* View Details Dialog */}
      <Dialog
        open={!!selectedRequest && !isStatusDialogOpen && !isCostDialogOpen}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6 mt-4">
              <div className="flex gap-4 items-start">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">
                    {selectedRequest.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant={getStatusBadge(selectedRequest.status).variant}
                    >
                      {getStatusBadge(selectedRequest.status).label}
                    </Badge>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        selectedRequest.priority === 'urgent'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : selectedRequest.priority === 'high'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : selectedRequest.priority === 'medium'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {selectedRequest.priority.charAt(0).toUpperCase() +
                        selectedRequest.priority.slice(1)}{' '}
                      Priority
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Submitted: {selectedRequest.submittedDate}</p>
                  {selectedRequest.completedDate && (
                    <p>Completed: {selectedRequest.completedDate}</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    Description
                  </h4>
                  <p className="text-sm text-gray-600 mt-1 p-3 bg-gray-50 rounded-md">
                    {selectedRequest.description}
                  </p>
                </div>

                {/* Images Section */}
                {selectedRequest.images &&
                  selectedRequest.images.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        Attached Images ({selectedRequest.images.length})
                      </h4>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {selectedRequest.images.map((img, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-square rounded-md overflow-hidden bg-gray-100 border"
                          >
                            <img
                              src={img}
                              alt={`Attachment ${idx + 1}`}
                              className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(img, '_blank')}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-1">Property Info</h4>
                  {(() => {
                    const unit = units.find(
                      (u) => u.id === selectedRequest.unitId
                    );
                    const property = unit
                      ? properties.find((p) => p.id === unit.propertyId)
                      : null;
                    return (
                      <div className="text-sm text-gray-600">
                        <p className="font-medium text-gray-900">
                          {property?.name}
                        </p>
                        <p>
                          {property?.propertyNo} {property?.street},{' '}
                          {property?.city} {property?.district}
                        </p>
                        <p className="mt-1">Unit: {unit?.unitNumber}</p>
                      </div>
                    );
                  })()}
                </div>
                <div className="border rounded-lg p-3">
                  <h4 className="text-sm font-medium mb-1">Tenant Info</h4>
                  {(() => {
                    const tenant = tenants.find(
                      (t) => t.id === selectedRequest.tenantId
                    );
                    return (
                      <div className="text-sm text-gray-600">
                        <p className="font-medium text-gray-900">
                          {tenant?.name}
                        </p>
                        <p>{tenant?.email}</p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Costs Section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">Maintenance Costs</h4>
                  <span className="font-semibold">
                    LKR {getTotalCost(selectedRequest.id)}
                  </span>
                </div>
                {getRequestCosts(selectedRequest.id).length > 0 ? (
                  <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
                    {getRequestCosts(selectedRequest.id).map((cost) => (
                      <div
                        key={cost.id}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-gray-600">
                          {cost.description}
                        </span>
                        <span className="font-medium">LKR {cost.amount}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No costs recorded yet.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedRequest(null)}
                >
                  Close
                </Button>
                {selectedRequest.status !== 'completed' &&
                  selectedRequest.status !== 'cancelled' && (
                    <Button
                      onClick={() => {
                        // Convert view mode to edit mode by ensuring other flags are clear or setting a specific edit flag?
                        // Currently setSelectedRequest(null) closes everything.
                        // To switch to update status dialog, we keep selectedRequest but set isStatusDialogOpen to true.
                        // But the main dialog 'open' condition is `!!selectedRequest && !isStatusDialogOpen && !isCostDialogOpen`.
                        // So setting isStatusDialogOpen to true will hide this one and show the status one.
                        setIsStatusDialogOpen(true);
                      }}
                    >
                      Update Status
                    </Button>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Cost Confirmation Dialog */}
      <AlertDialog
        open={isDeleteCostDialogOpen}
        onOpenChange={setIsDeleteCostDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete maintenance cost?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this maintenance cost? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteCost}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
