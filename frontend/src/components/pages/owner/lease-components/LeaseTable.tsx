import React from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Calendar, AlertCircle, XCircle } from 'lucide-react';
import { Lease, Tenant, Unit, Property } from '@/app/context/AppContext';
import { LeaseRow } from './LeaseRow';

interface LeaseTableProps {
  leases: Lease[];
  emptyMessage: string;
  emptySubMessage?: string;
  emptyIcon: any;
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

export function LeaseTable({
  leases,
  emptyMessage,
  emptySubMessage,
  emptyIcon: Icon,
  ...rowProps
}: LeaseTableProps) {
  return (
    <div className="overflow-x-auto px-6 pb-6">
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
          {leases.map((lease) => (
            <LeaseRow key={lease.id} lease={lease} {...rowProps} />
          ))}
        </TableBody>
      </Table>
      {leases.length === 0 && (
        <div className="py-12 text-center">
          <Icon className="size-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{emptyMessage}</p>
          {emptySubMessage && (
            <p className="text-sm text-gray-500 mt-1">{emptySubMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
