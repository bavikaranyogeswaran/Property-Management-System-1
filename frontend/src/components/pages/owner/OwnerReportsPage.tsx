import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
    BarChart3,
    Download,
    Users,
    Wrench,
    Calendar,
    Filter,
    FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { reportService } from '@/services/reportService';

export function OwnerReportsPage() {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleExport = async (reportType: string, action: 'view' | 'download') => {
        setIsGenerating(true);
        try {
            if (reportType === 'Monthly Summary') {
                await reportService.downloadOccupancyReport(action);
            } else if (reportType === 'Financial Report') {
                await reportService.downloadFinancialReport(undefined, action);
            } else if (reportType === 'Tenant Risk Report') {
                await reportService.downloadTenantRiskReport(action);
            } else if (reportType === 'Maintenance Report') {
                await reportService.downloadMaintenanceReport(action);
            } else if (reportType === 'Lease Expiration Report') {
                await reportService.downloadLeaseReport(action);
            } else if (reportType === 'Lead Conversion Report') {
                await reportService.downloadLeadReport(action);
            }
            toast.success(`${reportType} ${action === 'view' ? 'opened' : 'downloaded'} successfully`);
        } catch (error) {
            toast.error(`Failed to generate ${reportType}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const reports = [
        {
            title: 'Financial Report',
            description: 'Income statement, expense breakdown, and net operating income analysis.',
            icon: BarChart3,
            type: 'Financial Report',
            color: 'text-green-600',
            bgColor: 'bg-green-50'
        },
        {
            title: 'Occupancy Report',
            description: 'Monthly summary of unit occupancy, vacancies, and tenant turnover rates.',
            icon: Download,
            type: 'Monthly Summary',
            color: 'text-blue-600',
            bgColor: 'bg-blue-50'
        },
        {
            title: 'Tenant Risk Profile',
            description: 'Analysis of tenant behavior scores, payment history, and risk assessment.',
            icon: Users,
            type: 'Tenant Risk Report',
            color: 'text-purple-600',
            bgColor: 'bg-purple-50'
        },
        {
            title: 'Maintenance Analysis',
            description: 'Breakdown of maintenance costs by category, property, and contractor.',
            icon: Wrench,
            type: 'Maintenance Report',
            color: 'text-red-600',
            bgColor: 'bg-red-50'
        },
        {
            title: 'Lease Expirations',
            description: 'Forecast of upcoming lease expirations for the next 90 days.',
            icon: Calendar,
            type: 'Lease Expiration Report',
            color: 'text-orange-600',
            bgColor: 'bg-orange-50'
        },
        {
            title: 'Lead Conversion Funnel',
            description: 'Tracking of lead pipeline performance from interest to signed lease.',
            icon: Filter,
            type: 'Lead Conversion Report',
            color: 'text-indigo-600',
            bgColor: 'bg-indigo-50'
        }
    ];

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Reports Hub</h2>
                <p className="text-muted-foreground mt-2">
                    Generate and download comprehensive PDF reports for your properties.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.map((report, index) => {
                    const Icon = report.icon;
                    return (
                        <Card key={index} className="flex flex-col hover:shadow-lg transition-shadow duration-200">
                            <CardHeader>
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-lg ${report.bgColor}`}>
                                        <Icon className={`w-6 h-6 ${report.color}`} />
                                    </div>
                                    <CardTitle className="text-xl">{report.title}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <CardDescription className="text-base">
                                    {report.description}
                                </CardDescription>
                            </CardContent>
                            <CardFooter className="flex gap-2">
                                <Button
                                    className="flex-1"
                                    variant="outline"
                                    onClick={() => handleExport(report.type, 'view')}
                                    disabled={isGenerating}
                                >
                                    <FileText className="w-4 h-4 mr-2" />
                                    View
                                </Button>
                                <Button
                                    className="flex-1"
                                    variant="outline"
                                    onClick={() => handleExport(report.type, 'download')}
                                    disabled={isGenerating}
                                >
                                    <Download className="w-4 h-4 mr-2" />
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

