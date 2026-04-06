import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  Lock,
  Loader2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import apiClient from '@/services/api';
import { formatLKR } from '@/utils/formatters';

/**
 * PayHereSimulationPage
 * A premium-looking portal that simulates the PayHere Sandbox checkout.
 * This is only accessible in development mode.
 */
export default function PayHereSimulationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'processing' | 'success' | 'failed'
  >('idle');

  // Extract PayHere fields from search params (sent via redirect)
  const order_id = searchParams.get('order_id');
  const amount = searchParams.get('amount');
  const currency = searchParams.get('currency') || 'LKR';
  const return_url = searchParams.get('return_url');
  const cancel_url = searchParams.get('cancel_url');
  const first_name = searchParams.get('first_name');
  const last_name = searchParams.get('last_name');
  const email = searchParams.get('email');
  const item = searchParams.get('items');
  const custom_1 = searchParams.get('custom_1'); // Magic Token for leads

  // Safety check: go back if required data is missing
  useEffect(() => {
    if (!order_id || !amount) {
      toast.error('Simulation data missing.');
      // navigate(-1);
    }
  }, [order_id, amount, navigate]);

  const handleSimulateSuccess = async () => {
    try {
      setLoading(true);
      setStatus('processing');

      // Call the backend simulation endpoint
      console.log(`[Simulation] Triggering success for Order: ${order_id}`);

      await apiClient.post('/payhere/simulate-webhook', {
        order_id,
        amount,
        status_code: '2', // Success
        payment_id: `SIM-${Date.now()}`,
        magic_token: custom_1, // Pass authorization token
      });

      setStatus('success');
      toast.success('Simulated success signal sent to backend.');

      // Redirect to return_url after a delay
      setTimeout(() => {
        if (return_url) {
          window.location.href = return_url;
        } else {
          navigate('/payment-success');
        }
      }, 1500);
    } catch (err: any) {
      setStatus('failed');
      toast.error('Simulation failed. Check console.');
      console.error('Simulation Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateFailure = () => {
    setStatus('failed');
    toast.error('Simulation: Payment Failed.');

    // Redirect to cancel_url after a delay
    setTimeout(() => {
      if (cancel_url) {
        window.location.href = cancel_url;
      } else {
        navigate(-1);
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* Simulation Header */}
      <div className="w-full max-w-md mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-500 p-1.5 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="font-bold text-slate-800 tracking-tight">
            Simulator Mode
          </div>
        </div>
      </div>

      <Card className="w-full max-w-md border-none shadow-2xl overflow-hidden ring-1 ring-slate-200">
        <CardHeader className="bg-white border-b pb-6">
          <div className="flex justify-between items-start mb-4">
            <img
              src="https://www.payhere.lk/downloads/images/payhere_short_banner.png"
              alt="PayHere"
              className="h-8 opacity-90"
            />
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">
                Order ID
              </div>
              <div className="text-sm font-mono font-medium text-slate-600">
                {order_id}
              </div>
            </div>
          </div>
          <CardTitle className="text-2xl font-black text-slate-900">
            Secure Payment Checkout
          </CardTitle>
          <CardDescription className="text-slate-500">
            This is an internal simulator mimicking the PayHere Gateway.
          </CardDescription>
        </CardHeader>

        <CardContent className="bg-white pt-8 space-y-6">
          {/* Amount Display */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center gap-1">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Total Payable
            </span>
            <span className="text-4xl font-black text-blue-600">
              {currency} {Number(amount).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">{item}</span>
          </div>

          {/* User Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                Customer
              </span>
              <div className="font-bold text-slate-700">
                {first_name} {last_name}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                Email
              </span>
              <div className="font-medium text-slate-700 break-all">
                {email}
              </div>
            </div>
          </div>

          <Alert className="bg-blue-50 border-blue-100 py-3">
            <Lock className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-[11px] text-blue-800 font-medium leading-relaxed">
              You are currently in <strong>Simulation Mode</strong>. No real
              funds will be deducted from any account.
            </AlertDescription>
          </Alert>

          {status === 'success' && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-bold text-green-900">Success!</div>
                <div className="text-xs text-green-700">
                  Redirecting to payment results...
                </div>
              </div>
            </div>
          )}

          {status === 'failed' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in">
              <XCircle className="w-6 h-6 text-red-600" />
              <div>
                <div className="font-bold text-red-900">Payment Failed</div>
                <div className="text-xs text-red-700">
                  Simulation returned failure. Retrying...
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-slate-50 p-6 flex flex-col gap-3 border-t">
          {status === 'idle' ? (
            <>
              <Button
                onClick={handleSimulateSuccess}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg shadow-lg shadow-blue-200 transition-all rounded-xl active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Authorize Payment'
                )}
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-center py-4 w-full">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 opacity-50" />
            </div>
          )}

          <p className="text-[10px] text-center text-slate-400 mt-2">
            Secure local simulation for development testing. Do not use in
            production environments.
          </p>
        </CardFooter>
      </Card>

      <button
        onClick={() => navigate(-1)}
        className="mt-8 text-slate-400 hover:text-slate-600 flex items-center gap-2 text-sm font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Application
      </button>
    </div>
  );
}
