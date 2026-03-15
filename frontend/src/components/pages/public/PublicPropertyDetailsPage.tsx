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
  Building2,
  MapPin,
  ArrowLeft,
  CheckCircle2,
  Shield,
  Car,
  Wrench,
  Ruler,
  Home,
  Info,
  Share2,
  Star,
  Phone,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  validateEmail,
  validatePhoneNumber,
  validateName,
} from '@/utils/validators';
import apiClient from '@/services/api';

export function PublicPropertyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { properties, units, addLead, getPropertyImages, getUnitImages } =
    useApp();
  const [property, setProperty] = useState<Property | null>(null);
  const [propertyUnits, setPropertyUnits] = useState<Unit[]>([]);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Interest Form State
  const [interestFormData, setInterestFormData] = useState({
    name: '',
    email: '',
    phone: '',
    interestedUnit: '',
    propertyId: '',
    notes: '',
    moveInDate: '',
    occupantsCount: '1',
    preferredTermMonths: '12',
    leaseTermId: '',
  });
  const [leaseTerms, setLeaseTerms] = useState<any[]>([]);
  const [fetchingTerms, setFetchingTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobileInterestOpen, setIsMobileInterestOpen] = useState(false);
  const [isUnitLocked, setIsUnitLocked] = useState(false); // Validating feature request: lock unit if selected via card

  // Validation state
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Unit Gallery State
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [unitImages, setUnitImages] = useState<any[]>([]);
  const [unitLightboxIndex, setUnitLightboxIndex] = useState<number | null>(
    null
  );

  const handleViewUnit = async (unit: Unit) => {
    setSelectedUnit(unit);
    setUnitImages([]); // Reset
    try {
      const images = await getUnitImages(unit.id);
      setUnitImages(images || []);
    } catch (e) {
      console.error('Failed to fetch unit images', e);
    }
  };

  useEffect(() => {
    if (id && properties.length > 0) {
      const foundProperty = properties.find((p) => p.id === id);
      if (foundProperty) {
        setProperty(foundProperty);
        setPropertyUnits(units.filter((u) => u.propertyId === id));
        setInterestFormData((prev) => ({ ...prev, propertyId: id }));
        // Scroll to top on load
        window.scrollTo(0, 0);

        // Fetch gallery images
        getPropertyImages(id)
          .then((images) => {
            if (images) setGalleryImages(images);
          })
          .catch((err) => console.error('Failed to load gallery images', err));
      }
    }
  }, [id, properties, units, getPropertyImages]);

  useEffect(() => {
    if (id) {
      const fetchTerms = async () => {
        setFetchingTerms(true);
        try {
          const response = await apiClient.get(`/properties/${id}/lease-terms`);
          setLeaseTerms(response.data);
        } catch (e) {
          console.error('Failed to fetch terms', e);
        } finally {
          setFetchingTerms(false);
        }
      };
      fetchTerms();
    }
  }, [id]);

  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {};

    // Name validation
    const nameValidation = validateName(interestFormData.name);
    if (!nameValidation.isValid) {
      errors.name = nameValidation.error || 'Invalid name';
    }

    // Email validation
    const emailValidation = validateEmail(interestFormData.email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.error || 'Invalid email';
    }

    // Phone validation
    const phoneValidation = validatePhoneNumber(interestFormData.phone);
    if (!phoneValidation.isValid) {
      errors.phone = phoneValidation.error || 'Invalid phone number';
    }

    // Term validation
    if (!interestFormData.leaseTermId && parseInt(interestFormData.preferredTermMonths) < 3) {
      errors.preferredTermMonths = 'Minimum lease duration is 3 months';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInterestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Pre-submission validation
    if (!validateForm()) {
      toast.error('Please fix the form errors before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      await addLead({
        ...interestFormData,
        occupantsCount: parseInt(interestFormData.occupantsCount, 10),
        preferredTermMonths: parseInt(interestFormData.preferredTermMonths, 10),
        status: 'interested',
      });
      toast.success(
        'Account created and interest registered! We will contact you soon.'
      );
      setInterestFormData({
        name: '',
        email: '',
        phone: '',
        interestedUnit: '',
        notes: '',
        moveInDate: '',
        occupantsCount: '1',
        preferredTermMonths: '12',
        leaseTermId: '',
        propertyId: id || '',
      });
      setFormErrors({});
      setIsMobileInterestOpen(false);
    } catch (error: any) {
      console.error(error);
      // Display backend validation errors
      const errorMessage =
        error.response?.data?.error || 'Failed to submit interest';
      const errorDetails = error.response?.data?.details;

      if (errorDetails && Array.isArray(errorDetails)) {
        toast.error(errorMessage + ': ' + errorDetails.join(', '));
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenInterestModal = (unitId: string = '') => {
    setInterestFormData((prev) => ({ ...prev, interestedUnit: unitId }));
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

  const availableUnitsCount = propertyUnits.filter(
    (u) => u.status === 'available'
  ).length;
  const minRent =
    propertyUnits.length > 0
      ? Math.min(...propertyUnits.map((u) => u.monthlyRent))
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
                    <Badge
                      variant="secondary"
                      className="bg-green-500/90 text-white backdrop-blur-sm border-none"
                    >
                      {availableUnitsCount} Units Available
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-gray-500/90 text-white backdrop-blur-sm border-none"
                    >
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
                {property.propertyNo} {property.street}, {property.city}{' '}
                {property.district}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 py-8 border-y border-gray-100">
              <div className="space-y-1">
                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">
                  Starting Price
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {minRent > 0 ? `LKR ${minRent.toLocaleString()}` : 'N/A'}
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    /mo
                  </span>
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">
                  Property Type
                </p>
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <Building2 className="w-5 h-5 text-gray-400" />
                  {property.typeName}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">
                  Total Units
                </p>
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <Home className="w-5 h-5 text-gray-400" />
                  {propertyUnits.length} Units
                </div>
              </div>
            </div>

            {/* About Section */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                About the Property
              </h2>
              <div className="prose prose-lg text-gray-600 max-w-none leading-relaxed">
                {property.description ? (
                  <p className="whitespace-pre-wrap">{property.description}</p>
                ) : (
                  <>
                    <p>
                      Welcome to {property.name}, where modern living meets
                      exceptional convenience. Located in a prime neighborhood,
                      this property offers thoughtfully designed spaces perfect
                      for your lifestyle.
                    </p>
                    <p>
                      Experience the perfect blend of comfort and style. Our
                      dedicated management team ensures a hassle-free living
                      experience, allowing you to focus on what matters most.
                    </p>
                  </>
                )}
              </div>
            </section>

            {/* Gallery Section */}
            {galleryImages.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  Photo Gallery
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {galleryImages.map((img, index) => (
                    <div
                      key={img.image_id || index}
                      className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group"
                      onClick={() => setLightboxIndex(index)}
                    >
                      <img
                        src={img.image_url}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Amenities Section */}
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Features & Amenities
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {property.features && property.features.length > 0 ? (
                  property.features.map((feature, idx) => (
                    <div
                      key={idx}
                      className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100"
                    >
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <CheckCircle2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">
                        {feature}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <Shield className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">
                        24/7 Security Surveillance
                      </span>
                    </div>
                    <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <Car className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">
                        Dedicated Parking
                      </span>
                    </div>
                    <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <Wrench className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">
                        On-site Maintenance
                      </span>
                    </div>
                    <div className="flex items-center p-4 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors border border-transparent hover:border-blue-100">
                      <div className="p-2 bg-white rounded-lg shadow-sm mr-4">
                        <CheckCircle2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="font-medium text-gray-700">
                        Modern Interiors
                      </span>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Units Section */}
            <section>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-gray-900">
                  Available Units
                </h2>
                <span className="text-gray-500 font-medium">
                  {availableUnitsCount} listings
                </span>
              </div>

              <div className="space-y-4">
                {propertyUnits
                  .sort((a, b) => (a.status === 'available' ? -1 : 1))
                  .map((unit) => (
                    <div
                      key={unit.id}
                      className={`group bg-white border border-gray-100 rounded-2xl p-4 transition-all hover:shadow-lg hover:border-blue-100 flex flex-col md:flex-row gap-6 ${
                        unit.status !== 'available'
                          ? 'opacity-70 grayscale-[0.5]'
                          : ''
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
                          <Badge
                            className={
                              unit.status === 'available'
                                ? 'bg-green-500 hover:bg-green-600 border-none'
                                : 'bg-gray-500 hover:bg-gray-600 border-none'
                            }
                          >
                            {unit.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      {/* Unit Details (unchanged) */}
                      <div className="flex-1 flex flex-col justify-between p-2">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">
                                Unit {unit.unitNumber}
                              </h3>
                              <p className="text-gray-500">{unit.type}</p>
                            </div>
                            <p className="text-xl font-bold text-blue-600">
                              LKR {unit.monthlyRent.toLocaleString()}
                              <span className="text-sm font-normal text-gray-500">
                                /mo
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3 mt-4">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleViewUnit(unit)}
                          >
                            View Details
                          </Button>
                          <Button
                            className="flex-1"
                            disabled={unit.status === 'maintenance'}
                            onClick={() => handleOpenInterestModal(unit.id)}
                          >
                            {unit.status === 'available'
                              ? "I'm Interested"
                              : unit.status === 'occupied'
                              ? "Inquire for Future"
                              : 'Unavailable'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4">
          <button
            className="absolute top-4 right-4 text-white/50 hover:text-white p-2"
            onClick={() => setLightboxIndex(null)}
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) =>
                prev !== null && prev > 0 ? prev - 1 : galleryImages.length - 1
              );
            }}
          >
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <div className="max-w-[90vw] max-h-[90vh]">
            <img
              src={galleryImages[lightboxIndex].image_url}
              alt="Full screen"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            <p className="text-center text-white/70 mt-4">
              {lightboxIndex + 1} / {galleryImages.length}
            </p>
          </div>

          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white p-4"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((prev) =>
                prev !== null && prev < galleryImages.length - 1 ? prev + 1 : 0
              );
            }}
          >
            <svg
              className="w-10 h-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          {/* Close on background click */}
          <div
            className="absolute inset-0 -z-10"
            onClick={() => setLightboxIndex(null)}
          />
        </div>
      )}

      {/* Unit Details Dialog */}
      <Dialog
        open={!!selectedUnit}
        onOpenChange={(open) => !open && setSelectedUnit(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Unit {selectedUnit?.unitNumber} Details</DialogTitle>
          </DialogHeader>

          {selectedUnit && (
            <div className="space-y-6">
              {/* Unit Gallery */}
              <div className="space-y-4">
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden relative">
                  {selectedUnit.image ? (
                    <img
                      src={selectedUnit.image}
                      alt={selectedUnit.unitNumber}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Home className="w-16 h-16 opacity-20" />
                      <span className="ml-2">No main image</span>
                    </div>
                  )}
                </div>

                {unitImages.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Gallery</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {unitImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="aspect-square bg-gray-100 rounded-md overflow-hidden cursor-pointer hover:opacity-90"
                          onClick={() => setUnitLightboxIndex(idx)}
                        >
                          <img
                            src={img.image_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-sm text-gray-500">Monthly Rent</p>
                  <p className="text-xl font-bold text-blue-600">
                    LKR {selectedUnit.monthlyRent.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unit Type</p>
                  <p className="text-lg font-medium">{selectedUnit.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge
                    variant={
                      selectedUnit.status === 'available'
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {selectedUnit.status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => {
                    handleOpenInterestModal(selectedUnit.id);
                    setSelectedUnit(null);
                  }}
                >
                  I'm Interested
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unit Lightbox (Reuse logic or create new component? For simplicity, basic overlay if needed, but Dialog covers mostly. 
                If user wants full screen lightbox for unit images, we can add it. 
                For now, let's skip full lightbox for unit images inside dialog to avoid nesting complexity unless requested.) 
            */}

      {/* Interest Dialog */}
      <Dialog
        open={isMobileInterestOpen}
        onOpenChange={setIsMobileInterestOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>I'm Interested in {property.name}</DialogTitle>
            <p className="text-sm text-gray-500">
              Leave your details and we'll get back to you.
            </p>
          </DialogHeader>
          <form onSubmit={handleInterestSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name</Label>
              <Input
                id="lead-name"
                placeholder="Your full name"
                value={interestFormData.name}
                onChange={(e) => {
                  setInterestFormData({
                    ...interestFormData,
                    name: e.target.value,
                  });
                  if (formErrors.name)
                    setFormErrors({ ...formErrors, name: '' });
                }}
                className={formErrors.name ? 'border-red-500' : ''}
                required
              />
              {formErrors.name && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {formErrors.name}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  placeholder="email@example.com"
                  value={interestFormData.email}
                  onChange={(e) => {
                    setInterestFormData({
                      ...interestFormData,
                      email: e.target.value,
                    });
                    if (formErrors.email)
                      setFormErrors({ ...formErrors, email: '' });
                  }}
                  className={formErrors.email ? 'border-red-500' : ''}
                  required
                />
                {formErrors.email && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {formErrors.email}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-phone">Phone</Label>
                <Input
                  id="lead-phone"
                  placeholder="+94 77 123 4567"
                  value={interestFormData.phone}
                  onChange={(e) => {
                    setInterestFormData({
                      ...interestFormData,
                      phone: e.target.value,
                    });
                    if (formErrors.phone)
                      setFormErrors({ ...formErrors, phone: '' });
                  }}
                  className={formErrors.phone ? 'border-red-500' : ''}
                  required
                />
                {formErrors.phone && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {formErrors.phone}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-unit">Interested In</Label>
              <div className="relative">
                <select
                  id="lead-unit"
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={interestFormData.interestedUnit}
                  onChange={(e) =>
                    setInterestFormData({
                      ...interestFormData,
                      interestedUnit: e.target.value,
                    })
                  }
                  disabled={isUnitLocked}
                >
                  {propertyUnits.some(
                    (u) => u.status !== 'available' && u.status !== 'occupied'
                  ) ? null : (
                    <option value="">
                      Whole Property / Any Available Unit
                    </option>
                  )}
                  {propertyUnits.some((u) => u.status !== 'available' && u.status !== 'occupied') && (
                    <option value="" disabled>
                      Select a specific unit (Whole property unavailable due to
                      occupancy/maintenance)
                    </option>
                  )}
                  {propertyUnits
                    .filter((u) => u.status !== 'maintenance')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unitNumber} - {u.type} (LKR {u.monthlyRent.toLocaleString()}/mo) 
                        {u.status !== 'available' ? ` (${u.status.toUpperCase()})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-term">Preferred Lease Term</Label>
              <select
                id="lead-term"
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={interestFormData.leaseTermId}
                onChange={(e) => {
                  const val = e.target.value;
                  const term = leaseTerms.find(t => String(t.leaseTermId) === val);
                  setInterestFormData({
                    ...interestFormData,
                    leaseTermId: val,
                    preferredTermMonths: term?.durationMonths?.toString() || interestFormData.preferredTermMonths
                  });
                }}
                required
              >
                <option value="">Custom / Undecided</option>
                {leaseTerms.map(t => (
                  <option key={t.leaseTermId} value={t.leaseTermId.toString()}>
                    {t.name} ({t.type === 'periodic' ? 'Periodic' : `${t.durationMonths} months`})
                  </option>
                ))}
              </select>
            </div>

            {!interestFormData.leaseTermId && (
              <div className="space-y-2">
                <Label htmlFor="lead-term-custom">Custom Duration (Months)</Label>
                <Input
                  id="lead-term-custom"
                  type="number"
                  min="3"
                  value={interestFormData.preferredTermMonths}
                  onChange={(e) =>
                    setInterestFormData({
                      ...interestFormData,
                      preferredTermMonths: e.target.value,
                    })
                  }
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead-movein">Move-in Date</Label>
                <Input
                  id="lead-movein"
                  type="date"
                  value={interestFormData.moveInDate}
                  onChange={(e) =>
                    setInterestFormData({
                      ...interestFormData,
                      moveInDate: e.target.value,
                    })
                  }
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-occupants">Number of Occupants</Label>
                <Input
                  id="lead-occupants"
                  type="number"
                  min="1"
                  value={interestFormData.occupantsCount}
                  onChange={(e) =>
                    setInterestFormData({
                      ...interestFormData,
                      occupantsCount: e.target.value,
                    })
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lead-notes">Notes / Questions</Label>
              <Textarea
                id="lead-notes"
                placeholder="I'm interested in viewing this property..."
                value={interestFormData.notes}
                onChange={(e: any) =>
                  setInterestFormData({
                    ...interestFormData,
                    notes: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsMobileInterestOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Interest'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
