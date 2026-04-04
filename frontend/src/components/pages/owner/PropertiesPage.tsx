import React, { useState } from 'react';
import { useApp, Property } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Building2, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { MultiImageUpload } from '@/components/ui/multi-image-upload';
import { formatLKR } from '@/utils/formatters';

import { useAuth } from '@/app/context/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  propertySchema,
  leadSchema,
  type PropertyFormValues,
  type LeadFormValues,
} from '@/schemas/ownerSchemas';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// ============================================================================
//  PROPERTIES PAGE (The Building List)
// ============================================================================
//  This page lists all the buildings the Owner manages.
//  It's like a catalog. You can Add, Edit, or Delete properties here.
// ============================================================================

export function PropertiesPage() {
  const { user } = useAuth();
  const {
    properties,
    addProperty,
    updateProperty,
    deleteProperty,
    propertyTypes,
    units,
    unitTypes,
    addUnit, // Added addUnit
    addLead,
    uploadPropertyImages,
    getPropertyImages,
    setPropertyPrimaryImage,
    deletePropertyImage,
  } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isInterestDialogOpen, setIsInterestDialogOpen] = useState(false);

  const [interestProperty, setInterestProperty] = useState<Property | null>(
    null
  );
  const [existingImages, setExistingImages] = useState<any[]>([]);
  const [viewGalleryOpen, setViewGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [viewPropertyTitle, setViewPropertyTitle] = useState('');

  // Property Form
  const propertyForm = useForm<PropertyFormValues>({
    mode: 'onChange',
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: '',
      propertyNo: '',
      street: '',
      city: '',
      district: '',
      propertyTypeId: 0,
      description: '',
      features: [],
      lateFeePercentage: 3,
      lateFeeType: 'flat_percentage',
      lateFeeAmount: 0,
      lateFeeGracePeriod: 5,
      tenantDeactivationDays: 30,
    },
  });

  // Interest Form
  const interestForm = useForm<LeadFormValues>({
    mode: 'onChange',
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      interestedUnit: '',
      notes: '',
    },
  });

  const [currentFeature, setCurrentFeature] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [viewProperty, setViewProperty] = useState<Property | null>(null);

  // Deletion States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const [isDeleteImageDialogOpen, setIsDeleteImageDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<any | null>(null);

  // Quick Add Units State
  const [quickUnits, setQuickUnits] = useState<
    {
      unitNumber: string;
      unitTypeId: number;
      monthlyRent: number;
      status: 'available';
    }[]
  >([]);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState(0);
  const [newUnitRent, setNewUnitRent] = useState<number>(0);

  // Single Unit Mode State
  const [isSingleUnit, setIsSingleUnit] = useState(false);
  const [singleUnitRent, setSingleUnitRent] = useState<number>(0);

  const addQuickUnit = () => {
    if (!newUnitNumber || newUnitType === 0 || !newUnitRent) {
      toast.error('Please fill all unit fields');
      return;
    }
    setQuickUnits([
      ...quickUnits,
      {
        unitNumber: newUnitNumber,
        unitTypeId: newUnitType,
        monthlyRent: newUnitRent,
        status: 'available',
      },
    ]);
    setNewUnitNumber('');
    setNewUnitType(0);
    setNewUnitRent(0);
  };

  const removeQuickUnit = (index: number) => {
    setQuickUnits(quickUnits.filter((_, i) => i !== index));
  };

  const handleImagesChange = (images: { file: File; isPrimary: boolean }[]) => {
    const files = images.map((img) => img.file);
    const primaryIndex = images.findIndex((img) => img.isPrimary);
    setUploadFiles(files);
    setPrimaryImageIndex(primaryIndex >= 0 ? primaryIndex : 0);
  };

  // ... (keep existing handler functions unchanged) ...

  const onSubmitProperty = async (values: PropertyFormValues) => {
    try {
      let savedPropertyId: string | undefined;

      if (editingProperty) {
        // Update existing property
        await updateProperty(editingProperty.id, values);
        savedPropertyId = editingProperty.id;

        // Handle images if any
        if (uploadFiles.length > 0) {
          await uploadPropertyImages(editingProperty.id, uploadFiles);
        }

        toast.success('Property updated successfully');
      } else {
        // Add new property
        const propertyData = {
          ...values,
          propertyNo: values.propertyNo || '',
        };
        const newProperty = await addProperty(propertyData);

        if (newProperty) {
          savedPropertyId = newProperty.id;
          // Handle images for new property
          if (uploadFiles.length > 0) {
            try {
              const response = await uploadPropertyImages(
                newProperty.id,
                uploadFiles
              );
              if (
                primaryImageIndex > 0 &&
                response.images &&
                response.images.length > primaryImageIndex
              ) {
                const targetImage = response.images[primaryImageIndex];
                if (targetImage) {
                  await setPropertyPrimaryImage(
                    newProperty.id,
                    targetImage.id
                  );
                }
              }
            } catch (uploadError: any) {
              console.error('Image upload failed:', uploadError);
              toast.error(
                `Property added, but images failed to upload: ${uploadError.message || 'Unknown error'}`
              );
            }
          }
          toast.success('Property added successfully');
        }
      }

      // Handle Units (Quick Add or Single Unit)
      if (savedPropertyId) {
        if (isSingleUnit && singleUnitRent > 0) {
          // Single Unit Mode
          try {
            const defaultType =
              unitTypes && unitTypes.length > 0 ? unitTypes[0] : null;
            await addUnit({
              propertyId: savedPropertyId,
              unitNumber: 'Main',
              unitTypeId: defaultType ? defaultType.id : 1,
              monthlyRent: singleUnitRent,
              status: 'available',
              type: defaultType ? defaultType.name : 'Standard',
            });
            toast.success('Single unit created successfully');
          } catch (unitError) {
            console.error('Failed to add single unit:', unitError);
            toast.error('Property saved, but failed to add unit.');
          }
        } else if (quickUnits.length > 0) {
          // Multiple Units Mode
          try {
            for (const unit of quickUnits) {
              const unitTypeName =
                unitTypes.find((t) => t.id === unit.unitTypeId)?.name ||
                '';
              await addUnit({
                propertyId: savedPropertyId,
                unitNumber: unit.unitNumber,
                unitTypeId: unit.unitTypeId,
                monthlyRent: unit.monthlyRent,
                status: unit.status,
                type: unitTypeName,
              });
            }
            toast.success(`${quickUnits.length} units added successfully`);
          } catch (unitError) {
            console.error('Failed to add quick units:', unitError);
            toast.error('Property saved, but failed to add some units.');
          }
        }
      }

      // Reset Form and State
      setIsAddDialogOpen(false);
      setEditingProperty(null);
      propertyForm.reset();
      setUploadFiles([]);
      setExistingImages([]);
      setQuickUnits([]);
      setNewUnitNumber('');
      setNewUnitType(0);
      setNewUnitRent(0);
      setIsSingleUnit(false);
      setSingleUnitRent(0);
    } catch (error: any) {
      console.error('Failed to save property:', error);
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        'Failed to save property';
      toast.error(`Failed to save property: ${errorMessage}`);
    }
  };

  const handleSetPrimaryExisting = async (image: any) => {
    if (!editingProperty) return;
    try {
      await setPropertyPrimaryImage(editingProperty.id, image.id);
      // Refresh
      const images = await getPropertyImages(editingProperty.id);
      setExistingImages(
        images.map((img: any) => ({
          id: img.id?.toString(),
          url: img.imageUrl || img.url,
          isPrimary: Boolean(img.isPrimary),
        }))
      );
      toast.success('Primary image updated');
    } catch (e) {
      toast.error('Failed to set primary image');
    }
  };

  const handleEditClick = async (property: Property) => {
    setEditingProperty(property);
    propertyForm.reset({
      name: property.name,
      propertyNo: property.propertyNo,
      street: property.street,
      city: property.city,
      district: property.district,
      propertyTypeId: property.propertyTypeId,
      description: property.description || '',
      features: property.features || [],
      lateFeePercentage: property.lateFeePercentage ?? 3,
      lateFeeType: property.lateFeeType ?? 'flat_percentage',
      lateFeeAmount: property.lateFeeAmount ?? 0,
      lateFeeGracePeriod: property.lateFeeGracePeriod ?? 5,
      tenantDeactivationDays: property.tenantDeactivationDays ?? 30,
    });

    // Initial state with just the primary image (better than nothing while loading)
    setExistingImages(
      property.imageUrl
        ? [{ id: 'primary-preview', url: property.imageUrl, isPrimary: true }]
        : []
    );
    
    // Reset unit related state to avoid state leaks from previous dialog sessions
    setQuickUnits([]);
    setNewUnitNumber('');
    setNewUnitType(0);
    setNewUnitRent(0);
    setIsSingleUnit(false);
    setSingleUnitRent(0);

    setIsAddDialogOpen(true);

    try {
      // Fetch all images for editing
      const images = await getPropertyImages(property.id);
      if (images && images.length > 0) {
        setExistingImages(
          images.map((img: any) => ({
            id: img.id?.toString(),
            url: img.imageUrl,
            isPrimary: Boolean(img.isPrimary),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load property images for editing:', error);
      toast.error('Could not load all property images');
    }
  };

  const handleAddClick = () => {
    setEditingProperty(null);
    propertyForm.reset({
      name: '',
      propertyNo: '',
      street: '',
      city: '',
      district: '',
      propertyTypeId: 0,
      description: '',
      features: [],
      lateFeePercentage: 3,
      lateFeeType: 'flat_percentage',
      lateFeeAmount: 0,
      lateFeeGracePeriod: 5,
      tenantDeactivationDays: 30,
    });
    setExistingImages([]);
    setUploadFiles([]);
    setQuickUnits([]);
    setNewUnitNumber('');
    setNewUnitType(0);
    setNewUnitRent(0);
    setIsSingleUnit(false);
    setSingleUnitRent(0);
    setIsAddDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setPropertyToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteProperty = async () => {
    if (!propertyToDelete) return;
    try {
      await deleteProperty(propertyToDelete);
      toast.success('Property deleted successfully');
    } catch (error) {
      toast.error('Failed to delete property');
    } finally {
      setIsDeleteDialogOpen(false);
      setPropertyToDelete(null);
    }
  };

  const onSubmitInterest = async (values: LeadFormValues) => {
    if (!interestProperty) return;

    try {
      await addLead({
        name: values.name,
        email: values.email,
        phone: values.phone,
        interestedUnit: values.interestedUnit || '',
        propertyId: interestProperty.id,
        status: 'interested',
        notes: values.notes || 'Interested from public page',
      });
      toast.success('Interest submitted successfully');
      setIsInterestDialogOpen(false);
      interestForm.reset();
    } catch (error) {
      console.error('Failed to submit interest:', error);
      toast.error('Failed to submit interest');
    }
  };

  const handleInterestClick = (property: Property) => {
    setInterestProperty(property);
    interestForm.reset({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      interestedUnit: '',
      notes: '',
    });
    setIsInterestDialogOpen(true);
  };

  const addFeature = () => {
    if (!currentFeature.trim()) return;
    const currentFeatures = propertyForm.getValues('features') || [];
    propertyForm.setValue('features', [
      ...currentFeatures,
      currentFeature.trim(),
    ]);
    setCurrentFeature('');
  };

  const removeFeature = (index: number) => {
    const currentFeatures = propertyForm.getValues('features') || [];
    propertyForm.setValue(
      'features',
      currentFeatures.filter((_, i) => i !== index)
    );
  };

  const handleRemoveExistingImage = (image: any) => {
    if (!editingProperty) return;
    setImageToDelete(image);
    setIsDeleteImageDialogOpen(true);
  };

  const confirmDeleteImage = async () => {
    if (!editingProperty || !imageToDelete) return;
    try {
      await deletePropertyImage(editingProperty.id, imageToDelete.id);
      // Refresh images
      const images = await getPropertyImages(editingProperty.id);
      setExistingImages(
        images.map((img: any) => ({
          id: img.id?.toString(),
          url: img.imageUrl,
          isPrimary: Boolean(img.isPrimary),
        }))
      );
      toast.success('Image deleted');
    } catch (e) {
      toast.error('Failed to delete image');
    } finally {
      setIsDeleteImageDialogOpen(false);
      setImageToDelete(null);
    }
  };

  const handleSetPrimaryExistingImage = async (image: any) => {
    if (!editingProperty) return;
    try {
      await setPropertyPrimaryImage(editingProperty.id, image.id);
      // Refresh images
      const images = await getPropertyImages(editingProperty.id);
      setExistingImages(
        images.map((img: any) => ({
          id: img.id?.toString(),
          url: img.imageUrl,
          isPrimary: Boolean(img.isPrimary),
        }))
      );
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
      toast.error('Failed to load images');
    }
  };

  const handleDelete = (id: string) => {
    const propertyUnits = units.filter((u) => u.propertyId === id);
    if (propertyUnits.length > 0) {
      toast.error('Cannot delete property with existing units');
      return;
    }

    setPropertyToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const getUnitCount = (propertyId: string) => {
    return units.filter((u) => u.propertyId === propertyId).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            {user?.role === 'treasurer'
              ? 'My Assigned Properties'
              : 'Properties'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {user?.role === 'treasurer'
              ? 'View properties assigned to you'
              : 'Manage your properties'}
          </p>
        </div>
        {user?.role === 'owner' && (
          <>
            <Button onClick={handleAddClick}>
              <Plus className="size-4 mr-2" />
              Add Property
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingProperty ? 'Edit Property' : 'Add New Property'}
                  </DialogTitle>
                </DialogHeader>

                <Form {...propertyForm}>
                  <form
                    onSubmit={propertyForm.handleSubmit(onSubmitProperty)}
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Basic Information */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">
                          Basic Information
                        </h3>

                        <FormField
                          control={propertyForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Property Name</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="e.g. Sunset Apartments"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={propertyForm.control}
                          name="propertyTypeId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Property Type</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(parseInt(e.target.value))
                                  }
                                  value={field.value}
                                >
                                  <option value={0}>Select Type</option>
                                  {propertyTypes.map((type) => (
                                    <option
                                      key={type.id}
                                      value={type.id}
                                    >
                                      {type.name}
                                    </option>
                                  ))}
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={propertyForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <textarea
                                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  placeholder="Describe the property..."
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Location */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Location</h3>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={propertyForm.control}
                            name="propertyNo"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Property No</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. 12/A" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={propertyForm.control}
                            name="street"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Street</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Main Street"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={propertyForm.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Colombo"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={propertyForm.control}
                            name="district"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>District</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="e.g. Western"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-6 space-y-4">
                      <h3 className="text-lg font-medium">Business Rules</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <FormField
                          control={propertyForm.control}
                          name="lateFeeType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Late Fee Type</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                  {...field}
                                >
                                  <option value="flat_percentage">Flat Percentage (%)</option>
                                  <option value="daily_fixed">Daily Fixed Amount (LKR)</option>
                                </select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {propertyForm.watch('lateFeeType') === 'flat_percentage' ? (
                          <FormField
                            control={propertyForm.control}
                            name="lateFeePercentage"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Standard Late Fee (%)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    {...field} 
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                                      field.onChange(val);
                                    }}
                                  />
                                </FormControl>
                                <p className="text-[0.8rem] text-muted-foreground">Applied monthly on overdue balance</p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
                          <FormField
                            control={propertyForm.control}
                            name="lateFeeAmount"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Daily Late Fee (LKR)</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    step="100"
                                    min="0"
                                    {...field} 
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                      field.onChange(val);
                                    }}
                                  />
                                </FormControl>
                                <p className="text-[0.8rem] text-muted-foreground">Applied daily while overdue</p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <FormField
                          control={propertyForm.control}
                          name="lateFeeGracePeriod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Grace Period (Days)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="1"
                                  min="0"
                                  {...field} 
                                  onChange={e => {
                                    const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                    field.onChange(val);
                                  }}
                                />
                              </FormControl>
                              <p className="text-[0.8rem] text-muted-foreground">Days after due date before late fees apply</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={propertyForm.control}
                          name="tenantDeactivationDays"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tenant Deactivation (Days)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  step="1"
                                  min="0"
                                  {...field} 
                                  onChange={e => {
                                    const val = e.target.value === '' ? '' : parseInt(e.target.value);
                                    field.onChange(val);
                                  }}
                                />
                              </FormControl>
                              <p className="text-[0.8rem] text-muted-foreground">Days after lease end before portal access revocation</p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Features & Images */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Features</h3>
                        <div className="flex gap-2">
                          <Input
                            value={currentFeature}
                            onChange={(e) => setCurrentFeature(e.target.value)}
                            placeholder="Add a feature (e.g. Pool, Gym)"
                            onKeyPress={(e) =>
                              e.key === 'Enter' &&
                              (e.preventDefault(), addFeature())
                            }
                          />
                          <Button
                            type="button"
                            onClick={addFeature}
                            variant="outline"
                            size="icon"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {propertyForm
                            .watch('features')
                            ?.map((feature, idx) => (
                              <div
                                key={idx}
                                className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-2"
                              >
                                {feature}
                                <button
                                  type="button"
                                  onClick={() => removeFeature(idx)}
                                  className="hover:text-destructive"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Images</h3>
                        <MultiImageUpload
                          maxImages={10}
                          onImagesChange={handleImagesChange}
                          existingImages={existingImages}
                          onRemoveExisting={handleRemoveExistingImage}
                          onSetPrimaryExisting={handleSetPrimaryExisting}
                        />
                      </div>
                    </div>

                    {/* Quick Add Units Section */}
                    <div className="mt-6 border-t pt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-medium">
                            Quick Add Units
                          </h3>
                          <p className="text-sm text-gray-500">
                            {isSingleUnit
                              ? 'This property is a single unit (e.g. house/villa).'
                              : 'Add multiple units to this property.'}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="singleUnitMode"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={isSingleUnit}
                            onChange={(e) => setIsSingleUnit(e.target.checked)}
                          />
                          <Label htmlFor="singleUnitMode">
                            Single Unit Property
                          </Label>
                        </div>
                      </div>

                      {isSingleUnit ? (
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                          <div className="space-y-2 max-w-xs">
                            <Label>Monthly Rent (LKR)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="e.g. 150000"
                              value={singleUnitRent || ''}
                              onChange={(e) =>
                                setSingleUnitRent(parseFloat(e.target.value))
                              }
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-gray-50 p-4 rounded-lg border">
                            <div className="space-y-2">
                              <Label>Unit Number</Label>
                              <Input
                                placeholder="e.g. A101"
                                value={newUnitNumber}
                                onChange={(e) =>
                                  setNewUnitNumber(e.target.value)
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={newUnitType}
                                onChange={(e) =>
                                  setNewUnitType(parseInt(e.target.value))
                                }
                              >
                                <option value={0}>Select Type</option>
                                {unitTypes?.map((type) => (
                                  <option
                                    key={type.id}
                                    value={type.id}
                                  >
                                    {type.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Monthly Rent (LKR)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="e.g. 50000"
                                value={newUnitRent || ''}
                                onChange={(e) =>
                                  setNewUnitRent(parseFloat(e.target.value))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              onClick={addQuickUnit}
                              className="w-full"
                            >
                              <Plus className="size-4 mr-2" /> Add Unit
                            </Button>
                          </div>

                          {quickUnits.length > 0 && (
                            <div className="border rounded-md overflow-hidden">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Unit #
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Rent
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Action
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {quickUnits.map((unit, idx) => (
                                    <tr key={idx}>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {unit.unitNumber}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {unitTypes?.find(
                                          (t) => t.id === unit.unitTypeId
                                        )?.name || 'Unknown'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {formatLKR(unit.monthlyRent)}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                          type="button"
                                          onClick={() => removeQuickUnit(idx)}
                                          className="text-red-600 hover:text-red-900"
                                        >
                                          Remove
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsAddDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit">
                        {editingProperty ? 'Save Changes' : 'Add Property'}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Properties Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {properties.map((property) => (
          <Card key={property.id} className="overflow-hidden flex flex-col">
            {property.imageUrl && (
              <div className="h-48 w-full bg-gray-100 relative">
                <img
                  src={property.imageUrl}
                  alt={property.name}
                  className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
                />
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold shadow-sm">
                  {property.typeName}
                </div>
              </div>
            )}
            <CardHeader className={property.imageUrl ? 'pt-4' : ''}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {!property.imageUrl && (
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <Building2 className="size-5 text-blue-600" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">{property.name}</CardTitle>
                    {!property.imageUrl && (
                      <p className="text-xs text-gray-500 mt-1">
                        {property.typeName}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                    Location
                  </p>
                  <p className="text-sm text-gray-700">
                    {property.propertyNo ? `No. ${property.propertyNo}, ` : ''}
                    {property.street}
                  </p>
                  <p className="text-sm text-gray-500">
                    {property.city}, {property.district}
                  </p>
                </div>

                <div className="pt-3 border-t grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Units</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {getUnitCount(property.id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Available</p>
                    <p className="text-lg font-semibold text-green-600">
                      {
                        units.filter(
                          (u) =>
                            u.propertyId === property.id &&
                            u.status === 'available'
                        ).length
                      }
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-4">
                  <Button
                    className="flex-1"
                    variant={
                      user?.role === 'owner' || user?.role === 'treasurer'
                        ? 'secondary'
                        : 'default'
                    }
                    onClick={() =>
                      user?.role === 'owner' || user?.role === 'treasurer'
                        ? handleViewGallery(property)
                        : handleInterestClick(property)
                    }
                  >
                    {user?.role === 'owner' || user?.role === 'treasurer' ? (
                      <>
                        <Eye className="size-4 mr-2" /> View Gallery
                      </>
                    ) : (
                      <>I'm Interested</>
                    )}
                  </Button>

                  {user?.role === 'owner' && (
                    <>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleEditClick(property)}
                      >
                        <Edit className="size-4" />
                      </Button>
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
            <p className="text-sm text-gray-500 mt-1">
              Add your first property to get started
            </p>
          </CardContent>
        </Card>
      )}

      {/* View Property Details Dialog */}
      <Dialog
        open={!!viewProperty}
        onOpenChange={(open) => !open && setViewProperty(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Property Details</DialogTitle>
          </DialogHeader>
          {viewProperty && (
            <div className="space-y-6 mt-4">
              {/* Large Image View */}
              <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                {viewProperty.imageUrl ? (
                  <img
                    src={viewProperty.imageUrl}
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
                  <h3 className="text-2xl font-bold text-gray-900">
                    {viewProperty.name}
                  </h3>
                  <div className="mt-2 space-y-1 text-gray-600">
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Type:</span>{' '}
                      {viewProperty.typeName}
                    </p>
                    <div>
                      <span className="font-medium text-gray-900">
                        Address:
                      </span>
                      <p className="ml-2">
                        {viewProperty.propertyNo
                          ? `No. ${viewProperty.propertyNo}, `
                          : ''}
                        {viewProperty.street}
                      </p>
                      <p className="ml-2">
                        {viewProperty.city}, {viewProperty.district}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-900 mb-2">
                    Statistics
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Total Units</p>
                      <p className="text-xl font-bold">
                        {getUnitCount(viewProperty.id)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewProperty(null)}>
                  Close
                </Button>
                {user?.role === 'owner' && (
                  <Button
                    onClick={() => {
                      handleEditClick(viewProperty);
                      setViewProperty(null);
                    }}
                  >
                    <Edit className="size-4 mr-2" />
                    Edit Property
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isInterestDialogOpen}
        onOpenChange={setIsInterestDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              I'm Interested in {interestProperty?.name}
            </DialogTitle>
            <p className="text-sm text-gray-500">
              Leave your details and we'll get back to you.
            </p>
          </DialogHeader>

          <Form {...interestForm}>
            <form
              onSubmit={interestForm.handleSubmit(onSubmitInterest)}
              className="space-y-4 mt-4"
            >
              <FormField
                control={interestForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={interestForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="your@email.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={interestForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Sri Lanka)</FormLabel>
                    <FormControl>
                      <Input placeholder="0771234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={interestForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message (Optional)</FormLabel>
                    <FormControl>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="I'm interested in this property..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInterestDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Submit Interest</Button>
              </div>
            </form>
          </Form>
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
                <div
                  key={idx}
                  className="relative aspect-square rounded-lg overflow-hidden border border-gray-100 group"
                >
                  <img
                    src={img.imageUrl}
                    alt={`Gallery ${idx}`}
                    className="w-full h-full object-cover"
                  />
                  {img.isPrimary && (
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
                    <span className="bg-white/90 text-gray-900 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                      View Full
                    </span>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              property and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteProperty}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Image Confirmation Dialog */}
      <AlertDialog
        open={isDeleteImageDialogOpen}
        onOpenChange={setIsDeleteImageDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this image?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteImage}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
