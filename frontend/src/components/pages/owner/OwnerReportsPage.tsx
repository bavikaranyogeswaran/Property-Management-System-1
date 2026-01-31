import React from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Download,
    Users,
    Building2,
    DollarSign,
    Wrench,
    Calendar,
    Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { reportService } from '@/services/reportService';
import { useState } from 'react';

export function OwnerReportsPage() {
    const { properties, units, tenants, invoices, maintenanceRequests } = useApp();

    // Calculate stats
    const totalProperties = properties.length;
    const totalUnits = units.length;
    const occupiedUnits = units.filter(u => u.status === 'occupied').length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    const totalIncome = invoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + i.amount, 0);

    // Estimated Maintenance Cost (mock calculation as request doesn't have cost yet)
    const maintenanceCost = maintenanceRequests
        .filter(m => m.status === 'completed')
        .length * 150; // assuming avg LKR 150 per request

    const netIncome = totalIncome - maintenanceCost;

    const [isGenerating, setIsGenerating] = useState(false);

    const handleExport = async (reportType: string) => {
        setIsGenerating(true);
        try {
            if (reportType === 'Monthly Summary') {
                await reportService.downloadOccupancyReport();
            } else if (reportType === 'Financial Report') {
                await reportService.downloadFinancialReport();
            } else if (reportType === 'Tenant Risk Report') {
                await reportService.downloadTenantRiskReport();
            } else if (reportType === 'Maintenance Report') {
                await reportService.downloadMaintenanceReport();
            } else if (reportType === 'Lease Expiration Report') {
                await reportService.downloadLeaseReport();
            } else if (reportType === 'Lead Conversion Report') {
                await reportService.downloadLeadReport();
            }
            toast.success(`${reportType} downloaded successfully`);
        } catch (error) {
            toast.error(`Failed to generate ${reportType}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900">Reports & Analytics</h2>
                    <p className="text-sm text-gray-500 mt-1">Financial overview and property performance</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleExport('Monthly Summary')} disabled={isGenerating}>
                        <Download className="size-4 mr-2" />
                        {isGenerating ? 'Generating...' : 'Occupancy Report'}
                    </Button>
                    <Button onClick={() => handleExport('Financial Report')} disabled={isGenerating}>
                        <BarChart3 className="size-4 mr-2" />
                        {isGenerating ? 'Generating...' : 'Financial Report'}
                    </Button>
                    <Button variant="secondary" onClick={() => handleExport('Tenant Risk Report')} disabled={isGenerating}>
                        <Users className="size-4 mr-2" />
                        {isGenerating ? 'Generating...' : 'Tenant Risk Report'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={() => handleExport('Maintenance Report')} disabled={isGenerating}>
                    <Wrench className="size-4 mr-2" />
                    Maintenance Analysis
                </Button>
                <Button variant="outline" onClick={() => handleExport('Lease Expiration Report')} disabled={isGenerating}>
                    <Calendar className="size-4 mr-2" />
                    Lease Expirations
                </Button>
                <Button variant="outline" onClick={() => handleExport('Lead Conversion Report')} disabled={isGenerating}>
                    <Filter className="size-4 mr-2" />
                    Lead Funnel
                </Button>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Total Income (YTD)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center">
                            <DollarSign className="size-5 text-green-500 mr-2" />
                            <span className="text-2xl font-bold">LKR {totalIncome.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-green-600 mt-1 flex items-center">
                            <TrendingUp className="size-3 mr-1" /> +12% from last year
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Maintenance Expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center">
                            <DollarSign className="size-5 text-red-500 mr-2" />
                            <span className="text-2xl font-bold">LKR {maintenanceCost.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Estimated based on completed requests
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">Net Operating Income</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center">
                            <DollarSign className="size-5 text-blue-500 mr-2" />
                            <span className="text-2xl font-bold">LKR {netIncome.toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                            {totalIncome > 0 ? Math.round((netIncome / totalIncome) * 100) : 0}% Margin
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Occupancy Stats */}
                <Card>
                    <CardHeader>
                        <CardTitle>Occupancy Overview</CardTitle>
                        <CardDescription>Current unit status distribution</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-600">Occupancy Rate</span>
                                <span className="text-2xl font-bold">{occupancyRate}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${occupancyRate}%` }}></div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 pt-4">
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                    <p className="text-xs text-green-600 font-medium">Occupied</p>
                                    <p className="text-xl font-bold text-green-700">{occupiedUnits}</p>
                                </div>
                                <div className="text-center p-3 bg-orange-50 rounded-lg">
                                    <p className="text-xs text-orange-600 font-medium">Available</p>
                                    <p className="text-xl font-bold text-orange-700">{totalUnits - occupiedUnits}</p>
                                </div>
                                <div className="text-center p-3 bg-blue-50 rounded-lg">
                                    <p className="text-xs text-blue-600 font-medium">Total Units</p>
                                    <p className="text-xl font-bold text-blue-700">{totalUnits}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Property Performance */}
                <Card>
                    <CardHeader>
                        <CardTitle>Property Performance</CardTitle>
                        <CardDescription>Revenue by property</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {properties.slice(0, 4).map(property => {
                                const propUnits = units.filter(u => u.propertyId === property.id);
                                const propIncome = invoices
                                    .filter(i => propUnits.some(u => u.id === i.unitId) && i.status === 'paid')
                                    .reduce((sum, i) => sum + i.amount, 0);

                                // Mock progress relative to max possible
                                const maxIncome = 10000;
                                const percentage = Math.min((propIncome / maxIncome) * 100, 100);

                                return (
                                    <div key={property.id} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium">{property.name}</span>
                                            <span className="text-gray-600">LKR {propIncome.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                            {properties.length === 0 && <p className="text-sm text-gray-500">No properties data available.</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
