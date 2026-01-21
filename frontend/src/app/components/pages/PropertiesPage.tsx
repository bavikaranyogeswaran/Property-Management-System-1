import React, { useState } from 'react';
import { useApp, Property } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Building2, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function PropertiesPage() {
  const { properties, units, addProperty, updateProperty, deleteProperty } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingProperty) {
      updateProperty(editingProperty.id, formData);
      toast.success('Property updated successfully');
      setEditingProperty(null);
    } else {
      addProperty(formData);
      toast.success('Property added successfully');
      setIsAddDialogOpen(false);
    }
    
    setFormData({ name: '', address: '', type: '' });
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormData({
      name: property.name,
      address: property.address,
      type: property.type,
    });
  };

  const handleDelete = (id: string) => {
    const propertyUnits = units.filter(u => u.propertyId === id);
    if (propertyUnits.length > 0) {
      toast.error('Cannot delete property with existing units');
      return;
    }
    
    if (confirm('Are you sure you want to delete this property?')) {
      deleteProperty(id);
      toast.success('Property deleted successfully');
    }
  };

  const getUnitCount = (propertyId: string) => {
    return units.filter(u => u.propertyId === propertyId).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Properties</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your properties</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Property</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Property Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Sunset Apartments"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="e.g., 123 Main Street, City"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Property Type</Label>
                <Input
                  id="type"
                  placeholder="e.g., Apartment Building, Commercial"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  setFormData({ name: '', address: '', type: '' });
                }}>
                  Cancel
                </Button>
                <Button type="submit">Add Property</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((property) => (
          <Card key={property.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Building2 className="size-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{property.name}</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{property.type}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="text-sm">{property.address}</p>
                </div>
                <div className="flex justify-between items-center pt-3 border-t">
                  <div>
                    <p className="text-xs text-gray-500">Units</p>
                    <p className="text-sm font-semibold">{getUnitCount(property.id)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={editingProperty?.id === property.id} onOpenChange={(open) => {
                      if (!open) {
                        setEditingProperty(null);
                        setFormData({ name: '', address: '', type: '' });
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(property)}
                        >
                          <Edit className="size-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Property</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <Label htmlFor="edit-name">Property Name</Label>
                            <Input
                              id="edit-name"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-address">Address</Label>
                            <Input
                              id="edit-address"
                              value={formData.address}
                              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-type">Property Type</Label>
                            <Input
                              id="edit-type"
                              value={formData.type}
                              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                              required
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" onClick={() => {
                              setEditingProperty(null);
                              setFormData({ name: '', address: '', type: '' });
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
                      onClick={() => handleDelete(property.id)}
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {properties.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="size-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No properties yet</p>
            <p className="text-sm text-gray-500 mt-1">Add your first property to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
