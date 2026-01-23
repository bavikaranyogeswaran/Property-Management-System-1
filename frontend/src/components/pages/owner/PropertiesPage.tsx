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
  const { properties, propertyTypes, units, addProperty, updateProperty, deleteProperty } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    propertyTypeId: 0,
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

    // Validate type
    if (formData.propertyTypeId === 0) {
      toast.error('Please select a property type');
      return;
    }

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

    setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
    setSelectedImage(null);
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormData({
      name: property.name,
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2 || '',
      addressLine3: property.addressLine3 || '',
      propertyTypeId: property.propertyTypeId,
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
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    placeholder="Address Line 1"
                    value={formData.addressLine1}
                    onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                    required
                  />
                  <Input
                    placeholder="Address Line 2 (Optional)"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                  />
                  <Input
                    placeholder="Address Line 3 (Optional)"
                    value={formData.addressLine3}
                    onChange={(e) => setFormData({ ...formData, addressLine3: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Property Type</Label>
                <select
                  id="type"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={formData.propertyTypeId}
                  onChange={(e) => setFormData({ ...formData, propertyTypeId: parseInt(e.target.value) })}
                  required
                >
                  <option value={0}>Select Type</option>
                  {propertyTypes.map((t) => (
                    <option key={t.type_id} value={t.type_id}>{t.name}</option>
                  ))}
                </select>
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
                  setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
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
                    <p className="text-xs text-gray-500 mt-1">{property.typeName}</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="text-sm">{property.addressLine1}</p>
                  {property.addressLine2 && <p className="text-sm text-gray-500">{property.addressLine2}</p>}
                  {property.addressLine3 && <p className="text-sm text-gray-500">{property.addressLine3}</p>}
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
                        setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
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
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Address</Label>
                              <Input
                                placeholder="Address Line 1"
                                value={formData.addressLine1}
                                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                                required
                              />
                              <Input
                                placeholder="Address Line 2 (Optional)"
                                value={formData.addressLine2}
                                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                              />
                              <Input
                                placeholder="Address Line 3 (Optional)"
                                value={formData.addressLine3}
                                onChange={(e) => setFormData({ ...formData, addressLine3: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-type">Property Type</Label>
                            <select
                              id="edit-type"
                              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={formData.propertyTypeId}
                              onChange={(e) => setFormData({ ...formData, propertyTypeId: parseInt(e.target.value) })}
                              required
                            >
                              <option value={0}>Select Type</option>
                              {propertyTypes.map((t) => (
                                <option key={t.type_id} value={t.type_id}>{t.name}</option>
                              ))}
                            </select>
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
                              setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
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
                      <span className="font-medium text-gray-900">Type:</span> {viewProperty.typeName}
                    </p>
                    <div>
                      <span className="font-medium text-gray-900">Address:</span>
                      <p className="ml-2">{viewProperty.addressLine1}</p>
                      {viewProperty.addressLine2 && <p className="ml-2">{viewProperty.addressLine2}</p>}
                      {viewProperty.addressLine3 && <p className="ml-2">{viewProperty.addressLine3}</p>}
                    </div>
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
