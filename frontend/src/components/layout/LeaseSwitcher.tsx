import React from 'react';
import { useAuth } from '@/app/context/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Home } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const LeaseSwitcher: React.FC = () => {
  const {
    user,
    tenantLeases,
    activeLeaseId,
    setActiveLeaseId,
    isLoadingLeases,
  } = useAuth();

  if (user?.role !== 'tenant' || tenantLeases.length <= 1) {
    return null;
  }

  const activeLease = tenantLeases.find((l) => l.id === activeLeaseId);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 rounded-lg border border-blue-100 transition-all hover:bg-blue-50">
      <div className="bg-white p-1.5 rounded-md shadow-sm border border-blue-200">
        <Home className="size-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-[140px]">
        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tight leading-none mb-1">
          Viewing Unit
        </p>
        <Select
          value={activeLeaseId || ''}
          onValueChange={(value) => setActiveLeaseId(value)}
          disabled={isLoadingLeases}
        >
          <SelectTrigger className="h-8 py-0 px-2 bg-transparent border-none shadow-none focus:ring-0 text-gray-900 font-bold hover:bg-black/5 rounded group">
            <SelectValue placeholder="Select Unit">
              {activeLease ? (
                <span className="flex items-center gap-1.5 overflow-hidden">
                  <span className="truncate">
                    Unit {activeLease.unitNumber}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1 font-normal border-blue-200 text-blue-600"
                  >
                    {activeLease.propertyName}
                  </Badge>
                </span>
              ) : (
                'Select Unit'
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-w-[280px]">
            <div className="p-2 border-b bg-gray-50/50">
              <p className="text-[10px] font-bold text-gray-500 uppercase">
                Your Portfolio
              </p>
            </div>
            {tenantLeases.map((lease) => (
              <SelectItem
                key={lease.id}
                value={lease.id}
                className="text-sm py-2.5 focus:bg-blue-50 focus:text-blue-700"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold flex items-center gap-2">
                    Unit {lease.unitNumber}
                    {lease.status === 'draft' && (
                      <Badge
                        variant="outline"
                        className="bg-orange-50 text-orange-600 border-orange-200 text-[8px] h-3.5 px-1 uppercase"
                      >
                        Pending Setup
                      </Badge>
                    )}
                  </span>
                  <span className="text-[10px] text-gray-500 font-normal leading-none">
                    {lease.propertyName}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
