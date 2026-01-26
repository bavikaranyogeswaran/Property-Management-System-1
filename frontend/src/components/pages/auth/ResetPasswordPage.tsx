import React, { useState } from 'react';
import authService from '@/services/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export function ResetPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        if (!token) {
            toast.error('Invalid or missing reset token');
            return;
        }

        setIsLoading(true);

        try {
            await authService.resetPassword(token, password);
            toast.success('Password has been reset successfully!');
            navigate('/login');
        } catch (error) {
            console.error('Reset password error:', error);
            // Default error message from backend or generic one
            toast.error('Failed to reset password. The link may have expired.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                            <Building2 className="text-red-600 size-6" />
                        </div>
                        <CardTitle className="text-xl text-red-600">Invalid Link</CardTitle>
                        <CardDescription>
                            This password reset link is invalid or missing. Please request a new one.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex justify-center">
                        <Link
                            to="/forgot-password"
                            className="text-sm font-medium text-blue-600 hover:underline"
                        >
                            Request New Link
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-blue-600 rounded-lg">
                            <Building2 className="size-8 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl">Reset Password</CardTitle>
                    <CardDescription>Enter your new password below</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter updated password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Confirm updated password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Resetting...' : 'Reset Password'}
                        </Button>

                        <div className="text-center">
                            <Link
                                to="/login"
                                className="text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-2 w-full"
                            >
                                <ArrowLeft className="size-4" />
                                Back to Sign In
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
