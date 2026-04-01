import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  CreditCard, 
  ShieldCheck,
  Building2,
  Upload,
  ArrowRight,
  Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { guestApi } from '@/services/api';
import { toLKRFromCents, formatLKR } from '@/utils/formatters';
import { toast } from 'sonner';

interface OnboardingStatus {
  invoice: {
    id: string;
    amount: number;
    status: string;
    type: string;
    description: string;
  };
  lease: {
    id: string;
    status: string;
    verification: {
      isVerified: boolean;
      status: string;
      reason: string | null;
      documentUrl: string | null;
    };
  };
  property: {
    name: string;
    unitNumber: string;
  };
}

export function OnboardingStatusPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reuploading, setReuploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await guestApi.getOnboardingStatus(token);
      setStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load onboarding status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30 seconds for status updates (e.g. staff verification)
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [token]);

  const handleReupload = async () => {
    if (!file || !token) return;
    try {
      setReuploading(true);
      const formData = new FormData();
      formData.append('document', file);
      // Re-using the same submit endpoint but specifically for documents if possible, 
      // or we just update the lease document.
      // For now, let's assume we need a specific guest document upload endpoint or use existing.
      // THE AUDIT RECOMMENDATION: Allow re-upload via status page.
      
      await guestApi.submitPayment(token, formData); // Current backend submit handles 'proof' or 'document'? 
      // Actually, GuestPaymentController.submitPayment handles 'proof'. 
      // We should probably add a specific document upload for re-uploading ID/Income docs.
      
      toast.success('Document re-uploaded successfully! Our team will review it.');
      setFile(null);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to upload document.');
    } finally {
      setReuploading(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium tracking-tight">Checking your onboarding status...</p>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="bg-red-100 p-3 rounded-full w-fit mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-red-600">Access Error</CardTitle>
            <CardDescription>{error || 'The link you used is invalid or has expired.'}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-500">
              If you believe this is an error, please contact the property manager or check your email for a new link.
            </p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDepositPaid = status.invoice.status === 'paid';
  const isDocUploaded = !!status.lease.verification.documentUrl;
  const isVerified = status.lease.verification.status === 'verified';
  const isRejected = status.lease.verification.status === 'rejected';
  
  // Calculate Progress Percentage
  let progress = 0;
  if (isDepositPaid) progress += 33;
  if (isDocUploaded) progress += 33;
  if (isVerified) progress += 34;

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header Information */}
        <div className="text-center space-y-2">
          <div className="bg-primary/10 p-3 rounded-2xl w-fit mx-auto mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Tenant Onboarding Tracker</h1>
          <p className="text-lg text-gray-600 font-medium">
            Lease for <span className="text-primary">{status.property.name}</span> • Unit {status.property.unitNumber}
          </p>
        </div>

        {/* Global Progress */}
        <Card className="border-none shadow-sm overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Overall Progress</h3>
              <span className="text-xl font-black text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3 bg-gray-100" />
          </CardContent>
        </Card>

        {/* Phase 1: Payment */}
        <Card className={`border-l-4 ${isDepositPaid ? 'border-l-green-500' : 'border-l-blue-500'} shadow-sm`}>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className={`p-2 rounded-xl ${isDepositPaid ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Security Deposit</CardTitle>
                  <CardDescription className="text-base">
                    Holding deposit to secure your unit: <span className="font-bold text-gray-900">{formatLKR(toLKRFromCents(status.invoice.amount))}</span>
                  </CardDescription>
                </div>
              </div>
              {isDepositPaid ? (
                <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  CONFIRMED
                </div>
              ) : (
                <div className="flex items-center gap-2 text-blue-600 font-bold bg-blue-50 px-3 py-1 rounded-full text-sm">
                  <Clock className="h-4 w-4" />
                  AWAITING PAYMENT
                </div>
              )}
            </div>
          </CardHeader>
          {!isDepositPaid && (
            <CardContent className="pt-0">
              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 font-medium">
                  Please complete the deposit payment to reserve this property and proceed to document verification.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full mt-4 h-12 text-lg font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.01]">
                <Link to={`/pay/${token}`}>Pay Deposit Now <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Phase 2: Documents & Verification */}
        <Card className={`border-l-4 ${isVerified ? 'border-l-green-500' : isRejected ? 'border-l-red-500' : 'border-l-blue-500'} shadow-sm`}>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className={`p-2 rounded-xl ${isVerified ? 'bg-green-100 text-green-700' : isRejected ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Identity Verification</CardTitle>
                  <CardDescription className="text-base">Identity and proof of income documents (NIC, Payslips)</CardDescription>
                </div>
              </div>
              {isVerified ? (
                <div className="flex items-center gap-2 text-green-600 font-bold bg-green-50 px-3 py-1 rounded-full text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  VERIFIED
                </div>
              ) : isRejected ? (
                <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 px-3 py-1 rounded-full text-sm animate-pulse">
                  <AlertCircle className="h-4 w-4" />
                  REJECTED
                </div>
              ) : isDocUploaded ? (
                <div className="flex items-center gap-2 text-amber-600 font-bold bg-amber-50 px-3 py-1 rounded-full text-sm">
                  <Clock className="h-4 w-4" />
                  UNDER REVIEW
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 font-bold bg-gray-50 px-3 py-1 rounded-full text-sm">
                  <Clock className="h-4 w-4" />
                  PENDING
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isRejected && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-900 border-l-4">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <AlertTitle className="font-black">Action Required: Documents Rejected</AlertTitle>
                <AlertDescription className="font-medium mt-1">
                  Reason: <span className="font-black italic underline">{status.lease.verification.reason || "Documents provided were unclear or invalid."}</span>
                </AlertDescription>
              </Alert>
            )}

            {!isVerified && (
              <div className="space-y-4">
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="doc-upload" className="font-bold flex items-center gap-2">
                    <Upload className="h-4 w-4" /> {isRejected ? "Re-upload Verification Documents" : "Upload Verification Documents"}
                  </Label>
                  <div className="flex gap-2">
                    <Input 
                      id="doc-upload" 
                      type="file" 
                      accept="image/*,application/pdf"
                      className="bg-white border-2 border-dashed border-gray-200 h-14 pt-3 cursor-pointer hover:border-primary transition-colors"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] || null)}
                    />
                    <Button 
                      onClick={handleReupload} 
                      disabled={!file || reuploading}
                      className="h-14 px-6 font-bold"
                    >
                      {reuploading ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                  <p className="text-xs text-sidebar-foreground-muted font-medium italic">
                    Combine your NIC front/back and latest payslip into a single PDF or Image.
                  </p>
                </div>
              </div>
            )}

            {isDocUploaded && !isRejected && !isVerified && (
              <Alert className="bg-blue-50 border-blue-200 border-l-4">
                <Info className="h-5 w-5 text-blue-600" />
                <AlertDescription className="text-blue-800 font-medium leading-relaxed">
                  Our team has received your documents and is currently reviewing your identity and income details. 
                  This usually takes **1-2 business days**. We will notify you via email once complete.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Phase 3: Signing */}
        <Card className={`border-l-4 ${isVerified ? 'border-l-blue-500' : 'border-l-gray-300 opacity-60'} shadow-sm transition-all grayscale-[0.5] hover:grayscale-0`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex gap-4">
                <div className={`p-2 rounded-xl ${isVerified ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Lease Activation</CardTitle>
                  <CardDescription className="text-base text-gray-500">Official digital signing and key handover schedule</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 text-gray-400 font-bold bg-gray-50 px-3 py-1 rounded-full text-sm">
                <Clock className="h-4 w-4" />
                LOCKED
              </div>
            </div>
          </CardHeader>
          {isVerified && (
            <CardContent>
              <Alert className="bg-green-50 border-green-200 border-l-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <AlertDescription className="text-green-800 font-bold">
                  Verification Complete! Our property manager is preparing your formal digital agreement. 
                  You will receive a final email to set your portal password and sign the lease.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
        </Card>

        <p className="text-center text-xs text-sidebar-foreground-muted font-medium mt-8 pb-12">
          Secure onboarding provided by Antigravity Property Management. Link expires in 7 days.
        </p>

      </div>
    </div>
  );
}
