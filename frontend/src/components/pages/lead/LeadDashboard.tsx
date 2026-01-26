import React, { useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import apiClient from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChatInterface } from '@/components/common/ChatInterface';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface LeadProfile {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: 'interested' | 'converted' | 'dropped';
    propertyId: string;
    interestedUnit?: string;
    createdAt: string;
}

interface PropertyDetails {
    name: string;
    address_line_1: string;
}

interface UnitDetails {
    unitNumber: string;
    type: string;
    monthlyRent: number;
}

export function LeadDashboard() {
    const { user } = useAuth();
    const [lead, setLead] = useState<LeadProfile | null>(null);
    const [property, setProperty] = useState<PropertyDetails | null>(null);
    const [unit, setUnit] = useState<UnitDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const fetchLeadProfile = async () => {
            try {
                const response = await apiClient.get('/leads/my-profile');
                setLead(response.data);

                // Fetch property details if available
                if (response.data.propertyId) {
                    try {
                        // We'll need a public or accessible endpoint for property details
                        // Assuming /properties/:id is accessible or we use a new endpoint
                        const propRes = await apiClient.get(`/properties/${response.data.propertyId}`);
                        setProperty(propRes.data);
                    } catch (e) {
                        console.error("Failed to load property details", e);
                    }
                }

                // Fetch unit details if interested
                if (response.data.interestedUnit) {
                    try {
                        const unitRes = await apiClient.get(`/units/${response.data.interestedUnit}`);
                        setUnit(unitRes.data);
                    } catch (e) {
                        console.error("Failed to load unit details", e);
                    }
                }
            } catch (error: any) {
                console.error("Failed to fetch lead profile", error);
                setErrorMsg(error.response?.data?.error || 'Could not load your application details.');
            } finally {
                setLoading(false);
            }
        };

        fetchLeadProfile();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="size-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-semibold text-red-600">Profile Not Found</h2>
                <p className="text-gray-600 mt-2">{errorMsg}</p>
                <p className="text-xs text-gray-400 mt-4">User: {user?.email}</p>
            </div>
        );
    }

    const getStatusBadge = (status: string) => {
        const variants: any = {
            interested: { label: 'Interested', color: 'bg-blue-100 text-blue-700' },
            converted: { label: 'Converted', color: 'bg-green-100 text-green-700' },
            dropped: { label: 'Dropped', color: 'bg-gray-100 text-gray-700' },
        };
        const variant = variants[status] || variants['interested'];
        return (
            <Badge variant="outline" className={`${variant.color} border-0`}>
                {variant.label}
            </Badge>
        );
    };

    return (
        <div className="container mx-auto p-6 max-w-5xl space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Application Dashboard</h1>
                    <p className="text-gray-500 mt-1">Hello, {user?.name}</p>
                    <p className="text-xs text-gray-400">Lead ID: {lead.id}</p>
                </div>
                {getStatusBadge(lead.status)}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Details */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Property Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {property ? (
                                <div>
                                    <h3 className="font-semibold text-lg">{property.name}</h3>
                                    <p className="text-gray-600">{property.address_line_1}</p>
                                </div>
                            ) : (
                                <p className="text-gray-500 italic">Property details unavailable</p>
                            )}

                            <Separator />

                            <div>
                                <p className="text-sm font-medium text-gray-500 mb-1">Unit of Interest</p>
                                <p className="font-medium text-gray-900">
                                    {unit ? `Unit ${unit.unitNumber} (${unit.type})` : (lead.interestedUnit ? `Unit ID: ${lead.interestedUnit}` : 'General Inquiry')}
                                </p>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-500 mb-1">Submitted On</p>
                                <p className="font-medium text-gray-900">{new Date(lead.createdAt).toLocaleDateString()}</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Contact Info</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm text-gray-600"><span className="font-medium">Email:</span> {lead.email}</p>
                            <p className="text-sm text-gray-600"><span className="font-medium">Phone:</span> {lead.phone}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Chat */}
                <div className="lg:col-span-2">
                    <ChatInterface leadId={lead.id} />
                </div>
            </div>
        </div>
    );
}
