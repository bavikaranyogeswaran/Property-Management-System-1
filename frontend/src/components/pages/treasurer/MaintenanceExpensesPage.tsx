import React, { useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import {
  Plus,
  DollarSign,
  Calendar,
  FileText,
  Wrench,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

export function MaintenanceExpensesPage() {
  const {
    maintenanceRequests,
    maintenanceCosts,
    addMaintenanceCost,
    deleteMaintenanceCost,
    units,
    properties,
    tenants,
  } = useApp();
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [billToTenant, setBillToTenant] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Deletion States
  const [isDeleteExpenseDialogOpen, setIsDeleteExpenseDialogOpen] =
    useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any | null>(null);

  // Filter for completed or relevant requests
  // Treasurers might want to see In Progress ones too to anticipate costs, but usually costs are recorded upon completion or invoice receipt.
  // Let's show all for now, but focus on completed.
  const requests = maintenanceRequests.sort(
    (a, b) =>
      new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime()
  );

  const handleAddCost = () => {
    if (!selectedRequest || !amount || !description) {
      toast.error('Please fill in all fields');
      return;
    }

    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    addMaintenanceCost({
      requestId: selectedRequest,
      amount: value,
      description,
      billToTenant,
    });

    toast.success('Expense recorded successfully');
    setAmount('');
    setDescription('');
    setIsDialogOpen(false);
  };

  const handleRemoveExpense = (cost: any) => {
    setExpenseToDelete(cost);
    setIsDeleteExpenseDialogOpen(true);
  };

  const confirmDeleteExpense = () => {
    if (!expenseToDelete) return;
    deleteMaintenanceCost(expenseToDelete.id);
    toast.success('Expense deleted successfully');
    setIsDeleteExpenseDialogOpen(false);
    setExpenseToDelete(null);
  };

  const openAddCostDialog = (requestId: string) => {
    setSelectedRequest(requestId);
    setAmount('');
    setDescription('');
    setIsDialogOpen(true);
  };

  const getTotalCostForRequest = (requestId: string) => {
    return maintenanceCosts
      .filter((c) => c.requestId === requestId)
      .reduce((sum, c) => sum + c.amount, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Maintenance Expenses
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Track costs for maintenance requests
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Maintenance Requests & Costs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Property / Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded Costs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const unit = units.find((u) => u.id === request.unitId);
                  const property = unit
                    ? properties.find((p) => p.id === unit.propertyId)
                    : null;
                  const totalCost = getTotalCostForRequest(request.id);
                  const requestCosts = maintenanceCosts.filter(
                    (c) => c.requestId === request.id
                  );

                  return (
                    <React.Fragment key={request.id}>
                      <TableRow
                        className={requestCosts.length > 0 ? 'border-b-0' : ''}
                      >
                        <TableCell className="align-top whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="size-4 text-gray-400" />
                            {request.submittedDate}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="font-medium">{request.title}</div>
                          <div className="text-sm text-gray-500 line-clamp-1">
                            {request.description}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="text-sm">
                            <div className="font-medium">{property?.name}</div>
                            <div className="text-gray-500">
                              Unit {unit?.unitNumber}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge
                            variant={
                              request.status === 'completed'
                                ? 'default'
                                : request.status === 'in_progress'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className={
                              request.status === 'completed'
                                ? 'bg-green-100 text-green-800 hover:bg-green-100 border-transparent shadow-none'
                                : request.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent shadow-none'
                                  : 'text-gray-600'
                            }
                          >
                            {request.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top font-medium">
                          {totalCost > 0
                            ? `LKR ${totalCost.toLocaleString()}`
                            : '-'}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1"
                            onClick={() => openAddCostDialog(request.id)}
                          >
                            <Plus className="size-3.5" />
                            Add Cost
                          </Button>
                        </TableCell>
                      </TableRow>
                      {/* Sub-rows for details if needed, or simple list */}
                      {requestCosts.length > 0 && (
                        <TableRow className="bg-gray-50/50">
                          <TableCell colSpan={6} className="pt-0 pb-4">
                            <div className="grid gap-2 pl-4 border-l-2 border-gray-200 ml-2">
                              {requestCosts.map((cost) => (
                                <div
                                  key={cost.id}
                                  className="flex justify-between items-center text-sm group"
                                >
                                  <div className="flex items-center gap-2 text-gray-600">
                                    <DollarSign className="size-3" />
                                    <span>{cost.description}</span>
                                    <span className="text-gray-400 text-xs">
                                      ({cost.recordedDate})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-medium">
                                      LKR {cost.amount.toLocaleString()}
                                    </span>
                                    <button
                                      onClick={() => handleRemoveExpense(cost)}
                                      className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                      title="Delete Cost"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {requests.length === 0 && (
              <div className="py-12 text-center text-gray-500">
                No maintenance requests found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Expense</DialogTitle>
            <DialogDescription>
              Add a new cost item for this maintenance request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (LKR)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-9"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="e.g. Parts replacement, Service fee"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="billToTenant"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={billToTenant}
                onChange={(e) => setBillToTenant(e.target.checked)}
              />
              <Label
                htmlFor="billToTenant"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Bill to Tenant (Create Invoice)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCost}>Save Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteExpenseDialogOpen}
        onOpenChange={setIsDeleteExpenseDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              recorded expense for{' '}
              <span className="font-semibold text-gray-900">
                {expenseToDelete?.description}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteExpense}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
