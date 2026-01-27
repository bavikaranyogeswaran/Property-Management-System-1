import React, { useState, useMemo } from 'react';
import { useApp, Receipt } from '@/app/context/AppContext';
import { useAuth } from '@/app/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Download, Search, Calendar, User, Building2, Hash, Eye } from 'lucide-react';
import { ReceiptViewer } from '@/components/common/ReceiptViewer';

export function ReceiptsPage() {
    const { user } = useAuth();
    const { receipts, payments, invoices, tenants, units, properties } = useApp();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReceipt, setSelectedReceipt] = useState<{
        receipt: Receipt;
        tenantName: string;
        tenantEmail: string;
        propertyName: string;
        unitNumber: string;
        paymentMethod: string;
        paymentDate: string;
    } | null>(null);

    // Filter receipts by role
    const userReceipts = useMemo(() => {
        if (user?.role === 'tenant') {
            return receipts.filter(r => r.tenantId === user.id);
        }
        // Treasurer and owner see all
        return receipts;
    }, [receipts, user]);

    // Search and filter
    const filteredReceipts = useMemo(() => {
        if (!searchTerm) return userReceipts;

        const term = searchTerm.toLowerCase();
        return userReceipts.filter(receipt => {
            const tenant = tenants.find(t => t.id === receipt.tenantId);
            const payment = payments.find(p => p.id === receipt.paymentId);
            const invoice = invoices.find(i => i.id === receipt.invoiceId);
            const unit = invoice ? units.find(u => u.id === invoice.unitId) : null;
            const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

            return (
                receipt.receiptNumber.toLowerCase().includes(term) ||
                tenant?.name.toLowerCase().includes(term) ||
                tenant?.email.toLowerCase().includes(term) ||
                property?.name.toLowerCase().includes(term) ||
                unit?.unitNumber.toLowerCase().includes(term) ||
                receipt.amount.toString().includes(term)
            );
        });
    }, [userReceipts, searchTerm, tenants, payments, invoices, units, properties]);

    // Stats
    const totalReceipts = userReceipts.length;
    const totalAmount = userReceipts.reduce((sum, r) => sum + r.amount, 0);
    const thisMonthReceipts = userReceipts.filter(r => {
        const receiptDate = new Date(r.generatedDate);
        const now = new Date();
        return receiptDate.getMonth() === now.getMonth() &&
            receiptDate.getFullYear() === now.getFullYear();
    }).length;

    const handleViewReceipt = (receipt: Receipt) => {
        const tenant = tenants.find(t => t.id === receipt.tenantId);
        const payment = payments.find(p => p.id === receipt.paymentId);
        const invoice = invoices.find(i => i.id === receipt.invoiceId);
        const unit = invoice ? units.find(u => u.id === invoice.unitId) : null;
        const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

        if (tenant && payment && unit && property) {
            setSelectedReceipt({
                receipt,
                tenantName: tenant.name,
                tenantEmail: tenant.email,
                propertyName: property.name,
                unitNumber: unit.unitNumber,
                paymentMethod: payment.paymentMethod,
                paymentDate: payment.paymentDate,
            });
        }
    };

    const stats = [
        {
            label: 'Total Receipts',
            value: totalReceipts,
            icon: FileText,
            color: 'text-blue-600 bg-blue-50',
        },
        {
            label: 'This Month',
            value: thisMonthReceipts,
            icon: Calendar,
            color: 'text-purple-600 bg-purple-50',
        },
        {
            label: 'Total Amount',
            value: `LKR ${totalAmount.toLocaleString()}`,
            subtitle: 'All time',
            icon: Download,
            color: 'text-green-600 bg-green-50',
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-semibold text-gray-900">Payment Receipts</h2>
                <p className="text-sm text-gray-500 mt-1">
                    {user?.role === 'tenant'
                        ? 'View and download your payment receipts'
                        : 'Manage all payment receipts'}
                </p>
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
                                        <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                                        {stat.subtitle && (
                                            <p className="text-xs text-gray-500 mt-1">{stat.subtitle}</p>
                                        )}
                                    </div>
                                    <div className={`p-3 rounded-lg ${stat.color}`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Search and Filters */}
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                                placeholder="Search by receipt number, tenant, property, or amount..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {/* Receipts Table */}
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <div className="flex items-center gap-2">
                                            <Hash className="w-4 h-4" />
                                            Receipt #
                                        </div>
                                    </TableHead>
                                    <TableHead>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            Date Generated
                                        </div>
                                    </TableHead>
                                    {user?.role !== 'tenant' && (
                                        <TableHead>
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4" />
                                                Tenant
                                            </div>
                                        </TableHead>
                                    )}
                                    <TableHead>
                                        <div className="flex items-center gap-2">
                                            <Building2 className="w-4 h-4" />
                                            Property & Unit
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReceipts.length > 0 ? (
                                    filteredReceipts.map((receipt) => {
                                        const tenant = tenants.find(t => t.id === receipt.tenantId);
                                        const invoice = invoices.find(i => i.id === receipt.invoiceId);
                                        const unit = invoice ? units.find(u => u.id === invoice.unitId) : null;
                                        const property = unit ? properties.find(p => p.id === unit.propertyId) : null;

                                        return (
                                            <TableRow key={receipt.id}>
                                                <TableCell>
                                                    <div className="font-mono text-sm font-medium text-blue-600">
                                                        {receipt.receiptNumber}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {new Date(receipt.generatedDate).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {new Date(receipt.generatedDate).toLocaleTimeString('en-US', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </div>
                                                </TableCell>
                                                {user?.role !== 'tenant' && (
                                                    <TableCell>
                                                        <div className="text-sm">
                                                            <div className="font-medium">{tenant?.name || 'N/A'}</div>
                                                            <div className="text-xs text-gray-500">{tenant?.email}</div>
                                                        </div>
                                                    </TableCell>
                                                )}
                                                <TableCell>
                                                    <div className="text-sm">
                                                        <div className="font-medium">{property?.name || 'N/A'}</div>
                                                        <div className="text-xs text-gray-500">Unit {unit?.unitNumber || 'N/A'}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-semibold">
                                                    LKR {receipt.amount.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleViewReceipt(receipt)}
                                                        >
                                                            <Eye className="w-4 h-4 mr-2" />
                                                            View
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={user?.role !== 'tenant' ? 6 : 5} className="text-center py-12">
                                            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                            <p className="text-gray-600 font-medium">
                                                {searchTerm ? 'No receipts found matching your search' : 'No receipts available'}
                                            </p>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {searchTerm ? 'Try a different search term' : 'Receipts will appear here after payments are verified'}
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Receipt Viewer Dialog */}
            <Dialog open={selectedReceipt !== null} onOpenChange={() => setSelectedReceipt(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="sr-only">Receipt Details</DialogTitle>
                    </DialogHeader>
                    {selectedReceipt && (
                        <ReceiptViewer
                            receipt={selectedReceipt.receipt}
                            tenantName={selectedReceipt.tenantName}
                            tenantEmail={selectedReceipt.tenantEmail}
                            propertyName={selectedReceipt.propertyName}
                            unitNumber={selectedReceipt.unitNumber}
                            paymentMethod={selectedReceipt.paymentMethod}
                            paymentDate={selectedReceipt.paymentDate}
                            onClose={() => setSelectedReceipt(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
