import React, { useState } from 'react';
import { useApp, Tenant } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Mail,
  Phone,
  Home,
  Calendar,
  UserX,
  UserCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChatInterface } from '@/components/common/ChatInterface';
import { TenantDetailsDialog } from '@/components/tenants/TenantDetailsDialog';
import { MessageSquare } from 'lucide-react';

export function TenantsPage() {
  const { tenants, leases, units, properties } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [chatTenantRow, setChatTenantRow] = useState<Tenant | null>(null);
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'inactive'
  >('all');

  const getTenantLease = (tenantId: string) => {
    return leases.find((l) => l.tenantId === tenantId && l.status === 'active');
  };

  const getTenantUnit = (tenantId: string) => {
    const lease = getTenantLease(tenantId);
    return lease ? units.find((u) => u.id === lease.unitId) : null;
  };

  const getTenantProperty = (tenantId: string) => {
    const unit = getTenantUnit(tenantId);
    return unit ? properties.find((p) => p.id === unit.propertyId) : null;
  };

  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.phone.includes(searchTerm);

    if (filterStatus === 'all') return matchesSearch;

    const hasActiveLease = !!getTenantLease(tenant.id);
    if (filterStatus === 'active') return matchesSearch && hasActiveLease;
    if (filterStatus === 'inactive') return matchesSearch && !hasActiveLease;

    return matchesSearch;
  });

  const activeTenants = tenants.filter((t) => !!getTenantLease(t.id));
  const inactiveTenants = tenants.filter((t) => !getTenantLease(t.id));

  const stats = [
    {
      label: 'Total Tenants',
      value: tenants.length,
      icon: Users,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Active Tenants',
      value: activeTenants.length,
      icon: UserCheck,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Inactive Tenants',
      value: inactiveTenants.length,
      icon: UserX,
      color: 'bg-gray-50 text-gray-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Tenants</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage tenant information and profiles
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{stat.label}</p>
                    <p
                      className={`text-2xl font-semibold mt-1 ${stat.color.split(' ')[1]}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                  <Icon
                    className={`size-8 ${stat.color.split(' ')[1]} opacity-20`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <CardTitle>Tenant Directory</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64"
              />
              <div className="flex border rounded-lg">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'active' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterStatus('active')}
                >
                  Active
                </Button>
                <Button
                  variant={filterStatus === 'inactive' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilterStatus('inactive')}
                >
                  Inactive
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const lease = getTenantLease(tenant.id);

                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
                            {tenant.name.charAt(0).toUpperCase()}
                          </div>
                          {tenant.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-1 text-gray-600">
                            <Mail className="size-3" />
                            {tenant.email}
                          </div>
                          <div className="flex items-center gap-1 text-gray-600">
                            <Phone className="size-3" />
                            {tenant.phone}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        {lease ? (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-700"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Calendar className="size-3" />
                          {new Date(tenant.createdAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setChatTenantRow(tenant)}
                            title="Message Tenant"
                          >
                            <MessageSquare className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedTenant(tenant)}
                          >
                            View Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filteredTenants.length === 0 && (
              <div className="py-12 text-center">
                <Users className="size-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No tenants found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchTerm
                    ? 'Try adjusting your search'
                    : 'Convert leads to tenants to get started'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tenant Details Dialog */}

      {/* Tenant Details Dialog */}
      <TenantDetailsDialog
        tenant={selectedTenant}
        isOpen={!!selectedTenant}
        onClose={() => setSelectedTenant(null)}
        leases={leases}
        units={units}
        properties={properties}
      />

      {/* Modern Tenant Chat Dialog */}
      <Dialog
        open={!!chatTenantRow}
        onOpenChange={(open) => !open && setChatTenantRow(null)}
      >
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>Chat with {chatTenantRow?.name}</DialogTitle>
          </DialogHeader>
          <ChatInterface mode="tenant-admin" tenantId={chatTenantRow?.id} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
