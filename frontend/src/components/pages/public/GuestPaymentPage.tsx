import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, 
  Building2, 
  MapPin, 
  Receipt, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Info,
  CreditCard,
  Banknote
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import apiClient from '@/services/api';

interface InvoiceDetails {
  id: number;
  amount: number;
  type: string;
  propertyName: string;
  unitNumber: string;
  description: string;
  status: string;
}

export function GuestPaymentPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  // PayHere State
  const [payHereData, setPayHereData] = useState<any>(null);
  const [preparingPayHere, setPreparingPayHere] = useState(false);

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get(`/public/invoice/${token}`);
        setInvoice({
          ...response.data,
          amount: response.data.amount / 100
        });
      } catch (err: any) {
        setError(err.response?.data?.error || 'Invalid or expired payment link.');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInvoice();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please upload your payment proof (receipt image).');
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('paymentMethod', paymentMethod);
    formData.append('referenceNumber', referenceNumber);
    formData.append('paymentDate', new Date().toISOString().split('T')[0]);
    formData.append('proof', file);

    try {
      await apiClient.post(`/public/invoice/${token}/submit`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setSuccess(true);
      toast.success('Payment submitted successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayOnline = async () => {
    try {
      setPreparingPayHere(true);
      const response = await apiClient.get(`/payhere/checkout/public/${token}`);
      const checkoutData = response.data.data;
      
      // Save token to localStorage so PaymentSuccessPage can find it if PayHere strips URL params
      if (token) {
        localStorage.setItem('last_payment_token', token);
      }
      
      setPayHereData(checkoutData);
      
      // We'll use a timeout to let the form render before submitting
      setTimeout(() => {
        const form = document.getElementById('payhere-checkout-form') as HTMLFormElement;
        if (form) form.submit();
      }, 100);

    } catch (err: any) {
      toast.error('Failed to initialize online payment. Please use bank transfer or try again.');
      console.error('PayHere Init Error:', err);
    } finally {
      setPreparingPayHere(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 animate-pulse">Verifying payment link...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-md mx-auto mt-12 px-4">
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button 
          variant="outline" 
          className="w-full mt-6"
          onClick={() => navigate('/')}
        >
          Back to Homepage
        </Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto mt-12 px-4 text-center animate-in fade-in zoom-in duration-500">
        <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Received!</h1>
        <p className="text-lg text-gray-600 mb-8">
          Thank you for submitting your deposit for <strong>{invoice.propertyName}</strong>, Unit <strong>{invoice.unitNumber}</strong>. 
          Our team is verifying the funds now.
        </p>
        
        <Card className="bg-blue-50 border-blue-100 text-left mb-8 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Next Steps
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="text-sm text-blue-700 space-y-2">
                    <li className="flex gap-2">
                        <span className="font-bold">1.</span>
                        <span>Verification: Typical verification takes 2-4 business hours.</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="font-bold">2.</span>
                        <span>Activation: Once verified, your lease will automatically activate.</span>
                    </li>
                    <li className="flex gap-2">
                        <span className="font-bold">3.</span>
                        <span>Login: You will receive an email to set your password and access your tenant portal.</span>
                    </li>
                </ul>
            </CardContent>
        </Card>

        <Button 
          className="px-8"
          onClick={() => navigate('/')}
        >
          Finish
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider mb-4 shadow-sm">
          <ShieldCheck className="w-3 h-3" />
          Secure Deposit Payment
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Final Step: Secure Your Home</h1>
        <p className="text-gray-500 mt-2">Submit your deposit to lock in your lease for Unit {invoice.unitNumber}.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Side: Summary Card */}
        <div className="md:col-span-1 space-y-4">
          <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-blue-800 text-white overflow-hidden">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-medium uppercase tracking-widest opacity-80">Payable Amount</CardTitle>
              <Receipt className="w-4 h-4 opacity-60" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold">LKR {invoice.amount.toLocaleString()}</div>
              <p className="text-[10px] opacity-70 mt-1">Non-refundable holding deposit</p>
            </CardContent>
            <div className="absolute -right-4 -bottom-4 bg-white/10 w-24 h-24 rounded-full blur-2xl"></div>
          </Card>

          <Card className="shadow-sm border-gray-100">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Lease Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <Building2 className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                    <div className="font-medium text-gray-900">{invoice.propertyName}</div>
                    <div className="text-xs text-gray-500">Property</div>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                    <div className="font-medium text-gray-900">Unit {invoice.unitNumber}</div>
                    <div className="text-xs text-gray-500">Unit Number</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Payment Form */}
        <div className="md:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="border-none shadow-md overflow-hidden ring-1 ring-gray-100">
              <CardHeader className="bg-gray-50/50 border-b p-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Payment Information
                </CardTitle>
                <CardDescription>Upload proof of your bank transfer.</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                    <Label className="text-gray-700 font-semibold">Select Payment Method</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div 
                          onClick={() => setPaymentMethod('online')}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${paymentMethod === 'online' ? 'border-blue-600 bg-blue-50 shadow-md' : 'border-gray-100 bg-white hover:border-blue-200'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${paymentMethod === 'online' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <CreditCard className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <span className={`block font-bold text-sm ${paymentMethod === 'online' ? 'text-blue-900' : 'text-gray-900'}`}>Pay Online</span>
                                <span className="text-[10px] text-gray-500">Instant Verification</span>
                            </div>
                            {paymentMethod === 'online' && <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
                        </div>

                        <div 
                          onClick={() => setPaymentMethod('bank_transfer')}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${paymentMethod === 'bank_transfer' ? 'border-orange-600 bg-orange-50 shadow-md' : 'border-gray-100 bg-white hover:border-orange-200'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${paymentMethod === 'bank_transfer' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <Banknote className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <span className={`block font-bold text-sm ${paymentMethod === 'bank_transfer' ? 'text-orange-900' : 'text-gray-900'}`}>Bank Transfer</span>
                                <span className="text-[10px] text-gray-500">2-4h Verification</span>
                            </div>
                            {paymentMethod === 'bank_transfer' && <div className="w-4 h-4 rounded-full bg-orange-600 flex items-center justify-center"><CheckCircle2 className="w-3 h-3 text-white" /></div>}
                        </div>
                    </div>
                </div>

                {paymentMethod === 'online' ? (
                  <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100 space-y-4 animate-in fade-in zoom-in duration-300">
                      <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                              <img src="https://www.payhere.lk/downloads/images/payhere_short_banner.png" alt="PayHere" className="h-6" />
                          </div>
                          <div>
                              <p className="text-sm font-bold text-blue-900">Instant Activation</p>
                              <p className="text-xs text-blue-700">Pay using Visa, Mastercard, or Mobile Wallets.</p>
                          </div>
                      </div>
                      <Alert className="bg-white/50 border-blue-200 py-2">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-[11px] text-blue-800">
                          Your unit will be reserved <strong>immediately</strong> upon successful payment.
                        </AlertDescription>
                      </Alert>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <Label htmlFor="ref" className="text-gray-700">Reference Number</Label>
                      <Input 
                        id="ref"
                        placeholder="e.g. TXN12345678"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        required
                        className="h-11 focus-visible:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-gray-700">Upload Receipt</Label>
                      <div className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer ${file ? 'border-green-200 bg-green-50/30' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}>
                        <input 
                          type="file" 
                          className="absolute inset-0 opacity-0 cursor-pointer" 
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          accept="image/*"
                        />
                        {file ? (
                          <>
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                            </div>
                            <p className="text-sm font-semibold text-green-700">{file.name}</p>
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-2 text-gray-400">
                                <Upload className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-semibold text-gray-700">Drop your receipt here</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-gray-50/50 p-6 flex flex-col gap-4 items-start border-t">
                 <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-500 leading-relaxed">
                        By submitting this payment, you agree to our terms of service. 
                        False submissions may lead to immediate cancellation of your reservation.
                    </p>
                 </div>
                 {paymentMethod === 'online' ? (
                   <Button 
                      type="button" 
                      onClick={handlePayOnline}
                      className="w-full h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700 transition-all shadow-lg group"
                      disabled={preparingPayHere}
                   >
                      {preparingPayHere ? (
                          <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                              Redirecting to Secure Gateway...
                          </>
                      ) : (
                          <>
                              Pay & Secure Now
                              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                          </>
                      )}
                   </Button>
                 ) : (
                   <Button 
                      type="submit" 
                      className="w-full h-12 text-lg font-bold bg-orange-600 hover:bg-orange-700 transition-all shadow-lg group"
                      disabled={submitting}
                   >
                      {submitting ? (
                          <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                              Submitting...
                          </>
                      ) : (
                          <>
                              Submit Payment Proof
                              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                          </>
                      )}
                   </Button>
                 )}
              </CardFooter>
            </Card>
          </form>

          {/* PayHere Hidden Form */}
          {payHereData && (
            <form 
              id="payhere-checkout-form" 
              method="post" 
              action="https://sandbox.payhere.lk/pay/checkout"
              className="hidden"
            >
              <input type="hidden" name="merchant_id" value={payHereData.merchant_id} />
              <input type="hidden" name="return_url" value={payHereData.return_url} />
              <input type="hidden" name="cancel_url" value={payHereData.cancel_url} />
              <input type="hidden" name="notify_url" value={payHereData.notify_url} />
              <input type="hidden" name="order_id" value={payHereData.order_id} />
              <input type="hidden" name="items" value={payHereData.items} />
              <input type="hidden" name="currency" value={payHereData.currency} />
              <input type="hidden" name="amount" value={payHereData.amount} />
              <input type="hidden" name="first_name" value={payHereData.first_name} />
              <input type="hidden" name="last_name" value={payHereData.last_name} />
              <input type="hidden" name="email" value={payHereData.email} />
              <input type="hidden" name="phone" value={payHereData.phone || ''} />
              <input type="hidden" name="address" value={payHereData.address} />
              <input type="hidden" name="city" value={payHereData.city} />
              <input type="hidden" name="country" value={payHereData.country} />
              <input type="hidden" name="hash" value={payHereData.hash} />
              <input type="hidden" name="custom_1" value={payHereData.custom_1} />
            </form>
          )}
        </div>
      </div>

      <div className="mt-12 pt-8 border-t text-center space-y-4">
          <p className="text-xs text-gray-400">
            Powered by AntiGravity PMS • Securely managed for {invoice.propertyName}
          </p>
          <div className="flex justify-center gap-6 opacity-40 hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold tracking-tighter uppercase grayscale">Visa</span>
            <span className="text-[10px] font-bold tracking-tighter uppercase grayscale">Mastercard</span>
            <span className="text-[10px] font-bold tracking-tighter uppercase grayscale">Bank Transfer</span>
          </div>
      </div>
    </div>
  );
}
