import React, { useState } from 'react';
import { useApp, Property } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { MultiImageUpload } from '@/components/ui/multi-image-upload';

import { useAuth } from '@/app/context/AuthContext';

export function PropertiesPage() {
  const { user } = useAuth();
  const {
    properties,
    addProperty,
    updateProperty,
    deleteProperty,
    propertyTypes,
    units,
    addLead,
    uploadPropertyImages,
    getPropertyImages,
    setPropertyPrimaryImage,
    deletePropertyImage
  } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isInterestDialogOpen, setIsInterestDialogOpen] = useState(false);
  const [interestFormData, setInterestFormData] = useState({
    name: '',
    email: '',
    phone: '',
    interestedUnit: '',
    notes: '',
  });
  const [interestProperty, setInterestProperty] = useState<Property | null>(null);
  const [existingImages, setExistingImages] = useState<any[]>([]);
  const [viewGalleryOpen, setViewGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [viewPropertyTitle, setViewPropertyTitle] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    propertyTypeId: 0,
  });
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [viewProperty, setViewProperty] = useState<Property | null>(null);

  const handleImagesChange = (images: { file: File; isPrimary: boolean }[]) => {
    const files = images.map(img => img.file);
    const primaryIndex = images.findIndex(img => img.isPrimary);
    setUploadFiles(files);
    setPrimaryImageIndex(primaryIndex >= 0 ? primaryIndex : 0);
  };

  // ... (keep existing handler functions unchanged) ...
  // Since I can't easily skip lines in replacement, I'll use multi_replace for safer edits if possible, or careful replace.
  // Actually, `replace_file_content` is better for single block, but I need to modify imports AND JSX which are far apart.
  // I'll use `multi_replace_file_content`.


  // Removed old handleImageChange - using MultiImageUpload component now

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.propertyTypeId === 0) {
      toast.error('Please select a property type');
      return;
    }

    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, formData);

        if (uploadFiles.length > 0) {
          const response = await uploadPropertyImages(editingProperty.id, uploadFiles);

          if (primaryImageIndex > 0 && response.images && response.images.length > primaryImageIndex) {
            const targetImage = response.images[primaryImageIndex];
            if (targetImage) {
              await setPropertyPrimaryImage(editingProperty.id, targetImage.image_id || targetImage.id);
            }
          }
        }

        toast.success('Property updated successfully');
        setEditingProperty(null);
      } else {
        const newProperty = await addProperty({ ...formData });

        if (newProperty && uploadFiles.length > 0) {
          const response = await uploadPropertyImages(newProperty.id, uploadFiles);

          if (primaryImageIndex > 0 && response.images && response.images.length > primaryImageIndex) {
            const targetImage = response.images[primaryImageIndex];
            if (targetImage) {
              await setPropertyPrimaryImage(newProperty.id, targetImage.image_id || targetImage.id);
            }
          }
        }

        toast.success('Property added successfully');
        setIsAddDialogOpen(false);
      }

      setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
      setUploadFiles([]);
      setPrimaryImageIndex(0);
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.error || 'Failed to save property';
      toast.error(msg);
    }
  };

  const handleEdit = async (property: Property) => {
    setEditingProperty(property);
    setFormData({
      name: property.name,
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2 || '',
      addressLine3: property.addressLine3 || '',
      propertyTypeId: property.propertyTypeId,
    });
    setUploadFiles([]);
    setPrimaryImageIndex(0);
    setExistingImages([]);

    try {
      const images = await getPropertyImages(property.id);
      if (images) {
        setExistingImages(images.map((img: any) => ({
          id: img.image_id?.toString() || img.id?.toString(),
          url: img.image_url || img.url, // Handle backend naming
          isPrimary: Boolean(img.is_primary)
        })));
      }
    } catch (e) {
      console.error("Failed to load images", e);
      toast.error("Failed to load property images");
    }
  };

  const handleRemoveExistingImage = async (image: any) => {
    if (!editingProperty) return;
    if (confirm('Delete this image?')) {
      try {
        await deletePropertyImage(editingProperty.id, image.id);
        // Refresh images
        const images = await getPropertyImages(editingProperty.id);
        setExistingImages(images.map((img: any) => ({
          id: img.image_id?.toString() || img.id?.toString(),
          url: img.image_url,
          isPrimary: Boolean(img.is_primary)
        })));
        toast.success('Image deleted');
      } catch (e) {
        toast.error('Failed to delete image');
      }
    }
  };

  const handleSetPrimaryExistingImage = async (image: any) => {
    if (!editingProperty) return;
    try {
      await setPropertyPrimaryImage(editingProperty.id, image.id);
      // Refresh images
      const images = await getPropertyImages(editingProperty.id);
      setExistingImages(images.map((img: any) => ({
        id: img.image_id?.toString() || img.id?.toString(),
        url: img.image_url,
        isPrimary: Boolean(img.is_primary)
      })));
      toast.success('Primary image updated');
    } catch (e) {
      toast.error('Failed to set primary image');
    }
  };

  const handleViewGallery = async (property: Property) => {
    setViewPropertyTitle(property.name);
    setGalleryImages([]);
    setViewGalleryOpen(true);
    try {
      const images = await getPropertyImages(property.id);
      if (images) setGalleryImages(images);
    } catch (e) {
      toast.error("Failed to load images");
    }
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

  const handleInterestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Find a default available unit if none selected, or strict it?
      // Logic: Lead is interested in the *property*, but backend expects `interestedUnit`.
      // If user selected a unit in form, use it. If triggered from property card, maybe force select?
      // For now, let's auto-select the first available unit or leave empty if backend allows.
      // Backend `leadModel` inserts `unit_id`.
      // Let's modify the form to allow unit selection or pre-fill.

      await addLead({
        ...interestFormData,
        propertyId: interestProperty?.id || '',
        status: 'interested',
      });
      toast.success('Interest registered! We will contact you soon.');
      setIsInterestDialogOpen(false);
      setInterestFormData({ name: '', email: '', phone: '', interestedUnit: '', notes: '' });
      setInterestProperty(null);
    } catch (error) {
      toast.error('Failed to submit interest');
    }
  };

  const openInterestDialog = (property: Property) => {
    setInterestProperty(property);
    // Find first available unit for this property to pre-select
    const availableUnit = units.find(u => u.propertyId === property.id && u.status === 'available');
    setInterestFormData(prev => ({ ...prev, interestedUnit: availableUnit?.id || '' }));
    setIsInterestDialogOpen(true);
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
        {user?.role === 'owner' && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                Add Property
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                <MultiImageUpload
                  maxImages={10}
                  onImagesChange={handleImagesChange}
                  existingImages={existingImages}
                  onRemoveExisting={handleRemoveExistingImage}
                  onSetPrimaryExisting={handleSetPrimaryExistingImage}
                />
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => {
                    setIsAddDialogOpen(false);
                    setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
                    setUploadFiles([]);
                    setPrimaryImageIndex(0);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit">Add Property</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((property) => (
          <Card key={property.id} className="overflow-hidden flex flex-col">
            {property.image && (
              <div className="h-48 w-full bg-gray-100 relative">
                <img
                  src={property.image}
                  alt={property.name}
                  className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
                />
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold shadow-sm">
                  {property.typeName}
                </div>
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
                    <CardTitle className="text-lg">{property.name}</CardTitle>
                    {!property.image && <p className="text-xs text-gray-500 mt-1">{property.typeName}</p>}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Location</p>
                  <p className="text-sm text-gray-700">{property.addressLine1}</p>
                  {property.addressLine2 && <p className="text-sm text-gray-500">{property.addressLine2}</p>}
                </div>

                <div className="pt-3 border-t grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Units</p>
                    <p className="text-lg font-semibold text-gray-900">{getUnitCount(property.id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Available</p>
                    <p className="text-lg font-semibold text-green-600">
                      {units.filter(u => u.propertyId === property.id && u.status === 'available').length}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4">
                  <Button
                    className="flex-1"
                    variant={user?.role === 'owner' ? 'secondary' : 'default'}
                    onClick={() => user?.role === 'owner' ? handleViewGallery(property) : openInterestDialog(property)}
                  >
                    {user?.role === 'owner' ? (
                      <>
                        <Eye className="size-4 mr-2" /> View Gallery
                      </>
                    ) : (
                      <>
                        I'm Interested
                      </>
                    )}
                  </Button>

                  {user?.role === 'owner' && (
                    <>
                      <Dialog open={editingProperty?.id === property.id} onOpenChange={(open) => {
                        if (!open) {
                          setEditingProperty(null);
                          setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
                          setUploadFiles([]);
                          setPrimaryImageIndex(0);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleEdit(property)}
                          >
                            <Edit className="size-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                            <MultiImageUpload
                              maxImages={10}
                              onImagesChange={handleImagesChange}
                            />
                            <div className="flex gap-2 justify-end">
                              <Button type="button" variant="outline" onClick={() => {
                                setEditingProperty(null);
                                setFormData({ name: '', addressLine1: '', addressLine2: '', addressLine3: '', propertyTypeId: 0 });
                                setUploadFiles([]);
                                setPrimaryImageIndex(0);
                              }}>
                                Cancel
                              </Button>
                              <Button type="submit">Save Changes</Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(property.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
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
                {user?.role === 'owner' && (
                  <Button onClick={() => {
                    handleEdit(viewProperty);
                    setViewProperty(null);
                  }}>
                    <Edit className="size-4 mr-2" />
                    Edit Property
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={isInterestDialogOpen} onOpenChange={setIsInterestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>I'm Interested in {interestProperty?.name}</DialogTitle>
            <p className="text-sm text-gray-500">Leave your details and we'll get back to you.</p>
          </DialogHeader>
          <form onSubmit={handleInterestSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input
                id="lead-name"
                placeholder="Your full name"
                value={interestFormData.name}
                onChange={(e) => setInterestFormData({ ...interestFormData, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  placeholder="email@example.com"
                  value={interestFormData.email}
                  onChange={(e) => setInterestFormData({ ...interestFormData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  placeholder="+94 77 123 4567"
                  value={interestFormData.phone}
                  onChange={(e) => setInterestFormData({ ...interestFormData, phone: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-unit">Interested Unit (Optional)</Label>
              <div className="relative">
                <select
                  id="lead-unit"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={interestFormData.interestedUnit}
                  onChange={(e) => setInterestFormData({ ...interestFormData, interestedUnit: e.target.value })}
                >
                  <option value="">Any available unit</option>
                  {interestProperty && units
                    .filter(u => u.propertyId === interestProperty.id && u.status === 'available')
                    .map(u => (
                      <option key={u.id} value={u.id}>Unit {u.unitNumber} - {u.type} (LKR {u.monthlyRent}/mo)</option>
                    ))
                  }
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-notes">Notes / Questions</Label>
              <textarea
                id="lead-notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="I'm interested in viewing this property..."
                value={interestFormData.notes}
                onChange={(e) => setInterestFormData({ ...interestFormData, notes: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setIsInterestDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Submit Interest</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={viewGalleryOpen} onOpenChange={setViewGalleryOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gallery: {viewPropertyTitle}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
            {galleryImages.length > 0 ? (
              galleryImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 group">
                  <img
                    src={img.image_url || img.url}
                    alt={`Gallery ${idx}`}
                    className="w-full h-full object-cover"
                  />
                  {img.is_primary && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full shadow-sm">
                      Primary
                    </div>
                  )}
                  <a
                    href={img.image_url || img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                  >
                    <span className="bg-white/90 text-gray-900 px-3 py-1 rounded-full text-sm font-medium shadow-sm">View Full</span>
                  </a>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-10 text-gray-500">
                No images uploaded for this property.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
