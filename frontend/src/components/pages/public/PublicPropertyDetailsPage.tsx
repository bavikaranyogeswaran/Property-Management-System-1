import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp, Property, Unit } from '@/app/context/AppContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
    Building2, MapPin, ArrowLeft, CheckCircle2, Shield,
    Car, Wrench, Ruler, Home, Info, Share2, Star, Phone
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function PublicPropertyDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { properties, units, addLead } = useApp();
    const [property, setProperty] = useState<Property | null>(null);
    const [propertyUnits, setPropertyUnits] = useState<Unit[]>([]);

    // Interest Form State
    const [interestFormData, setInterestFormData] = useState({
        name: '',
        email: '',
        phone: '',
        interestedUnit: '',
        propertyId: '',
        notes: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMobileInterestOpen, setIsMobileInterestOpen] = useState(false);
    const [isUnitLocked, setIsUnitLocked] = useState(false); // Validating feature request: lock unit if selected via card

    useEffect(() => {
        if (id && properties.length > 0) {
            const foundProperty = properties.find(p => p.id === id);
            if (foundProperty) {
                setProperty(foundProperty);
                setPropertyUnits(units.filter(u => u.propertyId === id));
                setInterestFormData(prev => ({ ...prev, propertyId: id }));
                // Scroll to top on load
                window.scrollTo(0, 0);
            }
        }
    }, [id, properties, units]);

    const handleInterestSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await addLead({
                ...interestFormData,
                status: 'interested',
            });
            toast.success('Interest registered! We will contact you soon.');
            setInterestFormData({ name: '', email: '', phone: '', interestedUnit: '', notes: '', propertyId: id || '' });
            setIsMobileInterestOpen(false);
        } catch (error) {
            toast.error('Failed to submit interest');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenInterestModal = (unitId: string = '') => {
        setInterestFormData(prev => ({ ...prev, interestedUnit: unitId }));
        setIsUnitLocked(!!unitId); // Lock if a specific unit ID is passed
        setIsMobileInterestOpen(true);
    };


    if (!property) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="text-gray-500 font-medium">Loading details...</p>
                </div>
            </div>
        );
    }

    const availableUnitsCount = propertyUnits.filter(u => u.status === 'available').length;
    const minRent = propertyUnits.length > 0
        ? Math.min(...propertyUnits.map(u => u.monthlyRent))
        : 0;

    return (
        <>
            <div className="min-h-screen bg-white">
                {/* Navigation Bar - Transparent/Blurry */}
                <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
                    <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => navigate('/browse-properties')}
                            className="text-gray-600 hover:text-gray-900 -ml-2 hover:bg-gray-100/50"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Listings
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-gray-600 border-gray-200 hover:bg-gray-50"
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    toast.success('Link copied to clipboard');
                                }}
                            >
                                <Share2 className="w-4 h-4 mr-2" />
                                Share
                            </Button>
                        </div>
                    </div>
                </nav>

                {/* Hero Section */}
                <div className="relative w-full h-[50vh] min-h-[400px] md:h-[60vh] bg-gray-900 overflow-hidden">
                    {property.image ? (
                        <img
                            src={property.image}
                            alt={property.name}
                            className="w-full h-full object-cover opacity-90 transition-transform duration-1000 hover:scale-105"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-600">
                            <Building2 className="w-32 h-32 opacity-20" />
                        </div>
                    )}
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />

                    {/* Hero Content */}
                    <div className="absolute bottom-0 left-0 right-0 pb-12 pt-24 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="container mx-auto px-4 md:px-6">
                            <div className="max-w-4xl">
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-none px-3 py-1 text-sm font-medium tracking-wide">
                                        {property.typeName}
                                    </Badge>
                                    {availableUnitsCount > 0 ? (
                                        <Badge variant="secondary" className="bg-green-500/90 text-white backdrop-blur-sm border-none">
                                            {availableUnitsCount} Units Available
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="bg-gray-500/90 text-white backdrop-blur-sm border-none">
                                            No Vacancy
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight shadow-sm">
                                    {property.name}
                                </h1>
                                <Button
                                    size="lg"
                                    className="bg-white text-blue-600 hover:bg-gray-100 font-bold shadow-lg md:self-start"
                                    onClick={() => handleOpenInterestModal()}
                                >
                                    I'm Interested
                                </Button>
                            </div>
                            <div className="flex items-center text-gray-200 text-lg md:text-xl font-light">
                                <MapPin className="w-5 h-5 mr-2 text-blue-400 shrink-0" />
                                {property.addressLine1}, {property.addressLine2} {property.addressLine3}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 md:px-6 py-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

                    {/* Main Content */}
                    {/* Main Content - Full Width */}
                    <div className="col-span-12 space-y-12">

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-8 border-y border-gray-100">
                            <div className="space-y-1">
                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Starting Price</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {minRent > 0 ? `LKR ${minRent.toLocaleString()}` : 'N/A'}
                                    <span className="text-sm font-normal text-gray-400 ml-1">/mo</span>
                                </p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Property Type</p>
                                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                                    <Building2 className="w-5 h-5 text-gray-400" />
                                    {property.typeName}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Total Units</p>
                                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                                    <Home className="w-5 h-5 text-gray-400" />
                                    {propertyUnits.length} Units
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Rating</p>
                                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                                    4.9 <span className="text-gray-400 font-normal">(12 reviews)</span>
                                </div>
                            </div>
                        </div>

                        {/* About Section */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">About the Property</h2>
                            <div className="prose prose-lg text-gray-600 max-w-none leading-relaxed">
                                <p>
                                    Welcome to {property.name}, where modern living meets exceptional convenience.
                                    Located in a prime neighborhood, this property offers thoughtfully designed spaces
                                    perfect for your lifestyle.
                                </p>
                                <p>
                                    Experience the perfect blend of comfort and style. Our dedicated management team
                                    ensures a hassle-free living experience, allowing you to focus on what matters most.
                                </p>
                            </div>
                        </section>

                        {/* Amenities Section */}
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Features & Amenities</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                                    <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                                        <Shield className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <span className="font-medium text-gray-700">24/7 Security Surveillance</span>
                                </div>
                                <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                                    <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                                        <Car className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <span className="font-medium text-gray-700">Dedicated Parking</span>
                                </div>
                                <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                                    <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                                        <Wrench className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <span className="font-medium text-gray-700">On-site Maintenance</span>
                                </div>
                                <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                                    <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                                        <CheckCircle2 className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <span className="font-medium text-gray-700">Modern Interiors</span>
                                </div>
                            </div>
                        </section>

                        {/* Units Section */}
                        <section>
                            <div className="flex items-center justify-between mb-8">
                                <h2 className="text-2xl font-bold text-gray-900">Available Units</h2>
                                <span className="text-gray-500 font-medium">{availableUnitsCount} listings</span>
                            </div>

                            <div className="space-y-4">
                                {propertyUnits
                                    .sort((a, b) => (a.status === 'available' ? -1 : 1))
                                    .map((unit) => (
                                        <div
                                            key={unit.id}
                                            className={`group bg-white border border-gray-100 rounded-2xl p-4 transition-all hover:shadow-lg hover:border-blue-100 flex flex-col md:flex-row gap-6 ${unit.status !== 'available' ? 'opacity-70 grayscale-[0.5]' : ''
                                                }`}
                                        >
                                            {/* Unit Image */}
                                            <div className="w-full md:w-56 h-48 md:h-auto bg-gray-100 rounded-xl overflow-hidden relative shrink-0">
                                                {unit.image ? (
                                                    <img
                                                        src={unit.image}
                                                        alt={`Unit ${unit.unitNumber}`}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                        <Home className="w-10 h-10" />
                                                    </div>
                                                )}
                                                <div className="absolute top-3 left-3">
                                                    <Badge className={
                                                        unit.status === 'available'
                                                            ? 'bg-green-500 hover:bg-green-600 border-none'
                                                            : 'bg-gray-500 hover:bg-gray-600 border-none'
                                                    }>
                                                        {unit.status.toUpperCase()}
                                                    </Badge>
                                                </div>
                                            </div>

                                            {/* Unit Info */}
                                            <div className="flex-1 flex flex-col justify-center py-2">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                                            Unit {unit.unitNumber}
                                                        </h3>
                                                        <p className="text-gray-500 font-medium">{unit.type} Layout</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-blue-600">
                                                            LKR {unit.monthlyRent.toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-gray-400">per month</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 my-4">
                                                    <div className="flex items-center text-sm text-gray-600">
                                                        <Ruler className="w-4 h-4 mr-2 text-gray-400" />
                                                        <span>Spacious Layout</span>
                                                    </div>
                                                    <div className="flex items-center text-sm text-gray-600">
                                                        <CheckCircle2 className="w-4 h-4 mr-2 text-gray-400" />
                                                        <span>Move-in Ready</span>
                                                    </div>
                                                </div>

                                                <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-end">
                                                    {unit.status === 'available' ? (
                                                        <Button
                                                            onClick={() => handleOpenInterestModal(unit.id)}
                                                            className="px-6"
                                                        >
                                                            I'm Interested
                                                        </Button>
                                                    ) : (
                                                        <Button variant="outline" disabled className="bg-gray-50">
                                                            Unavailable
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                {propertyUnits.length === 0 && (
                                    <div className="py-12 bg-gray-50 rounded-2xl border border-dashed text-center">
                                        <Info className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                        <p className="text-gray-500 font-medium">No units listed for this property yet.</p>
                                    </div>
                                )}
                            </div>
                        </section>

                    </div>

                    {/* Right Sidebar Removed - Full Width Layout Now */}
                    {/* We can keep this empty col or remove the grid layout entirely in a later refactor. 
                       For now, let's just make the main content span full width. */}
                </div>
            </div>

            {/* Mobile Interest Dialog */}
            <Dialog open={isMobileInterestOpen} onOpenChange={setIsMobileInterestOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center text-xl pb-2 border-b">Contact Us</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleInterestSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="mobile-name">Full Name</Label>
                            <Input
                                id="mobile-name"
                                value={interestFormData.name}
                                onChange={e => setInterestFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="bg-white border-gray-200"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile-email">Email</Label>
                            <Input
                                id="mobile-email"
                                type="email"
                                value={interestFormData.email}
                                onChange={e => setInterestFormData(prev => ({ ...prev, email: e.target.value }))}
                                className="bg-white border-gray-200"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile-phone">Phone</Label>
                            <Input
                                id="mobile-phone"
                                value={interestFormData.phone}
                                onChange={e => setInterestFormData(prev => ({ ...prev, phone: e.target.value }))}
                                className="bg-white border-gray-200"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile-unit">Ref Unit</Label>
                            {isUnitLocked ? (
                                <div className="flex h-10 w-full rounded-md border border-input bg-gray-100 px-3 py-2 text-sm items-center text-gray-600 cursor-not-allowed">
                                    {propertyUnits.find(u => u.id === interestFormData.interestedUnit)?.unitNumber
                                        ? `Unit ${propertyUnits.find(u => u.id === interestFormData.interestedUnit)?.unitNumber}`
                                        : 'Selected Unit'}
                                </div>
                            ) : (
                                <select
                                    id="mobile-unit"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    value={interestFormData.interestedUnit}
                                    onChange={e => setInterestFormData(prev => ({ ...prev, interestedUnit: e.target.value }))}
                                >
                                    <option value="">Whole Property / Any</option>
                                    {propertyUnits
                                        .filter(u => u.status === 'available')
                                        .map(u => (
                                            <option key={u.id} value={u.id}>Unit {u.unitNumber} (LKR {u.monthlyRent.toLocaleString()})</option>
                                        ))
                                    }
                                </select>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mobile-message">Message</Label>
                            <Textarea
                                id="mobile-message"
                                value={interestFormData.notes}
                                onChange={e => setInterestFormData(prev => ({ ...prev, notes: e.target.value }))}
                                className="bg-white border-gray-200 min-h-[100px]"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isSubmitting}>
                            {isSubmitting ? 'Sending...' : 'Send Inquiry'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
