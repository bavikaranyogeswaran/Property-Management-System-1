import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import authService from '@/services/auth';

export function VerifyEmailPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('Verifying your email...');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Invalid or missing verification token.');
            return;
        }

        const verify = async () => {
            try {
                await authService.verifyEmail(token);
                setStatus('success');
                setMessage('Your email has been verified successfully!');
            } catch (error: any) {
                setStatus('error');
                setMessage(error.response?.data?.error || 'Failed to verify email. The link may be invalid or expired.');
            }
        };

        verify();
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="flex justify-center mb-4">
                        {status === 'loading' && <Loader2 className="size-12 text-blue-600 animate-spin" />}
                        {status === 'success' && <CheckCircle2 className="size-12 text-green-600" />}
                        {status === 'error' && <XCircle className="size-12 text-red-600" />}
                    </div>
                    <CardTitle className="text-2xl">
                        {status === 'loading' && 'Verifying...'}
                        {status === 'success' && 'Email Verified!'}
                        {status === 'error' && 'Verification Failed'}
                    </CardTitle>
                    <CardDescription>
                        {message}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {status !== 'loading' && (
                        <Button
                            className="w-full"
                            onClick={() => navigate('/login')}
                        >
                            Go to Login
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
