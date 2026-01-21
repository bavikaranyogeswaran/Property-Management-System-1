import React, { useState } from 'react';
import { useApp, Tenant, Lease } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Users, FileText, Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

export function TenantsLeasesPage() {
  const { tenants, leases, units, properties, addLease, endLease } = useApp();
  const [isAddLeaseDialogOpen, setIsAddLeaseDialogOpen] = useState(false);
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);
  const [leaseFormData, setLeaseFormData] = useState({
    tenantId: '',
    unitId: '',
    startDate: '',
    endDate: '',
    monthlyRent: '',
  });

  const handleLeaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const unit = units.find(u => u.id === leaseFormData.unitId);
    if (unit?.status === 'occupied') {
      toast.error('This unit is already occupied');
      return;
    }

    addLease({
      ...leaseFormData,
      monthlyRent: parseFloat(leaseFormData.monthlyRent),
      status: 'active',
    });
    
    toast.success('Lease created successfully');
    setIsAddLeaseDialogOpen(false);
    setLeaseFormData({
      tenantId: '',
      unitId: '',
      startDate: '',
      endDate: '',
      monthlyRent: '',
    });
  };

  const handleEndLease = (leaseId: string) => {
    if (confirm('Are you sure you want to end this lease?')) {
      endLease(leaseId);
      toast.success('Lease ended successfully');
    }
  };

  const activeLeases = leases.filter(l => l.status === 'active');
  const endedLeases = leases.filter(l => l.status !== 'active');

  const stats = [
    {
      label: 'Total Tenants',
      value: tenants.length,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Active Leases',
      value: activeLeases.length,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Ended Leases',
      value: endedLeases.length,
      color: 'bg-gray-50 text-gray-700',
    },
    {
      label: 'Available Units',
      value: units.filter(u => u.status === 'available').length,
      color: 'bg-orange-50 text-orange-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Tenants & Leases</h2>
          <p className="text-sm text-gray-500 mt-1">Manage tenants and lease agreements</p>
        </div>
        <Dialog open={isAddLeaseDialogOpen} onOpenChange={setIsAddLeaseDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4 mr-2" />
              Create Lease
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Lease</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleLeaseSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="tenantId">Tenant</Label>
                <Select
                  value={leaseFormData.tenantId}
                  onValueChange={(value) => setLeaseFormData({ ...leaseFormData, tenantId: value })}
                  required
                >
                  <SelectTrigger id="tenantId">
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name} - {tenant.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitId">Unit</Label>
                <Select
                  value={leaseFormData.unitId}
                  onValueChange={(value) => {
                    const unit = units.find(u => u.id === value);
                    setLeaseFormData({
                      ...leaseFormData,
                      unitId: value,
                      monthlyRent: unit ? unit.monthlyRent.toString() : '',
                    });
                  }}
                  required
                >
                  <SelectTrigger id="unitId">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.filter(u => u.status === 'available').map((unit) => {
                      const property = properties.find(p => p.id === unit.propertyId);
                      return (
                        <SelectItem key={unit.id} value={unit.id}>
                          {property?.name} - {unit.unitNumber} (${unit.monthlyRent}/mo)
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={leaseFormData.startDate}
                    onChange={(e) => setLeaseFormData({ ...leaseFormData, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={leaseFormData.endDate}
                    onChange={(e) => setLeaseFormData({ ...leaseFormData, endDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyRent">Monthly Rent ($)</Label>
                <Input
                  id="monthlyRent"
                  type="number"
                  step="0.01"
                  value={leaseFormData.monthlyRent}
                  onChange={(e) => setLeaseFormData({ ...leaseFormData, monthlyRent: e.target.value })}
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddLeaseDialogOpen(false);
                    setLeaseFormData({
                      tenantId: '',
                      unitId: '',
                      startDate: '',
                      endDate: '',
                      monthlyRent: '',
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Create Lease</Button>
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

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="tenants" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList>
                <TabsTrigger value="tenants">
                  <Users className="size-4 mr-2" />
                  Tenants ({tenants.length})
                </TabsTrigger>
                <TabsTrigger value="active-leases">
                  <FileText className="size-4 mr-2" />
                  Active Leases ({activeLeases.length})
                </TabsTrigger>
                <TabsTrigger value="ended-leases">
                  Ended Leases ({endedLeases.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tenants Tab */}
            <TabsContent value="tenants" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Current Unit</TableHead>
                      <TableHead>Lease Status</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((tenant) => {
                      const lease = leases.find(l => l.tenantId === tenant.id && l.status === 'active');
                      const unit = lease ? units.find(u => u.id === lease.unitId) : null;
                      const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
                      
                      return (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">{tenant.name}</TableCell>
                          <TableCell>{tenant.email}</TableCell>
                          <TableCell>{tenant.phone}</TableCell>
                          <TableCell>
                            {unit && property ? (
                              <div className="text-sm">
                                <div>{property.name}</div>
                                <div className="text-gray-500">Unit {unit.unitNumber}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400">No active lease</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {lease ? (
                              <Badge variant="secondary">Active</Badge>
                            ) : (
                              <Badge variant="outline">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>{tenant.createdAt}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {tenants.length === 0 && (
                  <div className="py-12 text-center">
                    <Users className="size-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No tenants yet</p>
                    <p className="text-sm text-gray-500 mt-1">Convert leads to tenants to get started</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Active Leases Tab */}
            <TabsContent value="active-leases" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeLeases.map((lease) => {
                      const tenant = tenants.find(t => t.id === lease.tenantId);
                      const unit = units.find(u => u.id === lease.unitId);
                      const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
                      
                      return (
                        <TableRow key={lease.id}>
                          <TableCell className="font-medium">{tenant?.name}</TableCell>
                          <TableCell>{property?.name}</TableCell>
                          <TableCell>{unit?.unitNumber}</TableCell>
                          <TableCell>{lease.startDate}</TableCell>
                          <TableCell>{lease.endDate}</TableCell>
                          <TableCell>${lease.monthlyRent}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedLease(lease)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleEndLease(lease.id)}
                              >
                                End Lease
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

            {/* Ended Leases Tab */}
            <TabsContent value="ended-leases" className="m-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Monthly Rent</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endedLeases.map((lease) => {
                      const tenant = tenants.find(t => t.id === lease.tenantId);
                      const unit = units.find(u => u.id === lease.unitId);
                      const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
                      
                      return (
                        <TableRow key={lease.id}>
                          <TableCell className="font-medium">{tenant?.name}</TableCell>
                          <TableCell>{property?.name}</TableCell>
                          <TableCell>{unit?.unitNumber}</TableCell>
                          <TableCell>{lease.startDate}</TableCell>
                          <TableCell>{lease.endDate}</TableCell>
                          <TableCell>${lease.monthlyRent}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{lease.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lease Details</DialogTitle>
          </DialogHeader>
          {selectedLease && (() => {
            const tenant = tenants.find(t => t.id === selectedLease.tenantId);
            const unit = units.find(u => u.id === selectedLease.unitId);
            const property = unit ? properties.find(p => p.id === unit.propertyId) : null;
            
            return (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Tenant</p>
                    <p className="font-medium">{tenant?.name}</p>
                    <p className="text-sm text-gray-500">{tenant?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Property</p>
                    <p className="font-medium">{property?.name}</p>
                    <p className="text-sm text-gray-500">Unit {unit?.unitNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Start Date</p>
                    <p className="font-medium">{selectedLease.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">End Date</p>
                    <p className="font-medium">{selectedLease.endDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Monthly Rent</p>
                    <p className="font-medium">${selectedLease.monthlyRent}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <Badge variant={selectedLease.status === 'active' ? 'secondary' : 'outline'}>
                      {selectedLease.status}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
