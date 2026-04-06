import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarX, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/services/api';

const CancelVisitPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const visitId = searchParams.get('id');

  const [status, setStatus] = useState<
    'loading' | 'confirm' | 'success' | 'error'
  >('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visitId) {
      setStatus('error');
      setError(
        'Missing visit identification. Please use the link provided in your email.'
      );
    } else {
      setStatus('confirm');
    }
  }, [visitId]);

  const handleCancel = async () => {
    try {
      setStatus('loading');
      await api.post(`/visits/${visitId}/cancel`);
      setStatus('success');
      toast.success('Your visit has been cancelled.');
    } catch (err: any) {
      console.error('Cancellation error:', err);
      setStatus('error');
      setError(
        err.response?.data?.error ||
          'Failed to cancel the visit. It may already be cancelled or processed.'
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {status === 'loading' && (
              <Loader2 className="size-12 text-blue-500 animate-spin" />
            )}
            {status === 'confirm' && (
              <CalendarX className="size-12 text-red-500" />
            )}
            {status === 'success' && (
              <CheckCircle2 className="size-12 text-green-500" />
            )}
            {status === 'error' && (
              <AlertCircle className="size-12 text-amber-500" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {status === 'confirm' && 'Cancel Your Visit?'}
            {status === 'success' && 'Visit Cancelled'}
            {status === 'error' && 'Something Went Wrong'}
            {status === 'loading' && 'Processing...'}
          </CardTitle>
          <CardDescription>
            {status === 'confirm' &&
              'Are you sure you want to cancel your scheduled property visit?'}
            {status === 'success' &&
              'Your appointment has been removed from our schedule.'}
            {status === 'error' && error}
          </CardDescription>
        </CardHeader>

        <CardContent className="text-center pb-8">
          {status === 'confirm' && (
            <p className="text-sm text-gray-500">
              This action cannot be undone. You will need to schedule a new
              visit if you change your mind.
            </p>
          )}
          {status === 'success' && (
            <p className="text-sm text-gray-500">
              A notification has been sent to the property owner.
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {status === 'confirm' && (
            <>
              <Button
                variant="destructive"
                className="w-full py-6 text-lg"
                onClick={handleCancel}
              >
                Confirm Cancellation
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/')}
              >
                Keep My Visit
              </Button>
            </>
          )}
          {(status === 'success' || status === 'error') && (
            <Button
              className="w-full py-6 text-lg"
              onClick={() => navigate('/')}
            >
              Return to Homepage
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default CancelVisitPage;
