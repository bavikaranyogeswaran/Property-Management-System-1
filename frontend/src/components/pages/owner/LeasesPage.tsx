import React, { useState } from 'react';
import { useApp, Lease } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Eye, Calendar, DollarSign, Home, User, XCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leaseSchema, type LeaseFormValues } from '@/schemas/ownerSchemas';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export function LeasesPage() {
  const { tenants, leases, units, properties, addLease, endLease } = useApp();
  const [isAddLeaseDialogOpen, setIsAddLeaseDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);

  const leaseForm = useForm<LeaseFormValues>({
    resolver: zodResolver(leaseSchema),
    defaultValues: {
      tenantId: '',
      unitId: '',
      startDate: '',
      endDate: '',
      monthlyRent: 0,
    },
  });

  const onSubmit = async (values: LeaseFormValues) => {
    const unit = units.find(u => u.id === values.unitId);
    if (unit?.status === 'occupied') {
      toast.error('This unit is already occupied');
      return;
    }

    try {
      await addLease({
        ...values,
        monthlyRent: values.monthlyRent,
        status: 'active',
      });

      toast.success('Lease created successfully');
      setIsAddLeaseDialogOpen(false);
      leaseForm.reset();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create lease');
    }
  };

  const activeLeases = leases.filter(l => l.status === 'active');
  const endedLeases = leases.filter(l => l.status !== 'active');

  // ... (keep existing calculations)

  // Calculate expiring soon (within 30 days)
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = activeLeases.filter(lease => {
    const endDate = new Date(lease.endDate);
    return endDate <= thirtyDaysFromNow && endDate >= today;
  });

  const stats = [
    {
      label: 'Total Leases',
      value: leases.length,
      icon: FileText,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Active Leases',
      value: activeLeases.length,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Expiring Soon',
      value: expiringSoon.length,
      icon: Calendar,
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Ended Leases',
      value: endedLeases.length,
      icon: XCircle,
      color: 'bg-gray-50 text-gray-700',
    },
  ];

  const LeaseRow = ({ lease }: { lease: Lease }) => {
    // ... (keep existing LeaseRow component logic)
    const tenant = tenants.find(t => t.id === lease.tenantId);
    const unit = units.find(u => u.id === lease.unitId);
    const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

    // Check if expiring soon
    const endDate = new Date(lease.endDate);
    const isExpiringSoon = lease.status === 'active' && endDate <= thirtyDaysFromNow && endDate >= today;

    return (
      <TableRow key={lease.id} className={isExpiringSoon ? 'bg-orange-50' : ''}>
        <TableCell>
          <div className="flex items-center gap-2">
            <User className="size-4 text-gray-400" />
            <span className="font-medium">{tenant?.name || 'Unknown'}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Home className="size-4 text-gray-400" />
            <div className="text-sm">
              <div className="font-medium">{property?.name || 'Unknown'}</div>
              <div className="text-gray-500">Unit {unit?.unitNumber || 'N/A'}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <Calendar className="size-3 text-gray-400" />
              {lease.startDate}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <Calendar className="size-3 text-gray-400" />
              {lease.endDate}
            </div>
            {isExpiringSoon && (
              <Badge variant="outline" className="text-xs mt-1 border-orange-300 text-orange-700">
                Expiring Soon
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 font-medium">
            <DollarSign className="size-3 text-gray-400" />
            {lease.monthlyRent}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={lease.status === 'active' ? 'secondary' : 'outline'}
            className={lease.status === 'active' ? 'bg-green-100 text-green-700' : ''}
          >
            {lease.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedLease(lease)}
              title="View Details"
            >
              <Eye className="size-4" />
            </Button>
            {lease.status === 'active' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEndLease(lease.id)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                title="End Lease"
              >
                End
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Helper for End Lease (keep outside or inside, reusing existing)
  const handleEndLease = (leaseId: string) => {
    if (confirm('Are you sure you want to end this lease? This action will mark the lease as ended and free up the unit.')) {
      endLease(leaseId);
      toast.success('Lease ended successfully');
      setSelectedLease(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Lease Management</h2>
          <p className="text-sm text-gray-500 mt-1">Manage rental agreements and lease contracts</p>
        </div>
        <Dialog open={isAddLeaseDialogOpen} onOpenChange={setIsAddLeaseDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => leaseForm.reset()}>
              <Plus className="size-4 mr-2" />
              Create Lease
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Lease</DialogTitle>
            </DialogHeader>
            <Form {...leaseForm}>
              <form onSubmit={leaseForm.handleSubmit(onSubmit)} className="space-y-4 mt-4">

                <FormField
                  control={leaseForm.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tenant" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tenants.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id}>
                              {tenant.name} - {tenant.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={leaseForm.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          // Auto-fill rent
                          const unit = units.find(u => u.id === val);
                          if (unit) {
                            leaseForm.setValue('monthlyRent', unit.monthlyRent);
                          }
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units.filter(u => u.status === 'available').map((unit) => {
                            const property = properties.find(p => p.id === unit.propertyId);
                            return (
                              <SelectItem key={unit.id} value={unit.id}>
                                {property?.name} - {unit.unitNumber} (LKR {unit.monthlyRent}/mo)
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={leaseForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={leaseForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={leaseForm.control}
                  name="monthlyRent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Rent (LKR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddLeaseDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Create Lease</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}>
                      {stat.value}
                    </p>
                  </div>
                  <Icon className={`size-8 ${stat.color.split(' ')[1]} opacity-20`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Leases Table */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="active" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="active">
                  <FileText className="size-4 mr-2" />
                  Active Leases ({activeLeases.length})
                </TabsTrigger>
                <TabsTrigger value="expiring">
                  <Calendar className="size-4 mr-2" />
                  Expiring Soon ({expiringSoon.length})
                </TabsTrigger>
                <TabsTrigger value="ended">
                  <XCircle className="size-4 mr-2" />
                  Ended Leases ({endedLeases.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Active Leases Tab */}
            <TabsContent value="active" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {activeLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No active leases</p>
                    <p className="text-sm text-gray-500 mt-1">Create a lease to get started</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Expiring Soon Tab */}
            <TabsContent value="expiring" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expiringSoon.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {expiringSoon.length === 0 && (
                  <div className="py-12 text-center">
                    <Calendar className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No leases expiring soon</p>
                    <p className="text-sm text-gray-500 mt-1">Leases expiring within 30 days will appear here</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Ended Leases Tab */}
            <TabsContent value="ended" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property & Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endedLeases.map((lease) => (
                      <LeaseRow key={lease.id} lease={lease} />
                    ))}
                  </TableBody>
                </Table>
                {endedLeases.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No ended leases</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Lease Details Dialog */}
      <Dialog open={!!selectedLease} onOpenChange={(open) => !open && setSelectedLease(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lease Agreement Details</DialogTitle>
          </DialogHeader>
          {selectedLease && (() => {
            const tenant = tenants.find(t => t.id === selectedLease.tenantId);
            const unit = units.find(u => u.id === selectedLease.unitId);
            const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

            // Calculate lease duration
            const startDate = new Date(selectedLease.startDate);
            const endDate = new Date(selectedLease.endDate);
            const durationMonths = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30));

            return (
              <div className="space-y-6 mt-4">
                {/* Lease Status */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Lease Status</p>
                    <p className="text-lg font-semibold">{selectedLease.status}</p>
                  </div>
                  <Badge
                    variant={selectedLease.status === 'active' ? 'secondary' : 'outline'}
                    className={selectedLease.status === 'active' ? 'bg-green-100 text-green-700 text-base px-4 py-2' : 'text-base px-4 py-2'}
                  >
                    {selectedLease.status}
                  </Badge>
                </div>

                {/* Parties */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <User className="size-4" />
                      Tenant
                    </h4>
                    <p className="font-medium">{tenant?.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{tenant?.email}</p>
                    <p className="text-sm text-gray-600">{tenant?.phone}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Home className="size-4" />
                      Property
                    </h4>
                    <p className="font-medium">{property?.name}</p>
                    <p className="text-sm text-gray-600 mt-1">Unit {unit?.unitNumber}</p>
                    <p className="text-sm text-gray-600">{unit?.type}</p>
                  </div>
                </div>

                {/* Lease Terms */}
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-3">Lease Terms</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Start Date</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="size-4 text-gray-400" />
                        {selectedLease.startDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">End Date</p>
                      <p className="font-medium flex items-center gap-1">
                        <Calendar className="size-4 text-gray-400" />
                        {selectedLease.endDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Lease Duration</p>
                      <p className="font-medium">{durationMonths} months</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Monthly Rent</p>
                      <p className="font-medium flex items-center gap-1">
                        <DollarSign className="size-4 text-gray-400" />
                        {selectedLease.monthlyRent}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {selectedLease.status === 'active' && (
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="destructive"
                      onClick={() => handleEndLease(selectedLease.id)}
                    >
                      <XCircle className="size-4 mr-2" />
                      End Lease
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
