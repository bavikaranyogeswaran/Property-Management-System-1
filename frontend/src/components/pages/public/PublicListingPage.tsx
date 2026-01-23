import React, { useState } from 'react';
import { useApp, Property } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Building2, Plus, Edit, Trash2, Eye, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export function PublicListingPage({ onNavigate }: { onNavigate?: (page: string) => void }) {
    const { properties, units, addLead } = useApp();
    const [isInterestDialogOpen, setIsInterestDialogOpen] = useState(false);
    const [interestFormData, setInterestFormData] = useState({
        name: '',
        email: '',
        phone: '',
        interestedUnit: '',
        notes: '',
    });
    const [interestProperty, setInterestProperty] = useState<Property | null>(null);
    const [viewProperty, setViewProperty] = useState<Property | null>(null);

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await addLead({
                ...interestFormData,
                status: 'interested',
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
        const availableUnit = units.find(u => u.propertyId === property.id && u.status === 'available');
        setInterestFormData(prev => ({ ...prev, interestedUnit: availableUnit?.id || '' }));
        setIsInterestDialogOpen(true);
    };

    const getUnitCount = (propertyId: string) => {
        return units.filter(u => u.propertyId === propertyId).length;
    };

    return (
        <div className="space-y-6 container mx-auto px-6 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    {onNavigate && (
                        <Button variant="ghost" className="mb-4 pl-0 hover:pl-2 transition-all" onClick={() => onNavigate('landing')}>
                            <ArrowLeft className="size-4 mr-2" /> Back to Home
                        </Button>
                    )}
                    <h1 className="text-3xl font-bold text-gray-900">Browse Properties</h1>
                    <p className="text-gray-500 mt-2 text-lg">Discover your next dream home from our premium listings</p>
                </div>
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {properties.map((property) => (
                    <Card key={property.id} className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-300">
                        {property.image ? (
                            <div className="h-64 w-full bg-gray-100 relative group cursor-pointer" onClick={() => setViewProperty(property)}>
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
                            <div className="h-64 w-full bg-blue-50 flex items-center justify-center cursor-pointer" onClick={() => setViewProperty(property)}>
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
                                    <p className="text-sm">{property.addressLine1}</p>
                                    <p className="text-sm">{property.addressLine2} {property.addressLine3}</p>
                                </div>

                                <div className="pt-4 border-t grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Available Units</p>
                                        <p className="text-2xl font-bold text-green-600">
                                            {units.filter(u => u.propertyId === property.id && u.status === 'available').length}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Starting From</p>
                                        <p className="text-lg font-semibold text-gray-900">
                                            {/* Calculate min rent logic or just show placeholder */}
                                            LKR {Math.min(...units.filter(u => u.propertyId === property.id).map(u => u.monthlyRent), 0) || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 mt-auto flex gap-3">
                                <Button
                                    className="flex-1"
                                    variant="outline"
                                    onClick={() => setViewProperty(property)}
                                >
                                    View Details
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => openInterestDialog(property)}
                                >
                                    I'm Interested
                                </Button>
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

            {/* View Property Details Dialog */}
            <Dialog open={!!viewProperty} onOpenChange={(open) => !open && setViewProperty(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">Property Details</DialogTitle>
                    </DialogHeader>
                    {viewProperty && (
                        <div className="space-y-8 mt-4">
                            {/* Large Image View */}
                            <div className="w-full aspect-[21/9] bg-gray-100 rounded-xl overflow-hidden shadow-inner">
                                {viewProperty.image ? (
                                    <img
                                        src={viewProperty.image}
                                        alt={viewProperty.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                        <Building2 className="size-16 mb-2 opacity-20" />
                                        <p>No image available</p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="md:col-span-2 space-y-6">
                                    <div>
                                        <h3 className="text-3xl font-bold text-gray-900 mb-2">{viewProperty.name}</h3>
                                        <div className="flex items-center gap-2 text-blue-600 font-medium">
                                            <Building2 className="size-5" />
                                            {viewProperty.typeName}
                                        </div>
                                    </div>

                                    <div className="prose max-w-none text-gray-600">
                                        <p>
                                            Located at {viewProperty.addressLine1}, {viewProperty.addressLine2} {viewProperty.addressLine3}.
                                            This Premium property offers modern amenities and comfortable living spaces designed for your lifestyle.
                                        </p>
                                    </div>

                                    <div className="border-t pt-6">
                                        <h4 className="font-semibold text-gray-900 mb-4">Features & Amenities</h4>
                                        <ul className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> 24/7 Security</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Parking Available</li>
                                            <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> Maintenance Support</li>
                                        </ul>
                                    </div>

                                    {/* Units Listing Section */}
                                    <div className="border-t pt-6">
                                        <h4 className="font-semibold text-gray-900 mb-4">Available Units</h4>
                                        <div className="space-y-4">
                                            {units.filter(u => u.propertyId === viewProperty.id).length > 0 ? (
                                                <div className="grid grid-cols-1 gap-4">
                                                    {units
                                                        .filter(u => u.propertyId === viewProperty.id)
                                                        .sort((a, b) => (a.status === 'available' ? -1 : 1)) // Show available first
                                                        .map((unit) => (
                                                            <div key={unit.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border hover:border-blue-200 transition-colors">
                                                                <div className="flex items-center gap-4">
                                                                    {unit.image ? (
                                                                        <div className="h-16 w-16 bg-gray-200 rounded-md overflow-hidden flex-shrink-0">
                                                                            <img src={unit.image} alt={`Unit ${unit.unitNumber}`} className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="h-16 w-16 bg-gray-200 rounded-md flex items-center justify-center flex-shrink-0">
                                                                            <Building2 className="size-8 text-gray-400" />
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className="font-bold text-gray-900">Unit {unit.unitNumber}</span>
                                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wide ${unit.status === 'available'
                                                                                    ? 'bg-green-100 text-green-700'
                                                                                    : unit.status === 'maintenance'
                                                                                        ? 'bg-amber-100 text-amber-700'
                                                                                        : 'bg-gray-200 text-gray-600'
                                                                                }`}>
                                                                                {unit.status}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-sm text-gray-600">{unit.type}</p>
                                                                        <p className="font-semibold text-blue-600">LKR {unit.monthlyRent.toLocaleString()}</p>
                                                                    </div>
                                                                </div>

                                                                {unit.status === 'available' && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setInterestProperty(viewProperty);
                                                                            setInterestFormData(prev => ({ ...prev, interestedUnit: unit.id }));
                                                                            setViewProperty(null);
                                                                            setIsInterestDialogOpen(true);
                                                                        }}
                                                                    >
                                                                        I'm Interested
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                            ) : (
                                                <p className="text-gray-500 italic">No units listed for this property yet.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-gray-50 p-6 rounded-xl border space-y-4">
                                        <h4 className="font-semibold text-gray-900">Availability</h4>
                                        <div className="flex justify-between items-center py-2 border-b">
                                            <span className="text-gray-600">Total Units</span>
                                            <span className="font-bold">{getUnitCount(viewProperty.id)}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-2 border-b">
                                            <span className="text-gray-600">Vacant</span>
                                            <span className="font-bold text-green-600">
                                                {units.filter(u => u.propertyId === viewProperty.id && u.status === 'available').length}
                                            </span>
                                        </div>
                                        <Button className="w-full" size="lg" onClick={() => { openInterestDialog(viewProperty); setViewProperty(null); }}>
                                            I'm Interested
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Interest Dialog (Same as before) */}
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
                            <Label htmlFor="lead-unit">Interested Unit (Optional)</Label>
                            <div className="relative">
                                <select
                                    id="lead-unit"
                                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={interestFormData.interestedUnit}
                                    onChange={(e) => setInterestFormData({ ...interestFormData, interestedUnit: e.target.value })}
                                >
                                    <option value="">Any available unit</option>
                                    {interestProperty && units
                                        .filter(u => u.propertyId === interestProperty.id && u.status === 'available')
                                        .map(u => (
                                            <option key={u.id} value={u.id}>Unit {u.unitNumber} - {u.type} (LKR {u.monthlyRent}/mo)</option>
                                        ))
                                    }
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
        </div>
    );
}
