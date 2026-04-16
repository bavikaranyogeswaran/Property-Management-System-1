import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Eye,
  Calendar,
  Home,
  User,
  XCircle,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  PlayCircle,
  ShieldCheck,
  Share2,
  RefreshCw,
  Unlock,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { Lease, Tenant, Unit, Property } from '@/app/context/AppContext';
import { formatLKR } from '@/utils/formatters';
import { toast } from 'sonner';
import apiClient from '@/services/api';

interface LeaseRowProps {
  lease: Lease;
  user: any;
  tenants: Tenant[];
  units: Unit[];
  properties: Property[];
  thirtyDaysFromNow: Date;
  today: Date;
  setSelectedLease: (lease: Lease) => void;
  setConfirmVerifyLeaseId: (leaseId: string) => void;
  setRejectionLeaseId: (leaseId: string) => void;
  setActivateLeaseId: (leaseId: string) => void;
  setCancelReservationId: (leaseId: string) => void;
  setFinalizeLeaseId: (leaseId: string) => void;
  setMarkAvailableUnitId: (unitId: string) => void;
  setRenewLeaseId: (leaseId: string) => void;
  setRenewDate: (date: string) => void;
  setRenewRent: (rent: string) => void;
  handleEndLease: (leaseId: string) => void;
  setAdjustmentsLeaseId: (leaseId: string) => void;
  fetchAdjustments: (leaseId: string) => void;
  setRefundLeaseId: (leaseId: string) => void;
  setRefundType: (type: 'request' | 'approve' | 'dispute') => void;
}

export function LeaseRow({
  lease,
  user,
  tenants,
  units,
  properties,
  thirtyDaysFromNow,
  today,
  setSelectedLease,
  setConfirmVerifyLeaseId,
  setRejectionLeaseId,
  setActivateLeaseId,
  setCancelReservationId,
  setFinalizeLeaseId,
  setMarkAvailableUnitId,
  setRenewLeaseId,
  setRenewDate,
  setRenewRent,
  handleEndLease,
  setAdjustmentsLeaseId,
  fetchAdjustments,
  setRefundLeaseId,
  setRefundType,
}: LeaseRowProps) {
  const tenant = tenants.find((t) => t.id === lease.tenantId);
  const unit = units.find((u) => u.id === lease.unitId);
  const property = unit
    ? properties.find((p) => p.id === unit.propertyId)
    : null;

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
          <span className="font-medium">
            {lease.tenantName || tenant?.name || 'Unknown'}
          </span>
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
            {lease.endDate || (
              <span className="text-blue-600 font-medium italic">
                Month-to-Month
              </span>
            )}
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
          {formatLKR(lease.monthlyRent)}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant={
            lease.status === 'active'
              ? 'secondary'
              : lease.status === 'expired'
                ? 'outline'
                : 'outline'
          }
          className={
            lease.status === 'active'
              ? 'bg-green-100 text-green-700'
              : lease.status === 'expired'
                ? 'bg-amber-100 text-amber-700 border-amber-200'
                : lease.status === 'draft'
                  ? 'bg-gray-100 text-gray-700 border-gray-200'
                  : lease.status === 'pending'
                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                    : ''
          }
        >
          {lease.status === 'draft'
            ? lease.depositStatus === 'paid'
              ? 'Awaiting Verification'
              : 'Awaiting Deposit'
            : lease.status === 'pending'
              ? 'Pending Move-in'
              : lease.status}
        </Badge>
        {lease.status === 'draft' &&
          lease.verificationStatus === 'verified' && (
            <Badge
              variant="outline"
              className="ml-1 bg-blue-50 text-blue-700 border-blue-200"
            >
              Docs OK
            </Badge>
          )}
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
          {lease.status === 'draft' && (
            <>
              {lease.verificationStatus !== 'verified' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmVerifyLeaseId(lease.id)}
                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title="Verify Documents"
                >
                  <ShieldCheck className="size-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRejectionLeaseId(lease.id)}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                title="Reject Documents"
              >
                <AlertTriangle className="size-4" />
              </Button>
              {lease.verificationStatus === 'verified' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setActivateLeaseId(lease.id)}
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  title="Sign & Activate Lease"
                >
                  <PlayCircle className="size-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCancelReservationId(lease.id)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Cancel Reservation"
              >
                <XCircle className="size-4" />
              </Button>
            </>
          )}
          {lease.status === 'draft' && lease.magicToken && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const url = `${window.location.origin}/pay/${lease.magicToken}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Payment Link copied to clipboard');
                }}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                title="Copy Guest Payment Link"
              >
                <Share2 className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await apiClient.post(
                      `/leases/${lease.id}/regenerate-token`
                    );
                    toast.success("Payment link resent to tenant's email");
                  } catch (err: any) {
                    toast.error(
                      err.response?.data?.error ||
                        'Failed to resend payment link'
                    );
                  }
                }}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Resend Payment Link via Email"
              >
                <RefreshCw className="size-4" />
              </Button>
            </>
          )}
          {(lease.status === 'expired' ||
            (lease.status === 'ended' &&
              unit?.status === 'maintenance' &&
              !lease.actualCheckoutAt)) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFinalizeLeaseId(lease.id)}
              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              title="Finalize Move-Out"
            >
              <CheckCircle className="size-4" />
            </Button>
          )}
          {(lease.status === 'ended' || lease.status === 'expired') &&
            unit?.status === 'maintenance' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unit && setMarkAvailableUnitId(unit.id)}
                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Mark Unit as Available"
              >
                <Unlock className="size-4" />
              </Button>
            )}
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
              {user?.role === 'owner' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdjustmentsLeaseId(lease.id);
                    fetchAdjustments(lease.id);
                  }}
                  className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                  title="Manage Rent Adjustments"
                >
                  <TrendingUp className="size-4" />
                </Button>
              )}
            </>
          )}
          {(lease.status === 'ended' || lease.noticeStatus === 'vacating') &&
            lease.depositStatus !== 'refunded' && (
              <>
                {(user?.role === 'treasurer' ||
                  (user?.role === 'owner' &&
                    ['paid', 'partially_refunded'].includes(
                      lease.depositStatus || ''
                    ))) &&
                  !['awaiting_approval', 'disputed'].includes(
                    lease.depositStatus || ''
                  ) && (
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
              </>
            )}
        </div>
      </TableCell>
    </TableRow>
  );
}
