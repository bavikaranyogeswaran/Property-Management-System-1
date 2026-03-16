import React, { useState } from 'react';
import { useApp, Unit } from '@/app/context/AppContext';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Home, Plus, Edit, Trash2, Filter, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { MultiImageUpload } from '@/components/ui/multi-image-upload';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { unitSchema, type UnitFormValues } from '@/schemas/ownerSchemas';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function UnitsPage() {
  const {
    units,
    properties,
    unitTypes,
    leases,
    addUnit,
    updateUnit,
    deleteUnit,
    uploadUnitImages,
    getUnitImages,
    deleteUnitImage,
    setUnitPrimaryImage,
  } = useApp();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const unitForm = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      propertyId: '',
      unitNumber: '',
      unitTypeId: 0,
      monthlyRent: 0,
      status: 'available',
    },
  });

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [viewUnit, setViewUnit] = useState<Unit | null>(null);
  const [viewUnitImages, setViewUnitImages] = useState<any[]>([]);
  const [existingImages, setExistingImages] = useState<any[]>([]);

  // Deletion States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<string | null>(null);
  const [isDeleteImageDialogOpen, setIsDeleteImageDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<any | null>(null);

  // Fetch images when viewing a unit
  React.useEffect(() => {
    if (viewUnit) {
      setViewUnitImages([]);
      getUnitImages(viewUnit.id)
        .then((images) => {
          if (images) setViewUnitImages(images);
        })
        .catch((err) => console.error(err));
    }
  }, [viewUnit, getUnitImages]);

  const handleImagesChange = (images: { file: File; isPrimary: boolean }[]) => {
    const files = images.map((img) => img.file);
    const primaryIndex = images.findIndex((img) => img.isPrimary);
    setUploadFiles(files);
    setPrimaryImageIndex(primaryIndex >= 0 ? primaryIndex : 0);
  };

  const onSubmit = async (values: UnitFormValues) => {
    try {
      // Derive type name from ID
      const unitType = unitTypes.find((t) => t.type_id === values.unitTypeId);
      const typeName = unitType?.name || '';

      if (editingUnit) {
        // Update unit text fields
        await updateUnit(editingUnit.id, {
          ...values,
          type: typeName,
          monthlyRent: values.monthlyRent,
          image: editingUnit.image,
        });

        // Upload new images if any
        if (uploadFiles.length > 0) {
          await uploadUnitImages(editingUnit.id, uploadFiles);
        }

        toast.success('Unit updated successfully');
        setEditingUnit(null);
        setIsAddDialogOpen(false); // Close shared dialog
      } else {
        const newUnit = await addUnit({
          ...values,
          type: typeName,
          monthlyRent: values.monthlyRent,
          image: undefined,
        });

        if (newUnit && uploadFiles.length > 0) {
          await uploadUnitImages(newUnit.id, uploadFiles);
        }

        toast.success('Unit added successfully');
        setIsAddDialogOpen(false);
      }

      unitForm.reset();
      setUploadFiles([]);
      setPrimaryImageIndex(0);
      setExistingImages([]);
    } catch (error: any) {
      console.error('Failed to save unit:', error);
      let msg = 'Failed to save unit';
      if (error.response?.data?.error) {
        msg = error.response.data.error;
      } else if (error.message) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      }
      toast.error(`Error: ${msg}`);
    }
  };

  const handleRemoveExistingImage = (image: any) => {
    if (!editingUnit) return;
    setImageToDelete(image);
    setIsDeleteImageDialogOpen(true);
  };

  const confirmDeleteImage = async () => {
    if (!editingUnit || !imageToDelete) return;
    try {
      await deleteUnitImage(editingUnit.id, imageToDelete.id);
      // Refresh images
      const images = await getUnitImages(editingUnit.id);
      setExistingImages(
        images.map((img: any) => ({
          id: img.image_id?.toString() || img.id?.toString(),
          url: img.image_url,
          isPrimary: Boolean(img.is_primary),
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
    if (!editingUnit) return;
    try {
      await setUnitPrimaryImage(editingUnit.id, image.id);
      // Refresh images
      const images = await getUnitImages(editingUnit.id);
      setExistingImages(
        images.map((img: any) => ({
          id: img.image_id?.toString() || img.id?.toString(),
          url: img.image_url,
          isPrimary: Boolean(img.is_primary),
        }))
      );
      toast.success('Primary image updated');
    } catch (e) {
      toast.error('Failed to set primary image');
    }
  };

  const handleAddClick = () => {
    setEditingUnit(null);
    unitForm.reset({
      propertyId: '',
      unitNumber: '',
      unitTypeId: 0,
      monthlyRent: 0,
      status: 'available',
    });
    setExistingImages([]);
    setUploadFiles([]);
    setIsAddDialogOpen(true);
  };

  const handleEditClick = async (unit: Unit) => {
    setEditingUnit(unit);
    unitForm.reset({
      propertyId: unit.propertyId,
      unitNumber: unit.unitNumber,
      unitTypeId: unit.unitTypeId,
      monthlyRent: Number(unit.monthlyRent),
      status: unit.status as any,
    });
    setUploadFiles([]);
    setPrimaryImageIndex(0);
    setExistingImages([]);

    setIsAddDialogOpen(true); // Reuse Add Dialog logic

    try {
      const images = await getUnitImages(unit.id);
      if (images) {
        setExistingImages(
          images.map((img: any) => ({
            id: img.image_id?.toString() || img.id?.toString(),
            url: img.image_url || img.url,
            isPrimary: Boolean(img.is_primary),
          }))
        );
      }
    } catch (e) {
      console.error('Failed to load images', e);
      toast.error('Failed to load unit images');
    }
  };

  const handleDelete = (id: string) => {
    const unit = units.find((u) => u.id === id);
    if (unit?.status === 'occupied') {
      toast.error('Cannot delete occupied unit');
      return;
    }

    setUnitToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUnit = async () => {
    if (!unitToDelete) return;
    try {
      await deleteUnit(unitToDelete);
      toast.success('Unit deleted successfully');
    } catch (error) {
      toast.error('Failed to delete unit');
    } finally {
      setIsDeleteDialogOpen(false);
      setUnitToDelete(null);
    }
  };

  const filteredUnits = units.filter((unit) => {
    if (filterProperty !== 'all' && unit.propertyId !== filterProperty)
      return false;
    if (filterStatus !== 'all' && unit.status !== filterStatus) return false;
    return true;
  });

  const getStatusBadge = (status: Unit['status']) => {
    const variants: Record<
      Unit['status'],
      {
        variant: 'default' | 'secondary' | 'destructive' | 'outline';
        label: string;
      }
    > = {
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
      value: units.filter((u) => u.status === 'occupied').length,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Available',
      value: units.filter((u) => u.status === 'available').length,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Maintenance',
      value: units.filter((u) => u.status === 'maintenance').length,
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

        {/* Add/Edit Shared Dialog */}
        <>
          <Button onClick={handleAddClick}>
            <Plus className="size-4 mr-2" />
            Add Unit
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingUnit ? 'Edit Unit' : 'Add New Unit'}
                </DialogTitle>
              </DialogHeader>
              <Form {...unitForm}>
                <form
                  onSubmit={unitForm.handleSubmit(onSubmit)}
                  className="space-y-4 mt-4"
                >
                  <FormField
                    control={unitForm.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Property</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select property" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {properties.map((prop) => (
                              <SelectItem key={prop.id} value={prop.id}>
                                {prop.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={unitForm.control}
                    name="unitNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Number</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., A101" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={unitForm.control}
                    name="unitTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Type</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(parseInt(val));
                            // We don't need to manually set 'type' name string here, backend or context likely handles it,
                            // or we just need the ID. Schema only asks for unitTypeId.
                            // Wait, schema has strict validation.
                          }}
                          value={field.value?.toString()}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select unit type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unitTypes.map((type) => (
                              <SelectItem
                                key={type.type_id}
                                value={type.type_id.toString()}
                              >
                                {type.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={unitForm.control}
                    name="monthlyRent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Rent (LKR)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="e.g., 1200"
                            {...field}
                            onChange={(e) =>
                              field.onChange(e.target.valueAsNumber)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={unitForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="occupied">Occupied</SelectItem>
                            <SelectItem value="maintenance">
                              Maintenance
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <MultiImageUpload
                      maxImages={10}
                      onImagesChange={handleImagesChange}
                      existingImages={existingImages}
                      onRemoveExisting={handleRemoveExistingImage}
                      onSetPrimaryExisting={handleSetPrimaryExistingImage}
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingUnit ? 'Save Changes' : 'Add Unit'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                  <TableHead className="w-[80px]">Image</TableHead>
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
                  const property = properties.find(
                    (p) => p.id === unit.propertyId
                  );
                  const statusBadge = getStatusBadge(unit.status);
                  return (
                    <TableRow key={unit.id}>
                      <TableCell>
                        <div className="size-10 rounded bg-gray-100 overflow-hidden">
                          {unit.image ? (
                            <img
                              src={unit.image}
                              alt={unit.unitNumber}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <Home className="size-5" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {unit.unitNumber}
                      </TableCell>
                      <TableCell>{property?.name}</TableCell>
                      <TableCell>{unit.type}</TableCell>
                      <TableCell>LKR {unit.monthlyRent}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge.variant}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setViewUnit(unit)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditClick(unit)}
                          >
                            <Edit className="size-4" />
                          </Button>
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
                {units.length === 0
                  ? 'Add your first unit to get started'
                  : 'Try adjusting your filters'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Unit Details Dialog */}
      <Dialog
        open={!!viewUnit}
        onOpenChange={(open) => !open && setViewUnit(null)}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Unit Details</DialogTitle>
          </DialogHeader>
          {viewUnit && (
            <div className="space-y-6 mt-4">
              {/* Large Image View */}
              <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border">
                {viewUnit.image ? (
                  <img
                    src={viewUnit.image}
                    alt={viewUnit.unitNumber}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                    <Home className="size-16 mb-2 opacity-20" />
                    <p>No image available</p>
                  </div>
                )}
              </div>

              {viewUnitImages.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-sm text-gray-500 uppercase tracking-wider">
                    Gallery
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {viewUnitImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="aspect-square rounded-md overflow-hidden bg-gray-100 border"
                      >
                        <img
                          src={img.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">
                    Unit {viewUnit.unitNumber}
                  </h3>
                  <div className="mt-2 space-y-1 text-gray-600">
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        Property:
                      </span>
                      {
                        properties.find((p) => p.id === viewUnit.propertyId)
                          ?.name
                      }
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Type:</span>{' '}
                      {viewUnit.type}
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">Rent:</span>{' '}
                      LKR {viewUnit.monthlyRent}/month
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-900 mb-2">Status</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadge(viewUnit.status).variant}>
                      {getStatusBadge(viewUnit.status).label}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewUnit(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    if (viewUnit) {
                      handleEditClick(viewUnit);
                      setViewUnit(null);
                    }
                  }}
                >
                  <Edit className="size-4 mr-2" />
                  Edit Unit
                </Button>
              </div>
            </div>
          )}
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
              unit and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteUnit}
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
