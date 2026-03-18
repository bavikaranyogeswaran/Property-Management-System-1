import React, { useState } from 'react';
import { useApp, Lease } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Eye,
  Calendar,
  DollarSign,
  Home,
  User,
  XCircle,
  CheckCircle,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import apiClient from '@/services/api';

// ============================================================================
//  LEASES PAGE (The Contract Filing Cabinet)
// ============================================================================
//  This page manages all the Rental Agreements.
//  It tracks who is staying where, when their contract ends, and if they have paid their deposit.
// ============================================================================

export function LeasesPage() {
  const {
    tenants,
    leases,
    units,
    properties,
    endLease,
    renewLease,
    refundDeposit,
    approveRefund,
    disputeRefund,
    updateLeaseDocument,
  } = useApp();
  const { user } = useAuth();
  const [selectedLease, setSelectedLease] = useState<Lease | null>(null);


  const handleDocumentUpdate = async (leaseId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || !e.target.files[0]) return;
      
      const loadingToastId = toast.loading("Uploading document...");
      
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      
      const uploadRes = await apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      await updateLeaseDocument(leaseId, uploadRes.data.url);
      
      // Update selected lease state so modal reflects it directly without closing
      setSelectedLease((prev) => prev ? { ...prev, documentUrl: uploadRes.data.url } : null);
      
      toast.dismiss(loadingToastId);
    } catch(err) {
      toast.dismiss();
      toast.error('Failed to upload document');
    }
  };

  const activeLeases = leases.filter((l) => l.status === 'active');
  const endedLeases = leases.filter((l) => l.status !== 'active');

  // ... (keep existing calculations)

  // Calculate expiring soon (within 30 days)
  const today = new Date();
  const thirtyDaysFromNow = new Date(
    today.getTime() + 30 * 24 * 60 * 60 * 1000
  );
  const expiringSoon = activeLeases.filter((lease) => {
    if (!lease.endDate) return false;
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
    const tenant = tenants.find((t) => t.id === lease.tenantId);
    const unit = units.find((u) => u.id === lease.unitId);
    const property = unit
      ? properties.find((p) => p.id === unit.propertyId)
      : null;

    // Check if expiring soon
    let isExpiringSoon = false;
    if (lease.status === 'active' && lease.endDate) {
      const endDate = new Date(lease.endDate);
      isExpiringSoon = endDate <= thirtyDaysFromNow && endDate >= today;
    }

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
              <div className="text-gray-500">
                Unit {unit?.unitNumber || 'N/A'}
              </div>
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
              <Badge
                variant="outline"
                className="text-xs mt-1 border-orange-300 text-orange-700"
              >
                Expiring Soon
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 font-medium">
            <span className="text-xs text-gray-500">LKR</span>
            {lease.monthlyRent}
          </div>
        </TableCell>
        <TableCell>
          <Badge
            variant={lease.status === 'active' ? 'secondary' : 'outline'}
            className={
              lease.status === 'active' ? 'bg-green-100 text-green-700' : ''
            }
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
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenewLeaseId(lease.id);
                    setRenewDate(
                      lease.endDate 
                        ? new Date(lease.endDate).toISOString().split('T')[0]
                        : new Date().toISOString().split('T')[0]
                    ); 
                    setRenewRent(lease.monthlyRent.toString());
                  }}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title="Renew Lease"
                >
                  <Calendar className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEndLease(lease.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="End Lease"
                >
                  <XCircle className="size-4" />
                </Button>
              </>
            )}

            {/* Refund / Approval Actions */}
            {(lease.status === 'active' || lease.status === 'ended') && lease.depositStatus !== 'refunded' && (
              <>
                {((user?.role === 'treasurer') || (user?.role === 'owner' && ['paid', 'partially_refunded'].includes(lease.depositStatus || ''))) &&
                  !['awaiting_approval', 'disputed'].includes(lease.depositStatus || '') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefundLeaseId(lease.id);
                        setRefundType('request');
                      }}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      title="Request Refund / Offset"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  )}

                {user?.role === 'owner' && lease.depositStatus === 'awaiting_approval' && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefundLeaseId(lease.id);
                        setRefundType('approve');
                      }}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      title="Approve Refund"
                    >
                      <CheckCircle className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRefundLeaseId(lease.id);
                        setRefundType('dispute');
                      }}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      title="Dispute Refund"
                    >
                      <AlertCircle className="size-4" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Helper for End Lease - Trigger Dialog
  const handleEndLease = (leaseId: string) => {
    setEndLeaseId(leaseId);
  };

  const onEndLeaseClick = (leaseId: string) => {
    setEndLeaseId(leaseId);
  };

  const confirmEndLease = async () => {
    if (endLeaseId) {
      try {
        await endLease(endLeaseId);
        setSelectedLease(null);
        setEndLeaseId(null);
      } catch (e) {
        // Error toast is handled by context
      }
    }
  };

  // End Lease State
  const [endLeaseId, setEndLeaseId] = useState<string | null>(null);

  // Renewal State
  const [renewLeaseId, setRenewLeaseId] = useState<string | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [renewRent, setRenewRent] = useState('');

  // Refund State
  const [refundLeaseId, setRefundLeaseId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNotes, setRefundNotes] = useState('');
  const [refundType, setRefundType] = useState<'request' | 'approve' | 'dispute'>('request');

  const handleRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewLeaseId) return;
    try {
      await renewLease(
        renewLeaseId,
        renewDate,
        renewRent ? parseFloat(renewRent) : undefined
      );
      setRenewLeaseId(null);
      setRenewDate('');
      setRenewRent('');
    } catch (e) {
      // toast handled in context
    }
  };

  const handleRefundAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundLeaseId) return;
    try {
      if (refundType === 'request') {
        await refundDeposit(refundLeaseId, parseFloat(refundAmount), refundNotes);
      } else if (refundType === 'approve') {
        await approveRefund(refundLeaseId);
      } else if (refundType === 'dispute') {
        await disputeRefund(refundLeaseId, refundNotes);
      }
      setRefundLeaseId(null);
      setRefundAmount('');
      setRefundNotes('');
      setRefundType('request');
    } catch (e) {
      // toast handled in context
    }
  };

  return (
    <div className="space-y-6">
      {/* ... existing header ... */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Lease Management
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage rental agreements and lease contracts
          </p>
        </div>
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
                    <p className="text-sm text-gray-500 mt-1">
                      Create a lease to get started
                    </p>
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
                    <p className="text-sm text-gray-500 mt-1">
                      Leases expiring within 30 days will appear here
                    </p>
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
      <Dialog
        open={!!selectedLease}
        onOpenChange={(open) => !open && setSelectedLease(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lease Agreement Details</DialogTitle>
          </DialogHeader>
          {selectedLease &&
            (() => {
              const tenant = tenants.find(
                (t) => t.id === selectedLease.tenantId
              );
              const unit = units.find((u) => u.id === selectedLease.unitId);
              const property = unit
                ? properties.find((p) => p.id === unit.propertyId)
                : null;

              // Calculate lease duration
              const startDate = new Date(selectedLease.startDate);
              let durationMonths: number | null = null;
              
              if (selectedLease.endDate) {
                const endDate = new Date(selectedLease.endDate);
                durationMonths = Math.round(
                  (endDate.getTime() - startDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 30)
                );
              }

              return (
                <div className="space-y-6 mt-4">
                  {/* Lease Status */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-600">Lease Status</p>
                      <p className="text-lg font-semibold">
                        {selectedLease.status}
                      </p>
                    </div>
                    <Badge
                      variant={
                        selectedLease.status === 'active'
                          ? 'secondary'
                          : 'outline'
                      }
                      className={
                        selectedLease.status === 'active'
                          ? 'bg-green-100 text-green-700 text-base px-4 py-2'
                          : 'text-base px-4 py-2'
                      }
                    >
                      {selectedLease.status}
                    </Badge>
                  </div>

                  {/* Deposit Info */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-600">Deposit Status</p>
                      <p className="text-lg font-semibold flex items-center gap-2">
                        {selectedLease.depositStatus?.replace('_', ' ')}
                        {selectedLease.depositStatus === 'awaiting_approval' && (
                           <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded">Action Required</span>
                        )}
                      </p>
                    </div>
                    {(selectedLease.depositStatus === 'awaiting_approval' || selectedLease.depositStatus === 'disputed') && (
                      <div className="text-right">
                         <p className="text-sm text-gray-600">Proposed Refund</p>
                         <p className="text-lg font-semibold text-orange-600">LKR {selectedLease.proposedRefundAmount}</p>
                      </div>
                    )}
                  </div>

                  {(selectedLease.refundNotes) && (
                    <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-900">
                      <strong>Notes:</strong> {selectedLease.refundNotes}
                    </div>
                  )}

                  {/* Parties */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <User className="size-4" />
                        Tenant
                      </h4>
                      <p className="font-medium">{tenant?.name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        {tenant?.email}
                      </p>
                      <p className="text-sm text-gray-600">{tenant?.phone}</p>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Home className="size-4" />
                        Property
                      </h4>
                      <p className="font-medium">{property?.name}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Unit {unit?.unitNumber}
                      </p>
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
                        <p className="font-medium">{durationMonths !== null ? `${durationMonths} months` : 'Periodic (Indefinite)'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Monthly Rent</p>
                        <p className="font-medium flex items-center gap-1">
                          <span className="text-gray-500">LKR</span>
                          {selectedLease.monthlyRent}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Document View */}
                  <div className="border rounded-lg p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className={`size-4 ${selectedLease.documentUrl ? 'text-blue-600' : 'text-gray-400'}`} />
                        {selectedLease.documentUrl ? 'Lease Document Attached' : 'No Lease Document Attached'}
                      </div>
                      
                      {selectedLease.documentUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedLease.documentUrl) {
                              window.open(selectedLease.documentUrl, '_blank');
                            }
                          }}
                        >
                          View Document
                        </Button>
                      )}
                    </div>

                    {selectedLease.status === 'active' && (
                      <div className="pt-2 border-t">
                        <label className="flex items-center justify-center w-full px-4 py-2 bg-white text-blue-500 hover:text-blue-600 border border-blue-200 hover:border-blue-300 rounded-md shadow-sm text-sm font-medium cursor-pointer transition-colors">
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            className="hidden"
                            onChange={(e) => handleDocumentUpdate(selectedLease.id, e)}
                          />
                          {selectedLease.documentUrl ? 'Update Document' : 'Upload Document'}
                        </label>
                      </div>
                    )}
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

      {/* Renew Lease Dialog */}
      <Dialog
        open={!!renewLeaseId}
        onOpenChange={(open) => !open && setRenewLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renew Lease</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenew} className="space-y-4">
            <div className="space-y-2">
              <Label>New End Date</Label>
              <Input
                type="date"
                value={renewDate}
                onChange={(e) => setRenewDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>New Monthly Rent (LKR) (Optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={renewRent}
                onChange={(e) => setRenewRent(e.target.value)}
                placeholder="Leave empty to keep current rent"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenewLeaseId(null)}
              >
                Cancel
              </Button>
              <Button type="submit">Renew Lease</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* End Lease Confirmation Dialog */}
      <Dialog
        open={!!endLeaseId}
        onOpenChange={(open) => !open && setEndLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End Lease</DialogTitle>
            <p className="text-sm text-gray-500 mt-2">
              Are you sure you want to end this lease? This action will mark the
              lease as ended and free up the unit.
            </p>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEndLeaseId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmEndLease}
            >
              End Lease
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Deposit / Action Dialog */}
      <Dialog
        open={!!refundLeaseId}
        onOpenChange={(open) => !open && setRefundLeaseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {refundType === 'request' && 'Request Security Deposit Refund'}
              {refundType === 'approve' && 'Approve Refund Request'}
              {refundType === 'dispute' && 'Dispute Refund Request'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRefundAction} className="space-y-4">
            {refundType === 'request' && (
              <>
                <div className="space-y-2">
                  <Label>Refund Amount (LKR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the amount to be returned to the tenant. (Max:{' '}
                    {leases.find((l) => l.id === refundLeaseId)?.securityDeposit || 0}
                    )
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Notes / Reason for Deduction</Label>
                  <Input
                    type="text"
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder="E.g., Cleaning fee deducted"
                  />
                </div>
              </>
            )}

            {refundType === 'approve' && (
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg text-sm">
                <p>Are you sure you want to approve this refund? This action will generate the necessary ledger entries and cannot be easily undone.</p>
              </div>
            )}

            {refundType === 'dispute' && (
              <div className="space-y-2">
                <Label>Dispute Reason / Notes</Label>
                <Input
                  type="text"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  required
                  placeholder="Reason for disputing"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundLeaseId(null)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                variant={refundType === 'dispute' ? 'destructive' : 'default'}
              >
                {refundType === 'request' && 'Submit Request'}
                {refundType === 'approve' && 'Approve & Finalize'}
                {refundType === 'dispute' && 'Mark as Disputed'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
