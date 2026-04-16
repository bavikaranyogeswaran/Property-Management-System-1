import React from 'react';
import { useApp, Lease } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Calendar,
  Home,
  DollarSign,
  Clock,
  Shield,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLKR } from '@/utils/formatters';

export function TenantLeasePage() {
  const { user, activeLeaseId, tenantLeases: leasesFromAuth } = useAuth();
  const {
    leases,
    units,
    properties,
    updateNoticeStatus,
    renewalRequests,
    acknowledgeRefund,
    disputeRefund,
  } = useApp();

  // Multi-Unit Logic (E19): Use active lease from context
  const tenantLease = leasesFromAuth.find((l) => l.id === activeLeaseId);
  const tenantUnit = tenantLease
    ? units.find((u) => u.id === tenantLease.unitId)
    : null;

  // Separate active and past leases
  const activeLeases = leases.filter(
    (l) =>
      (l.status === 'active' || l.status === 'pending') &&
      l.id === activeLeaseId
  );
  const pastLeases = leases.filter(
    (l) => l.status !== 'active' && leasesFromAuth.some((tl) => tl.id === l.id)
  );

  // Helper: get unit and property info for a lease
  const getLeaseDetails = (lease: Lease) => {
    const unit = units.find((u) => u.id === lease.unitId);
    const property = unit
      ? properties.find((p) => p.id === unit.propertyId)
      : null;
    return { unit, property };
  };

  // Helper: calculate lease timeline progress
  const getLeaseProgress = (lease: Lease) => {
    if (!lease.endDate) {
      return { progress: 0, daysRemaining: Infinity, totalDays: 0 };
    }

    const start = new Date(lease.startDate).getTime();
    const end = new Date(lease.endDate).getTime();
    const now = Date.now();

    if (now <= start)
      return {
        progress: 0,
        daysRemaining: Math.ceil((end - start) / 86400000),
        totalDays: Math.ceil((end - start) / 86400000),
      };
    if (now >= end)
      return {
        progress: 100,
        daysRemaining: 0,
        totalDays: Math.ceil((end - start) / 86400000),
      };

    const totalDays = Math.ceil((end - start) / 86400000);
    const elapsed = Math.ceil((now - start) / 86400000);
    const daysRemaining = totalDays - elapsed;
    const progress = Math.round((elapsed / totalDays) * 100);

    return { progress, daysRemaining, totalDays };
  };

  // Helper: format date nicely
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Ongoing';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-amber-100 text-amber-800',
    ended: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const depositStatusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    awaiting_approval: 'bg-yellow-100 text-yellow-800',
    awaiting_acknowledgment: 'bg-blue-100 text-blue-800',
    disputed: 'bg-red-100 text-red-800',
    partially_refunded: 'bg-blue-100 text-blue-800',
    refunded: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">My Lease</h2>
        <p className="text-sm text-gray-500 mt-1">
          View your lease details, deposit status, and contract information
        </p>
      </div>

      {/* No Active Lease */}
      {activeLeases.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-900">
                  No Current Lease Found
                </p>
                <p className="text-sm text-yellow-700">
                  You don't currently have an active or upcoming lease. Contact
                  your property owner for more information.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Leases Details */}
      {activeLeases.map((currentLease) => {
        const { unit, property } = getLeaseDetails(currentLease);
        const { progress, daysRemaining, totalDays } =
          getLeaseProgress(currentLease);

        return (
          <div
            key={currentLease.id}
            className="space-y-6 pt-6 border-t first:pt-0 first:border-0 border-gray-200"
          >
            {/* Lease Timeline Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-5 text-blue-600" />
                    Lease Timeline ({unit?.unitNumber || 'Unknown Unit'})
                  </CardTitle>
                  <Badge
                    className={
                      statusColors[currentLease.status] ||
                      'bg-gray-100 text-gray-800'
                    }
                  >
                    {currentLease.status.charAt(0).toUpperCase() +
                      currentLease.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{formatDate(currentLease.startDate)}</span>
                    <span>{formatDate(currentLease.endDate)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        daysRemaining <= 30
                          ? 'bg-red-500'
                          : daysRemaining <= 90
                            ? 'bg-yellow-500'
                            : 'bg-blue-600'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {daysRemaining === Infinity
                        ? 'Periodic'
                        : `${progress}% complete`}
                    </span>
                    <span
                      className={`font-medium ${
                        daysRemaining <= 30
                          ? 'text-red-600'
                          : daysRemaining <= 90
                            ? 'text-yellow-600'
                            : 'text-gray-700'
                      }`}
                    >
                      {daysRemaining === Infinity
                        ? 'No fixed end date'
                        : `${daysRemaining} days remaining`}
                    </span>
                  </div>
                  {daysRemaining <= 30 && daysRemaining > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                      <AlertTriangle className="size-4 text-red-600 flex-shrink-0" />
                      <p className="text-sm text-red-700">
                        Your lease is expiring soon. Contact your property owner
                        about renewal.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Renewal Intent Section */}
            {daysRemaining <= 90 && currentLease.status === 'active' && (
              <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="size-5 text-blue-600" />
                    <CardTitle className="text-lg text-blue-900">
                      Lease Renewal Intent
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700">
                      {daysRemaining === Infinity
                        ? 'Your periodic lease is ongoing. Let us know if your plans change.'
                        : `Your lease is ending in ${daysRemaining} days. Please let us know your future plans.`}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        size="sm"
                        variant={
                          currentLease.noticeStatus === 'renewing'
                            ? 'default'
                            : 'outline'
                        }
                        className={
                          currentLease.noticeStatus === 'renewing'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : ''
                        }
                        onClick={() =>
                          updateNoticeStatus(currentLease.id, 'renewing')
                        }
                      >
                        {currentLease.noticeStatus === 'renewing' && (
                          <Check className="size-4 mr-2" />
                        )}
                        I Plan to Renew
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          currentLease.noticeStatus === 'vacating'
                            ? 'default'
                            : 'outline'
                        }
                        className={
                          currentLease.noticeStatus === 'vacating'
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : ''
                        }
                        onClick={() =>
                          updateNoticeStatus(currentLease.id, 'vacating')
                        }
                      >
                        {currentLease.noticeStatus === 'vacating' && (
                          <Check className="size-4 mr-2" />
                        )}
                        I Will Vacate
                      </Button>
                      {currentLease.noticeStatus &&
                        currentLease.noticeStatus !== 'undecided' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-500 hover:text-gray-700"
                            onClick={() =>
                              updateNoticeStatus(currentLease.id, 'undecided')
                            }
                          >
                            Clear Selection
                          </Button>
                        )}
                    </div>
                    {currentLease.noticeStatus === 'renewing' && (
                      <div className="space-y-3">
                        <p className="text-xs text-green-700 font-medium">
                          ✓ We've noted your interest in renewing.
                        </p>
                        {(() => {
                          const request = renewalRequests.find(
                            (r) => r.leaseId === currentLease.id
                          );
                          if (request) {
                            return (
                              <div className="p-3 bg-white border border-blue-100 rounded-md shadow-sm space-y-2">
                                <div className="flex justify-between items-start">
                                  <p className="text-sm font-semibold text-blue-900">
                                    Renewal Request Status
                                  </p>
                                  <Badge
                                    variant="outline"
                                    className="bg-blue-50 text-blue-700 border-blue-200"
                                  >
                                    {request.status.toUpperCase()}
                                  </Badge>
                                </div>
                                {request.proposedMonthlyRent ? (
                                  <div className="text-sm text-gray-700">
                                    <p>
                                      Proposed Rent:{' '}
                                      <span className="font-bold text-emerald-600">
                                        {formatLKR(request.proposedMonthlyRent)}
                                      </span>
                                    </p>
                                    <p>
                                      Proposed End Date:{' '}
                                      <span className="font-medium">
                                        {formatDate(request.proposedEndDate)}
                                      </span>
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-500 italic">
                                    Owner is reviewing your renewal request.
                                    You'll see the proposed terms here shortly.
                                  </p>
                                )}
                                {request.negotiationNotes && (
                                  <div className="mt-2 pt-2 border-t text-xs text-gray-600 italic">
                                    " {request.negotiationNotes} "
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                    {currentLease.noticeStatus === 'vacating' && (
                      <p className="text-xs text-red-700 font-medium">
                        ✓ We've noted that you will be vacating. We'll start the
                        move-out process soon.
                      </p>
                    )}
                    {(!currentLease.noticeStatus ||
                      currentLease.noticeStatus === 'undecided') && (
                      <p className="text-xs text-gray-500">
                        Indicating your intent helps us avoid scheduling new
                        viewings for your unit.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Unit & Property Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="size-5 text-blue-600" />
                    Unit Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Property</p>
                        <p className="font-medium mt-1">
                          {property?.name || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Unit Number</p>
                        <p className="font-medium mt-1">
                          {unit?.unitNumber || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Unit Type</p>
                        <p className="font-medium mt-1">
                          {unit?.type || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Location</p>
                        <p className="font-medium mt-1">
                          {property
                            ? `${property.street}, ${property.city}`
                            : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="size-5 text-green-600" />
                    Financial Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Monthly Rent</p>
                        <p className="text-xl font-semibold text-green-700 mt-1">
                          {formatLKR(currentLease.monthlyRent)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">
                          Total Lease Value
                        </p>
                        <p className="text-xl font-semibold text-gray-700 mt-1">
                          {formatLKR(
                            currentLease.monthlyRent * Math.ceil(totalDays / 30)
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Security Deposit Section */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Shield className="size-4 text-blue-600" />
                          Security Deposit
                        </h4>
                        {currentLease.depositStatus && (
                          <Badge
                            className={
                              depositStatusColors[currentLease.depositStatus] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {currentLease.depositStatus.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">
                            Contractual Deposit
                          </p>
                          <p className="font-medium mt-1">
                            {formatLKR(currentLease.targetDeposit || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 font-bold">
                            Current Balance
                          </p>
                          <p className="text-lg font-black mt-1 text-blue-600">
                            {formatLKR(currentLease.currentDepositBalance || 0)}
                          </p>
                        </div>
                        {(currentLease.targetDeposit || 0) >
                          (currentLease.currentDepositBalance || 0) && (
                          <div className="col-span-2 mt-2">
                            <Badge
                              variant="outline"
                              className="bg-amber-100 text-amber-700 border-amber-200"
                            >
                              Payment Shortfall:{' '}
                              {formatLKR(
                                (currentLease.targetDeposit || 0) -
                                  (currentLease.currentDepositBalance || 0)
                              )}
                            </Badge>
                          </div>
                        )}
                        {currentLease.depositStatus ===
                          'awaiting_acknowledgment' && (
                          <div className="col-span-2 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-start gap-3">
                              <Shield className="size-5 text-blue-600 mt-0.5" />
                              <div className="space-y-3">
                                <h4 className="font-semibold text-blue-900">
                                  Refund Settlement Ready
                                </h4>
                                <p className="text-sm text-blue-800">
                                  Owner has approved a refund of{' '}
                                  <strong>
                                    {formatLKR(
                                      currentLease.proposedRefundAmount || 0
                                    )}
                                  </strong>
                                  . Please acknowledge this settlement to
                                  finalize the process.
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white flex-1"
                                    onClick={() =>
                                      acknowledgeRefund(currentLease.id)
                                    }
                                  >
                                    <CheckCircle className="size-4 mr-2" />
                                    Confirm Settlement
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
                                    onClick={() => {
                                      const notes = window.prompt(
                                        'Why are you disputing this deduction?'
                                      );
                                      if (notes)
                                        disputeRefund(currentLease.id, notes);
                                    }}
                                  >
                                    <AlertTriangle className="size-4 mr-2" />
                                    Dispute Deduction
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {currentLease.refundedAmount !== undefined &&
                          currentLease.refundedAmount > 0 && (
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm text-gray-500">
                                  Refunded Amount
                                </p>
                                <p className="font-medium mt-1 text-blue-600">
                                  {formatLKR(currentLease.refundedAmount)}
                                </p>
                              </div>
                              {currentLease.refundNotes && (
                                <div className="p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800 italic">
                                  <p className="font-semibold not-italic mb-1">
                                    Deduction Details:
                                  </p>
                                  "{currentLease.refundNotes}"
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Lease Contract Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5 text-purple-600" />
                  Contract Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Lease ID</p>
                    <p className="font-mono text-sm mt-1">
                      {currentLease.id.substring(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Start Date</p>
                    <p className="font-medium mt-1 flex items-center gap-1">
                      <Calendar className="size-3.5 text-gray-400" />
                      {formatDate(currentLease.startDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">End Date</p>
                    <p className="font-medium mt-1 flex items-center gap-1">
                      <Calendar className="size-3.5 text-gray-400" />
                      {formatDate(currentLease.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Created</p>
                    <p className="font-medium mt-1">
                      {formatDate(currentLease.createdAt)}
                    </p>
                  </div>
                </div>

                {currentLease.documentUrl && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (currentLease.id) {
                          const baseUrl = '/api'; // Assuming standard base
                          window.open(
                            `${baseUrl}/documents/view/${currentLease.id}?type=lease`,
                            '_blank'
                          );
                        }
                      }}
                    >
                      <ExternalLink className="size-4 mr-2" />
                      View Lease Document
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}

      {/* Past Leases */}
      {pastLeases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Lease History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-gray-600">Unit</th>
                    <th className="pb-3 font-medium text-gray-600">Period</th>
                    <th className="pb-3 font-medium text-gray-600">
                      Monthly Rent
                    </th>
                    <th className="pb-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pastLeases.map((lease) => {
                    const { unit } = getLeaseDetails(lease);
                    return (
                      <tr key={lease.id}>
                        <td className="py-3">{unit?.unitNumber || 'N/A'}</td>
                        <td className="py-3 text-gray-600">
                          {formatDate(lease.startDate)} →{' '}
                          {formatDate(lease.endDate)}
                        </td>
                        <td className="py-3">{formatLKR(lease.monthlyRent)}</td>
                        <td className="py-3">
                          <Badge
                            className={
                              statusColors[lease.status] ||
                              'bg-gray-100 text-gray-800'
                            }
                          >
                            {lease.status.charAt(0).toUpperCase() +
                              lease.status.slice(1)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
