import React, { useState } from 'react';
import { useApp, Property } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Edit, Trash2, Eye } from 'lucide-react';
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
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [viewProperty, setViewProperty] = useState<Property | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Simulate image upload
    let image = editingProperty?.image;
    if (selectedImage) {
      image = URL.createObjectURL(selectedImage);
    }

    if (editingProperty) {
      updateProperty(editingProperty.id, { ...formData, image });
      toast.success('Property updated successfully');
      setEditingProperty(null);
    } else {
      addProperty({ ...formData, image });
      toast.success('Property added successfully');
      setIsAddDialogOpen(false);
    }

    setFormData({ name: '', address: '', type: '' });
    setSelectedImage(null);
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormData({
      name: property.name,
      address: property.address,
      type: property.type,
    });
    setSelectedImage(null);
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
              <div className="space-y-2">
                <Label htmlFor="image">Property Image</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="cursor-pointer"
                />
                {selectedImage && (
                  <div className="mt-2 relative h-32 w-full rounded-md overflow-hidden bg-gray-100">
                    <img
                      src={URL.createObjectURL(selectedImage)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  setFormData({ name: '', address: '', type: '' });
                  setSelectedImage(null);
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
          <Card key={property.id} className="overflow-hidden">
            {property.image && (
              <div className="h-32 w-full bg-gray-100 relative">
                <img
                  src={property.image}
                  alt={property.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <CardHeader className={property.image ? "pt-4" : ""}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {!property.image && (
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Building2 className="size-5 text-blue-600" />
                    </div>
                  )}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewProperty(property)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Dialog open={editingProperty?.id === property.id} onOpenChange={(open) => {
                      if (!open) {
                        setEditingProperty(null);
                        setFormData({ name: '', address: '', type: '' });
                        setSelectedImage(null);
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
                          <div className="space-y-2">
                            <Label htmlFor="edit-image">Property Image</Label>
                            {editingProperty?.image && !selectedImage && (
                              <div className="mb-2 relative h-32 w-full rounded-md overflow-hidden bg-gray-100">
                                <img
                                  src={editingProperty.image}
                                  alt="Current"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                            <Input
                              id="edit-image"
                              type="file"
                              accept="image/*"
                              onChange={handleImageChange}
                              className="cursor-pointer"
                            />
                            {selectedImage && (
                              <div className="mt-2 relative h-32 w-full rounded-md overflow-hidden bg-gray-100">
                                <img
                                  src={URL.createObjectURL(selectedImage)}
                                  alt="Preview"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" onClick={() => {
                              setEditingProperty(null);
                              setFormData({ name: '', address: '', type: '' });
                              setSelectedImage(null);
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

      {/* View Property Details Dialog */}
      <Dialog open={!!viewProperty} onOpenChange={(open) => !open && setViewProperty(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Property Details</DialogTitle>
          </DialogHeader>
          {viewProperty && (
            <div className="space-y-6 mt-4">
              {/* Large Image View */}
              <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                {viewProperty.image ? (
                  <img
                    src={viewProperty.image}
                    alt={viewProperty.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <Building2 className="size-16 mb-2 opacity-20" />
                    <p>No image available</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{viewProperty.name}</h3>
                  <div className="mt-2 space-y-1 text-gray-600">
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Type:</span> {viewProperty.type}
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Address:</span> {viewProperty.address}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-900 mb-2">Statistics</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Total Units</p>
                      <p className="text-xl font-bold">{getUnitCount(viewProperty.id)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewProperty(null)}>Close</Button>
                <Button onClick={() => {
                  handleEdit(viewProperty);
                  setViewProperty(null);
                }}>
                  <Edit className="size-4 mr-2" />
                  Edit Property
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
