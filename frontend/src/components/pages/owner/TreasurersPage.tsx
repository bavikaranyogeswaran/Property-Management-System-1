import React, { useState } from 'react';
import { useApp, Treasurer } from '@/app/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus,
  Mail,
  Phone,
  Shield,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';
import { TreasurerAssignmentDialog } from './TreasurerAssignmentDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/services/api';

export function TreasurersPage() {
  const {
    treasurers,
    properties,
    addTreasurer,
    updateTreasurer,
    deleteTreasurer,
  } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedTreasurer, setSelectedTreasurer] = useState<Treasurer | null>(
    null
  );

  const handleAssignmentClick = (treasurer: Treasurer) => {
    setSelectedTreasurer(treasurer);
    setIsAssignmentDialogOpen(true);
  };

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Status is managed via separate actions

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
  };

  const handleAddTreasurer = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate email uniqueness (local check, backend will also check)
    if (treasurers.some((t) => t.email === email)) {
      toast.error('A treasurer with this email already exists');
      return;
    }

    try {
      // Call backend API
      const response = await apiClient.post('/users/create-treasurer', {
        name,
        email,
        phone,
      });

      if (response.status === 201) {
        // Update local state to reflect change immediately (using backend ID if possible or generating temp)
        // Note: Backend doesn't return phone, so we keep local form value for UI consistency until refresh
        // Update local state to reflect change immediately (using backend ID)
        const newTreasurer = response.data;
        addTreasurer({
          id: newTreasurer.id.toString(), // Ensure ID is string
          name: newTreasurer.name,
          email: newTreasurer.email,
          phone: newTreasurer.phone || phone,
          password: '', // Password is set via invite now
          status: newTreasurer.status || 'active',
        });

        toast.success('Treasurer registered successfully');
        setIsAddDialogOpen(false);
        resetForm();
      }
    } catch (error: any) {
      console.error('Failed to register treasurer:', error);
      const errorMessage =
        error.response?.data?.error || 'Failed to register treasurer';
      toast.error(errorMessage);
    }
  };

  const handleEditClick = (treasurer: Treasurer) => {
    setSelectedTreasurer(treasurer);
    setName(treasurer.name);
    setEmail(treasurer.email);
    setPhone(treasurer.phone);
    setIsEditDialogOpen(true);
  };

  const handleUpdateTreasurer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTreasurer) return;

    // Validate email uniqueness (excluding current treasurer)
    if (
      treasurers.some((t) => t.email === email && t.id !== selectedTreasurer.id)
    ) {
      toast.error('A treasurer with this email already exists');
      return;
    }

    try {
      // Call backend API (password is excluded)
      await apiClient.put(`/users/${selectedTreasurer.id}`, {
        name,
        email,
        phone,
      });

      // Update local context
      updateTreasurer(selectedTreasurer.id, {
        name,
        email,
        phone,
      });

      toast.success('Treasurer updated successfully');
      setIsEditDialogOpen(false);
      setSelectedTreasurer(null);
      resetForm();
    } catch (error: any) {
      console.error('Failed to update treasurer:', error);
      toast.error(error.response?.data?.error || 'Failed to update treasurer');
    }
  };

  const handleDelete = async (treasurer: Treasurer) => {
    if (
      window.confirm(
        `Are you sure you want to remove ${treasurer.name} as a treasurer?`
      )
    ) {
      try {
        await apiClient.delete(`/users/${treasurer.id}`);
        deleteTreasurer(treasurer.id);
        toast.success('Treasurer removed successfully');
      } catch (error: any) {
        console.error('Failed to remove treasurer:', error);
        toast.error(
          error.response?.data?.error || 'Failed to remove treasurer'
        );
      }
    }
  };

  const handleToggleStatus = async (treasurer: Treasurer) => {
    const newStatus = treasurer.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.put(`/users/${treasurer.id}`, {
        name: treasurer.name,
        email: treasurer.email,
        phone: treasurer.phone,
        status: newStatus,
      });
      updateTreasurer(treasurer.id, { status: newStatus });
      toast.success(
        `Treasurer ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`
      );
    } catch (error: any) {
      console.error('Failed to update status:', error);
      toast.error('Failed to update status');
    }
  };

  const activeTreasurers = treasurers.filter(
    (t) => t.status === 'active'
  ).length;
  const inactiveTreasurers = treasurers.filter(
    (t) => t.status === 'inactive'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Treasurers</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage financial staff and their access
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <UserPlus className="size-4 mr-2" />
              Register Treasurer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Treasurer</DialogTitle>
              <DialogDescription>
                Add a new treasurer to manage financial operations
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddTreasurer} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john.doe@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+94 77 123 4567"
                  required
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-700 mb-4">
                <p>
                  <strong>Note:</strong> An invitation email will be sent to the
                  treasurer to set their own password.
                </p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="flex-1">
                  Register Treasurer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Treasurers</CardDescription>
            <CardTitle className="text-3xl">{treasurers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl text-green-600">
              {activeTreasurers}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Inactive</CardDescription>
            <CardTitle className="text-3xl text-gray-400">
              {inactiveTreasurers}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Treasurers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Treasurers</CardTitle>
          <CardDescription>
            View and manage all treasurers in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {treasurers.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="size-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No treasurers registered
              </h3>
              <p className="text-gray-500 mb-4">
                Get started by registering your first treasurer
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <UserPlus className="size-4 mr-2" />
                Register Treasurer
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treasurers.map((treasurer) => (
                    <TableRow key={treasurer.id}>
                      <TableCell className="font-medium">
                        {treasurer.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="size-3" />
                          {treasurer.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Phone className="size-3" />
                          {treasurer.phone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            treasurer.status === 'active'
                              ? 'default'
                              : 'secondary'
                          }
                          className={
                            treasurer.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : ''
                          }
                        >
                          {treasurer.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(treasurer.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAssignmentClick(treasurer)}
                            title="Assign Properties"
                          >
                            <Building className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(treasurer)}
                          >
                            {treasurer.status === 'active'
                              ? 'Deactivate'
                              : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(treasurer)}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(treasurer)}
                          >
                            <Trash2 className="size-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Treasurer</DialogTitle>
            <DialogDescription>Update treasurer information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTreasurer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john.doe@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+94 77 123 4567"
                required
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1">
                Update Treasurer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedTreasurer(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <TreasurerAssignmentDialog
        open={isAssignmentDialogOpen}
        onOpenChange={setIsAssignmentDialogOpen}
        treasurer={selectedTreasurer}
        properties={properties}
      />
    </div>
  );
}
