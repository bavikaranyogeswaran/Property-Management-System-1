import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  Loader2, 
  ShieldCheck, 
  ArrowRight,
  Mail,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import apiClient from '@/services/api';
import { toast } from 'sonner';

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlToken = searchParams.get('token');
  const custom1 = searchParams.get('custom_1');
  const orderId = searchParams.get('order_id');
  
  // Use URL token if available, fallback to custom_1, then fallback to localStorage
  const token = urlToken || custom1 || localStorage.getItem('last_payment_token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'timeout' | 'error'>('verifying');
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 30; // 60 seconds total with 2s interval

  useEffect(() => {
    // If we have neither a token nor an orderId, we can't proceed
    if (!token && !orderId) {
      setStatus('error');
      return;
    }

    const checkStatus = async () => {
      try {
        let response;
        if (token) {
          // Primary: Poll by token
          response = await apiClient.get(`/public/invoice/${token}/status`);
        } else {
          // Secondary: Poll by orderId
          response = await apiClient.get(`/public/invoice/checkout-status/${orderId}`);
        }

        const { paid, active, setupToken: receivedToken } = response.data;

        if (paid && active && receivedToken) {
          localStorage.removeItem('last_payment_token');
          setSetupToken(receivedToken);
          setStatus('success');
          toast.success('Your reservation is finalized!');
          return true; // Stop polling
        }
        return false; // Continue polling
      } catch (err) {
        console.error('Polling error:', err);
        return false; // Try again
      }
    };

    const interval = setInterval(async () => {
      setAttempts(prev => {
        if (prev >= MAX_ATTEMPTS) {
          clearInterval(interval);
          setStatus('timeout');
          return prev;
        }
        return prev + 1;
      });

      const done = await checkStatus();
      if (done) clearInterval(interval);
    }, 2000);

    // Initial check
    checkStatus();

    return () => clearInterval(interval);
  }, [token, orderId, navigate]);

  if (status === 'error' || (!token && !orderId)) {
    return (
      <div className="max-w-md mx-auto mt-20 px-4 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
           <HelpCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
        <p className="text-gray-500 mb-4">We couldn't find your payment session. If you have paid, please check your email for the next steps.</p>
        
        {orderId && (
          <div className="bg-gray-50 p-3 rounded-lg text-xs font-mono text-gray-400 mb-8 break-all">
            Ref: {orderId}
          </div>
        )}
        
        <Button onClick={() => navigate('/')} className="w-full">Back to Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl animate-in fade-in zoom-in duration-500">
        <Card className="border-none shadow-2xl relative overflow-hidden">
          {/* Progress Bar (Visual Only) */}
          <div className="absolute top-0 left-0 h-1 bg-blue-600 transition-all duration-500" 
               style={{ width: status === 'success' ? '100%' : `${(attempts / MAX_ATTEMPTS) * 100}%` }}></div>
          
          <CardHeader className="text-center pt-10 pb-6">
            <div className="flex justify-center mb-6">
              {status === 'success' ? (
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
              ) : (
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center relative">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                     <ShieldCheck className="w-6 h-6 text-blue-400 opacity-20" />
                  </div>
                </div>
              )}
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900">
              {status === 'success' ? 'Payment Verified!' : 'Finalizing Your Reservation'}
            </CardTitle>
            <CardDescription className="text-lg mt-2 font-medium">
              {status === 'success' 
                ? 'Redirecting you to set up your account...' 
                : 'We are confirming your payment with the bank.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="px-8 pb-10 space-y-6">
            {status === 'verifying' && (
               <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                     <ShieldCheck className="w-5 h-5 text-blue-600 mt-1 shrink-0" />
                     <div className="text-sm text-blue-800 leading-relaxed">
                        Your unit has been **hard-reserved**. We are now finalizing the lease documents and generating your tenant portal access.
                     </div>
                  </div>
                  <div className="flex justify-center items-center gap-2 text-xs text-gray-400">
                      <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
                      Syncing with payment gateway...
                  </div>
               </div>
            )}

            {status === 'timeout' && (
              <Alert variant="destructive" className="bg-orange-50 border-orange-200">
                <Mail className="h-5 w-5 text-orange-600" />
                <AlertTitle className="text-orange-900 font-bold">Taking a bit longer than usual</AlertTitle>
                <AlertDescription className="text-orange-800 mt-1">
                  The bank is still processing your transaction. You will receive an email automatically at **your registered address** once verified with your login details.
                </AlertDescription>
              </Alert>
            )}

            {status === 'success' && (
               <div className="bg-green-50 p-6 rounded-2xl border border-green-100 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <p className="text-green-800 font-medium mb-4">Verification Complete! Your account is ready for setup.</p>
                  <Button className="bg-green-600 hover:bg-green-700 w-full font-bold h-12 shadow-lg" onClick={() => {/* navigate handled by effect */}}>
                    Proceed to Account Setup
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
               </div>
            )}
          </CardContent>

          {status === 'timeout' && (
            <CardFooter className="bg-gray-50 border-t p-6">
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                Return to Home
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      <div className="mt-12 text-center">
        <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Secure Financial Transaction • AntiGravity PMS
        </p>
      </div>
    </div>
  );
}
