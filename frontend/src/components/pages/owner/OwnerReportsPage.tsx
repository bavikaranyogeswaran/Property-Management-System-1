import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  BarChart3,
  Download,
  Users,
  Wrench,
  Calendar,
  Filter,
  FileText,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { reportService } from '@/services/reportService';

type FilterMode = 'this-year' | 'monthly' | 'annual';

export function OwnerReportsPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('this-year');
  const [selectedMonth, setSelectedMonth] = useState<string>(
    (new Date().getMonth() + 1).toString()
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );

  const months = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const years = Array.from({ length: 5 }, (_, i) =>
    (new Date().getFullYear() - i).toString()
  );

  const handleExport = async (
    reportType: string,
    action: 'view' | 'download'
  ) => {
    setIsGenerating(true);
    const options = {
      action,
      year: parseInt(selectedYear),
      month: filterMode === 'monthly' ? parseInt(selectedMonth) : undefined,
    };

    try {
      if (reportType === 'Monthly Summary') {
        await reportService.downloadOccupancyReport(options);
      } else if (reportType === 'Financial Report') {
        await reportService.downloadFinancialReport(options);
      } else if (reportType === 'Tenant Risk Report') {
        await reportService.downloadTenantRiskReport({ action });
      } else if (reportType === 'Maintenance Report') {
        await reportService.downloadMaintenanceReport(options);
      } else if (reportType === 'Lease Expiration Report') {
        await reportService.downloadLeaseReport({ action });
      } else if (reportType === 'Lead Conversion Report') {
        await reportService.downloadLeadReport(options);
      }
      toast.success(
        `${reportType} ${action === 'view' ? 'opened' : 'downloaded'} successfully`
      );
    } catch (error) {
      toast.error(`Failed to generate ${reportType}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getActiveFilterLabel = (isLive: boolean) => {
    if (isLive) return 'Live Snapshot';
    if (filterMode === 'this-year') return `Full ${new Date().getFullYear()}`;
    if (filterMode === 'annual') return `Full ${selectedYear}`;
    const monthName = months.find((m) => m.value === selectedMonth)?.label;
    return `${monthName} ${selectedYear}`;
  };

  const reports = [
    {
      title: 'Financial Report',
      description:
        'Income statement, expense breakdown, and net operating income analysis.',
      icon: BarChart3,
      type: 'Financial Report',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      isLive: false,
    },
    {
      title: 'Occupancy Report',
      description:
        'Monthly summary of unit occupancy, vacancies, and tenant turnover rates.',
      icon: Download,
      type: 'Monthly Summary',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      isLive: false,
    },
    {
      title: 'Tenant Risk Profile',
      description:
        'Analysis of tenant behavior scores, payment history, and risk assessment.',
      icon: Users,
      type: 'Tenant Risk Report',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      isLive: true,
    },
    {
      title: 'Maintenance Analysis',
      description:
        'Breakdown of maintenance costs by category, property, and contractor.',
      icon: Wrench,
      type: 'Maintenance Report',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      isLive: false,
    },
    {
      title: 'Lease Expirations',
      description:
        'Forecast of upcoming lease expirations for the next 90 days.',
      icon: Calendar,
      type: 'Lease Expiration Report',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      isLive: true,
    },
    {
      title: 'Lead Conversion Funnel',
      description:
        'Tracking of lead pipeline performance from interest to signed lease.',
      icon: Filter,
      type: 'Lead Conversion Report',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      isLive: false,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Reports Hub
          </h2>
          <p className="text-muted-foreground mt-2">
            Generate and download comprehensive PDF reports for your properties.
          </p>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-gray-500">
              Filter Mode
            </Label>
            <div className="flex p-1 bg-gray-100 rounded-lg">
              {(['this-year', 'monthly', 'annual'] as FilterMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      filterMode === mode
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {mode === 'this-year'
                      ? 'Current Year'
                      : mode === 'monthly'
                        ? 'Monthly'
                        : 'Annual'}
                  </button>
                )
              )}
            </div>
          </div>

          {(filterMode === 'monthly' || filterMode === 'annual') && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-gray-500">
                Year
              </Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[110px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterMode === 'monthly' && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-gray-500">
                Month
              </Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[140px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report, index) => {
          const Icon = report.icon;
          return (
            <Card
              key={index}
              className="flex flex-col hover:shadow-lg transition-all duration-200 border-gray-200"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${report.bgColor}`}>
                    <Icon className={`w-6 h-6 ${report.color}`} />
                  </div>
                  <Badge
                    variant={report.isLive ? 'secondary' : 'outline'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 ${
                      !report.isLive
                        ? 'border-blue-200 text-blue-700 bg-blue-50'
                        : ''
                    }`}
                  >
                    {report.isLive ? (
                      <Clock className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3 text-blue-500" />
                    )}
                    {getActiveFilterLabel(report.isLive)}
                  </Badge>
                </div>
                <CardTitle className="text-xl mt-4">{report.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow">
                <CardDescription className="text-base text-gray-600">
                  {report.description}
                </CardDescription>
              </CardContent>
              <CardFooter className="flex gap-3 pt-4 border-t bg-gray-50/50 rounded-b-xl">
                <Button
                  className="flex-1 bg-white hover:bg-gray-100 text-gray-700 border-gray-200"
                  variant="outline"
                  onClick={() => handleExport(report.type, 'view')}
                  disabled={isGenerating}
                >
                  <FileText className="w-4 h-4 mr-2 text-gray-500" />
                  View
                </Button>
                <Button
                  className="flex-1 bg-white hover:bg-gray-100 text-gray-700 border-gray-200"
                  variant="outline"
                  onClick={() => handleExport(report.type, 'download')}
                  disabled={isGenerating}
                >
                  <Download className="w-4 h-4 mr-2 text-gray-500" />
                  Download
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
