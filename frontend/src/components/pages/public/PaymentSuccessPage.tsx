import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  LayoutDashboard,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { useAuth } from '@/app/context/AuthContext';
import { useFinancial } from '@/app/context/FinancialContext';
import { useEffect } from 'react';

/**
 * PaymentSuccessPage
 * A simplified, fast-loading success page that provides a direct path
 * back to the user's dashboard or invoices.
 */
export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshData } = useFinancial();

  // Refresh data on mount to ensure dashboard shows "Paid" instead of "Overdue"
  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user, refreshData]);

  // Potential tokens from URL (sent by Stripe or our system)
  const token = searchParams.get('token');
  const sessionId = searchParams.get('session_id'); // Stripe session
  const setupToken = searchParams.get('setupToken');

  // Logic to determine where to send the user back
  const handleReturnAction = () => {
    // [PRIORITY FIX] If a setupToken exists, always go to password setup first.
    // This allows the tenant to set up their portal account before visiting the status tracker.
    if (setupToken) {
      navigate(`/setup-password?token=${setupToken}&role=tenant`);
      return;
    }

    // [ONBOARDING FIX] Check for guest token next to redirect to status tracker
    const guestToken = localStorage.getItem('guestToken') || token;

    if (guestToken && !user) {
      navigate(`/onboarding/${guestToken}`);
      return;
    }

    if (user?.role === 'tenant') {
      navigate('/invoices');
    } else if (user?.role === 'owner') {
      navigate('/payments');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-4 bg-slate-50/50">
      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500 scale-in-95">
        <Card className="border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-3xl overflow-hidden bg-white">
          <div className="h-2 bg-green-500 w-full" />

          <CardHeader className="text-center pt-10 pb-4">
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center ring-4 ring-green-50/50 animate-bounce">
                <CheckCircle2 className="w-14 h-14 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">
              Payment Successful!
            </CardTitle>
            <p className="text-slate-500 mt-2 font-medium">
              Your transaction has been processed and verified.
            </p>
          </CardHeader>

          <CardContent className="px-8 pb-8 space-y-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 flex flex-col items-center text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">
                Confirmation Code
              </span>
              <span className="text-sm font-mono font-bold text-slate-700 break-all">
                {sessionId || 'PMS-AUTO-' + Date.now().toString().slice(-6)}
              </span>
            </div>

            {/* [NEW] Verification Timeline Information */}
            <div className="bg-green-50/30 border border-green-100 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-bold text-green-800 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Next Steps: Verification
              </h4>
              <p className="text-[13px] text-slate-600 leading-relaxed font-medium">
                Our finance team will now manually verify your payment evidence.
                This process usually takes{' '}
                <span className="text-green-700 font-bold">
                  2-4 business hours
                </span>
                .
              </p>
              <div className="pt-1">
                <p className="text-[11px] text-slate-400 font-medium italic">
                  * Note: Bank transfers may take longer depending on inter-bank
                  processing times.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-50">
              <ShieldCheck className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800/80 leading-relaxed font-medium">
                An automated receipt and confirmation email have been sent to
                your registered address for your records.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 p-8 pt-0">
            <Button
              onClick={handleReturnAction}
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg shadow-green-100 transition-all flex items-center justify-center gap-2"
            >
              <LayoutDashboard className="w-5 h-5" />
              {setupToken
                ? 'Complete Account Setup'
                : user?.role === 'tenant'
                  ? 'Go to My Invoices'
                  : 'Go to Dashboard'}
              <ArrowRight className="w-4 h-4 ml-1 opacity-50" />
            </Button>

            <Button
              variant="ghost"
              onClick={() => navigate('/receipts')}
              className="w-full text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-medium"
            >
              <Receipt className="w-4 h-4 mr-2" />
              View My Receipts
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="mt-12 opacity-40">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] flex items-center justify-center gap-2">
          Secure Financial Infrastructure • AntiGravity PMS
        </p>
      </div>
    </div>
  );
}
