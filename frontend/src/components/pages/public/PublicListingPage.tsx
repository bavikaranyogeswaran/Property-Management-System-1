import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, Property, Unit } from '@/app/context/AppContext';
import apiClient from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Edit, Trash2, Eye, ArrowLeft, Search, X } from 'lucide-react';
import { toast } from 'sonner';

// ... imports
import { ScheduleVisitDialog } from './ScheduleVisitDialog';

export function PublicListingPage({ onNavigate }: { onNavigate?: (page: string) => void }) {

    const { addLead } = useApp();
    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPublicData = async () => {
            setLoading(true);
            try {
                // Fetch properties with public flag
                const pRes = await apiClient.get('/properties?public=true');
                if (pRes.data) {
                    // Map if necessary, similar to AppContext
                    const mappedProps = pRes.data.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        propertyTypeId: p.propertyTypeId,
                        typeName: p.typeName,
                        propertyNo: p.propertyNo || '',
                        street: p.street || '',
                        city: p.city || '',
                        district: p.district || '',
                        image: p.image,
                        createdAt: p.createdAt,
                        description: p.description,
                        features: p.features
                    }));
                    setProperties(mappedProps);
                }

                // Fetch units with public flag
                const uRes = await apiClient.get('/units?public=true');
                if (uRes.data) {
                    const mappedUnits = uRes.data.map((u: any) => ({
                        id: u.id,
                        propertyId: u.propertyId,
                        unitNumber: u.unitNumber,
                        unitTypeId: u.unitTypeId,
                        type: u.type,
                        monthlyRent: u.monthlyRent,
                        status: u.status,
                        image: u.image,
                        createdAt: u.createdAt,
                    }));
                    setUnits(mappedUnits);
                }
            } catch (error) {
                console.error("Failed to fetch public listings", error);
                toast.error("Failed to load properties");
            } finally {
                setLoading(false);
            }
        };

        fetchPublicData();
    }, []);

    const [isInterestDialogOpen, setIsInterestDialogOpen] = useState(false);
    const [interestFormData, setInterestFormData] = useState({
        name: '',
        email: '',
        phone: '',
        interestedUnit: '',
        notes: '',
    });
    const [interestProperty, setInterestProperty] = useState<Property | null>(null);

    // Schedule Visit State
    const [isVisitDialogOpen, setIsVisitDialogOpen] = useState(false);
    const [visitProperty, setVisitProperty] = useState<Property | null>(null);

    const [searchQuery, setSearchQuery] = useState('');

    const navigate = useNavigate();

    // ... (keep calculate filteredProperties)
    const filteredProperties = properties.filter(property => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;

        return (
            (property.street && property.street.toLowerCase().includes(query)) ||
            (property.city && property.city.toLowerCase().includes(query)) ||
            (property.district && property.district.toLowerCase().includes(query))
        );
    });

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addLead({
                ...interestFormData,
                status: 'interested',
                propertyId: interestProperty?.id || '',
            });
            toast.success('Interest registered! We will contact you soon.');
            setIsInterestDialogOpen(false);
            setInterestFormData({ name: '', email: '', phone: '', interestedUnit: '', notes: '' });
            setInterestProperty(null);
        } catch (error) {
            toast.error('Failed to submit interest');
        }
    };

    const openInterestDialog = (property: Property) => {
        setInterestProperty(property);
        setInterestFormData(prev => ({ ...prev, interestedUnit: '' }));
        setIsInterestDialogOpen(true);
    };

    const openVisitDialog = (property: Property) => {
        setVisitProperty(property);
        setIsVisitDialogOpen(true);
    };

    return (
        <div className="space-y-6 container mx-auto px-6 py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    {onNavigate && (
                        <Button variant="ghost" className="mb-4 pl-0 hover:pl-2 transition-all" onClick={() => onNavigate('landing')}>
                            <ArrowLeft className="size-4 mr-2" /> Back to Home
                        </Button>
                    )}
                    <h1 className="text-3xl font-bold text-gray-900">Browse Properties</h1>
                    <p className="text-gray-500 mt-2 text-lg">Discover your next dream home from our premium listings</p>
                </div>

                {/* Search Filter */}
                <div className="w-full md:w-96 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 size-4" />
                    <Input
                        placeholder="Search by street, city, or district..."
                        className="pl-9 pr-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProperties.map((property) => (
                    <Card key={property.id} className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-300">
                        {property.image ? (
                            <div className="h-64 w-full bg-gray-100 relative group cursor-pointer" onClick={() => navigate(`/property/${property.id}`)}>
                                <img
                                    src={property.image}
                                    alt={property.name}
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                                />
                                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
                                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full text-sm font-semibold shadow-sm">
                                    {property.typeName}
                                </div>
                            </div>
                        ) : (
                            <div className="h-64 w-full bg-blue-50 flex items-center justify-center cursor-pointer" onClick={() => navigate(`/property/${property.id}`)}>
                                <Building2 className="size-16 text-blue-200" />
                            </div>
                        )}

                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 leading-tight mb-1">{property.name}</h3>
                                    {!property.image && <p className="text-sm text-gray-500">{property.typeName}</p>}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col pt-0">
                            <div className="space-y-4 flex-1">
                                <div className="text-gray-600">
                                    <p className="font-medium text-gray-900 mb-1">Location</p>
                                    <p className="text-sm">{property.propertyNo} {property.street}</p>
                                    <p className="text-sm">{property.city} {property.district}</p>
                                </div>

                                <div className="pt-4 border-t flex justify-between items-end">
                                    {(() => {
                                        const propertyUnits = units.filter(u => u.propertyId === property.id);
                                        const totalCount = propertyUnits.length;
                                        const availableCount = propertyUnits.filter(u => u.status === 'available').length;

                                        // Show block if there are ANY units (even if 0 available)
                                        // Hide only if property has NO units created (Total = 0)
                                        return totalCount > 0 ? (
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wide">Available Units</p>
                                                <p className={`text-2xl font-bold ${availableCount > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                                    {availableCount}
                                                </p>
                                            </div>
                                        ) : null;
                                    })()}
                                    <div className={`text-right ${units.filter(u => u.propertyId === property.id).length === 0 ? 'w-full text-left' : ''}`}>
                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting From</p>
                                        <p className="text-lg font-semibold text-gray-900">
                                            {/* Calculate min rent logic */}
                                            LKR {(() => {
                                                const rents = units.filter(u => u.propertyId === property.id).map(u => u.monthlyRent);
                                                const minRent = rents.length > 0 ? Math.min(...rents) : 0;
                                                return minRent > 0 ? minRent.toLocaleString() : 'N/A';
                                            })()}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 mt-auto flex flex-col gap-2">
                                <div className="flex gap-2">
                                    <Button
                                        className="flex-1"
                                        variant="outline"
                                        onClick={() => navigate(`/property/${property.id}`)}
                                    >
                                        View Details
                                    </Button>
                                    <Button
                                        className="flex-1"
                                        variant="secondary"
                                        onClick={() => openVisitDialog(property)}
                                    >
                                        Schedule Visit
                                    </Button>
                                </div>


                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {properties.length === 0 && (
                <div className="text-center py-20">
                    <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Building2 className="size-10 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No Properties Found</h3>
                    <p className="text-gray-500">Check back later for new listings.</p>
                </div>
            )}


            {/* Interest Dialog */}
            <Dialog open={isInterestDialogOpen} onOpenChange={setIsInterestDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>I'm Interested in {interestProperty?.name}</DialogTitle>
                        <p className="text-sm text-gray-500">Leave your details and we'll get back to you.</p>
                    </DialogHeader>
                    <form onSubmit={handleInterestSubmit} className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label htmlFor="lead-name">Name</Label>
                            <Input
                                id="lead-name"
                                placeholder="Your full name"
                                value={interestFormData.name}
                                onChange={(e) => setInterestFormData({ ...interestFormData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="lead-email">Email</Label>
                                <Input
                                    id="lead-email"
                                    type="email"
                                    placeholder="email@example.com"
                                    value={interestFormData.email}
                                    onChange={(e) => setInterestFormData({ ...interestFormData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lead-phone">Phone</Label>
                                <Input
                                    id="lead-phone"
                                    placeholder="+94 77 123 4567"
                                    value={interestFormData.phone}
                                    onChange={(e) => setInterestFormData({ ...interestFormData, phone: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lead-unit">Interested In</Label>
                            <div className="relative">
                                <select
                                    id="lead-unit"
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={interestFormData.interestedUnit}
                                    onChange={(e) => setInterestFormData({ ...interestFormData, interestedUnit: e.target.value })}
                                    required
                                >
                                    {(() => {
                                        if (!interestProperty) return <option value="">Whole Property</option>;

                                        const pUnits = units.filter(u => u.propertyId === interestProperty.id);
                                        const avail = pUnits.filter(u => u.status === 'available');
                                        const hasUnits = pUnits.length > 0;
                                        const hasAvailable = avail.length > 0;

                                        if (!hasUnits) {
                                            // Unitless: Only Whole Property
                                            return <option value="">Whole Property</option>;
                                        }

                                        if (hasAvailable) {
                                            // Has units: Force selection
                                            return (
                                                <>
                                                    <option value="" disabled>Select a Unit...</option>
                                                    {avail.map(u => (
                                                        <option key={u.id} value={u.id}>Unit {u.unitNumber} - {u.type} (LKR {u.monthlyRent}/mo)</option>
                                                    ))}
                                                </>
                                            );
                                        }

                                        // Full: Waitlist
                                        return <option value="">Join Waitlist / General Inquiry</option>;
                                    })()}
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lead-notes">Notes / Questions</Label>
                            <textarea
                                id="lead-notes"
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="I'm interested in viewing this property..."
                                value={interestFormData.notes}
                                onChange={(e) => setInterestFormData({ ...interestFormData, notes: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <Button type="button" variant="outline" onClick={() => setIsInterestDialogOpen(false)}>Cancel</Button>
                            <Button type="submit">Submit Interest</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <ScheduleVisitDialog
                open={isVisitDialogOpen}
                onOpenChange={setIsVisitDialogOpen}
                property={visitProperty}
            />
        </div>
    );
}
