import React, { useState } from 'react';
import { useApp, Unit } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Home, Plus, Edit, Trash2, Filter } from 'lucide-react';
import { toast } from 'sonner';

export function UnitsPage() {
  const { units, properties, leases, addUnit, updateUnit, deleteUnit } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [formData, setFormData] = useState({
    propertyId: '',
    unitNumber: '',
    type: '',
    monthlyRent: '',
    status: 'available' as Unit['status'],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingUnit) {
      updateUnit(editingUnit.id, {
        ...formData,
        monthlyRent: parseFloat(formData.monthlyRent),
      });
      toast.success('Unit updated successfully');
      setEditingUnit(null);
    } else {
      addUnit({
        ...formData,
        monthlyRent: parseFloat(formData.monthlyRent),
      });
      toast.success('Unit added successfully');
      setIsAddDialogOpen(false);
    }
    
    setFormData({
      propertyId: '',
      unitNumber: '',
      type: '',
      monthlyRent: '',
      status: 'available',
    });
  };

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit);
    setFormData({
      propertyId: unit.propertyId,
      unitNumber: unit.unitNumber,
      type: unit.type,
      monthlyRent: unit.monthlyRent.toString(),
      status: unit.status,
    });
  };

  const handleDelete = (id: string) => {
    const unit = units.find(u => u.id === id);
    if (unit?.status === 'occupied') {
      toast.error('Cannot delete occupied unit');
      return;
    }
    
    if (confirm('Are you sure you want to delete this unit?')) {
      deleteUnit(id);
      toast.success('Unit deleted successfully');
    }
  };

  const filteredUnits = units.filter(unit => {
    if (filterProperty !== 'all' && unit.propertyId !== filterProperty) return false;
    if (filterStatus !== 'all' && unit.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status: Unit['status']) => {
    const variants: Record<Unit['status'], { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
      available: { variant: 'default', label: 'Available' },
      occupied: { variant: 'secondary', label: 'Occupied' },
      maintenance: { variant: 'outline', label: 'Maintenance' },
    };
    return variants[status];
  };

  const stats = [
    {
      label: 'Total Units',
      value: units.length,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Occupied',
      value: units.filter(u => u.status === 'occupied').length,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Available',
      value: units.filter(u => u.status === 'available').length,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Maintenance',
      value: units.filter(u => u.status === 'maintenance').length,
      color: 'bg-red-50 text-red-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Units</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your rental units</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Add Unit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Unit</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="propertyId">Property</Label>
                <Select
                  value={formData.propertyId}
                  onValueChange={(value) => setFormData({ ...formData, propertyId: value })}
                  required
                >
                  <SelectTrigger id="propertyId">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitNumber">Unit Number</Label>
                <Input
                  id="unitNumber"
                  placeholder="e.g., A101"
                  value={formData.unitNumber}
                  onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Unit Type</Label>
                <Input
                  id="type"
                  placeholder="e.g., Studio, 1 Bedroom"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyRent">Monthly Rent ($)</Label>
                <Input
                  id="monthlyRent"
                  type="number"
                  step="0.01"
                  placeholder="e.g., 1200"
                  value={formData.monthlyRent}
                  onChange={(e) => setFormData({ ...formData, monthlyRent: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: Unit['status']) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="occupied">Occupied</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  setFormData({
                    propertyId: '',
                    unitNumber: '',
                    type: '',
                    monthlyRent: '',
                    status: 'available',
                  });
                }}>
                  Cancel
                </Button>
                <Button type="submit">Add Unit</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="size-4" />
            <CardTitle className="text-base">Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="filter-property">Property</Label>
              <Select value={filterProperty} onValueChange={setFilterProperty}>
                <SelectTrigger id="filter-property" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {properties.map((prop) => (
                    <SelectItem key={prop.id} value={prop.id}>
                      {prop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="filter-status">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger id="filter-status" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Units Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit Number</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Monthly Rent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnits.map((unit) => {
                  const property = properties.find(p => p.id === unit.propertyId);
                  const statusBadge = getStatusBadge(unit.status);
                  return (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.unitNumber}</TableCell>
                      <TableCell>{property?.name}</TableCell>
                      <TableCell>{unit.type}</TableCell>
                      <TableCell>${unit.monthlyRent}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Dialog open={editingUnit?.id === unit.id} onOpenChange={(open) => {
                            if (!open) {
                              setEditingUnit(null);
                              setFormData({
                                propertyId: '',
                                unitNumber: '',
                                type: '',
                                monthlyRent: '',
                                status: 'available',
                              });
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(unit)}
                              >
                                <Edit className="size-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Unit</DialogTitle>
                              </DialogHeader>
                              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                  <Label htmlFor="edit-propertyId">Property</Label>
                                  <Select
                                    value={formData.propertyId}
                                    onValueChange={(value) => setFormData({ ...formData, propertyId: value })}
                                  >
                                    <SelectTrigger id="edit-propertyId">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {properties.map((prop) => (
                                        <SelectItem key={prop.id} value={prop.id}>
                                          {prop.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-unitNumber">Unit Number</Label>
                                  <Input
                                    id="edit-unitNumber"
                                    value={formData.unitNumber}
                                    onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-type">Unit Type</Label>
                                  <Input
                                    id="edit-type"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-monthlyRent">Monthly Rent ($)</Label>
                                  <Input
                                    id="edit-monthlyRent"
                                    type="number"
                                    step="0.01"
                                    value={formData.monthlyRent}
                                    onChange={(e) => setFormData({ ...formData, monthlyRent: e.target.value })}
                                    required
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="edit-status">Status</Label>
                                  <Select
                                    value={formData.status}
                                    onValueChange={(value: Unit['status']) => setFormData({ ...formData, status: value })}
                                  >
                                    <SelectTrigger id="edit-status">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="available">Available</SelectItem>
                                      <SelectItem value="occupied">Occupied</SelectItem>
                                      <SelectItem value="maintenance">Maintenance</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button type="button" variant="outline" onClick={() => {
                                    setEditingUnit(null);
                                    setFormData({
                                      propertyId: '',
                                      unitNumber: '',
                                      type: '',
                                      monthlyRent: '',
                                      status: 'available',
                                    });
                                  }}>
                                    Cancel
                                  </Button>
                                  <Button type="submit">Save Changes</Button>
                                </div>
                              </form>
                            </DialogContent>
                          </Dialog>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(unit.id)}
                          >
                            <Trash2 className="size-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredUnits.length === 0 && (
            <div className="py-12 text-center">
              <Home className="size-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No units found</p>
              <p className="text-sm text-gray-500 mt-1">
                {units.length === 0 ? 'Add your first unit to get started' : 'Try adjusting your filters'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
