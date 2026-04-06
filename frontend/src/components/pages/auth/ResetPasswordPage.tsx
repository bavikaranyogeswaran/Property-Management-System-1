import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '@/schemas/authSchemas';
import authService from '@/services/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Building2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) {
      toast.error('Invalid or missing reset token');
      return;
    }

    try {
      await authService.resetPassword(token, data.password);
      toast.success('Password has been reset successfully!');
      navigate('/login');
    } catch (error) {
      console.error('Reset password error:', error);
      toast.error('Failed to reset password. The link may have expired.');
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
              This password reset link is invalid or missing. Please request a
              new one.
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Enter updated password"
                          type={showPassword ? 'text' : 'password'}
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4 text-gray-500" />
                          ) : (
                            <Eye className="size-4 text-gray-500" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Confirm updated password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="size-4 text-gray-500" />
                          ) : (
                            <Eye className="size-4 text-gray-500" />
                          )}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? 'Resetting...'
                  : 'Reset Password'}
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
