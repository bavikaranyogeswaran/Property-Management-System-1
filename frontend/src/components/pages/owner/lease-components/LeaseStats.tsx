import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  CheckCircle, 
  Calendar, 
  AlertCircle, 
  XCircle,
  LucideIcon 
} from 'lucide-react';
import { Lease } from '@/app/context/AppContext';

interface LeaseStatsProps {
  leases: Lease[];
}

export function LeaseStats({ leases }: LeaseStatsProps) {
  const activeLeases = leases.filter((l) => l.status === 'active');
  const expiredLeases = leases.filter((l) => l.status === 'expired');
  const endedLeases = leases.filter((l) => l.status === 'ended' || l.status === 'cancelled');
  
  const today = new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  
  const expiringSoon = activeLeases.filter((lease) => {
    if (!lease.endDate) return false;
    const endDate = new Date(lease.endDate);
    return endDate <= thirtyDaysFromNow && endDate >= today;
  });

  const stats = [
    { label: 'Total Leases', value: leases.length, icon: FileText, color: 'bg-blue-50 text-blue-700' },
    { label: 'Active Leases', value: activeLeases.length, icon: CheckCircle, color: 'bg-green-50 text-green-700' },
    { label: 'Expiring Soon', value: expiringSoon.length, icon: Calendar, color: 'bg-orange-50 text-orange-700' },
    { label: 'Expired (Move-Out)', value: expiredLeases.length, icon: AlertCircle, color: 'bg-amber-50 text-amber-700' },
    { label: 'Ended Leases', value: endedLeases.length, icon: XCircle, color: 'bg-gray-50 text-gray-700' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {stats.map((stat, idx) => (
        <Card key={idx} className="border-none shadow-sm bg-white/50 backdrop-blur-sm hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              {stat.label}
            </CardTitle>
            <div className={`p-2 rounded-lg ${stat.color}`}>
              <stat.icon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-slate-900">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
