import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import authService from '@/services/auth';
import { jwtDecode } from 'jwt-decode';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  resetPasswordSchema,
  tenantSetupPasswordSchema,
  type ResetPasswordFormValues,
  type TenantSetupPasswordFormValues,
} from '@/schemas/authSchemas';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';

interface TokenPayload {
  id: number;
  type: string;
  role?: string;
  iat: number;
  exp: number;
}

export function SetupPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Decode role synchronously so the form initializes with the correct schema
  const role = useMemo(() => {
    if (!token) return null;
    try {
      const decoded = jwtDecode<TokenPayload>(token);
      return decoded.role ?? null;
    } catch (err) {
      console.error('Failed to decode token:', err);
      return null;
    }
  }, [token]);

  const isTenant = role === 'tenant';

  // Use dynamic schema and types based on role
  const form = useForm<any>({
    resolver: zodResolver(
      isTenant ? tenantSetupPasswordSchema : resetPasswordSchema
    ),
    defaultValues: isTenant
      ? {
          password: '',
          confirmPassword: '',
          nic: '',
          monthlyIncome: '',
          permanentAddress: '',
          emergencyContactName: '',
          emergencyContactPhone: '',
        }
      : {
          password: '',
          confirmPassword: '',
        },
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSubmit = async (data: any) => {
    if (!token) {
      toast.error('Invalid setup token');
      return;
    }

    try {
      if (isTenant) {
        // Send tenant data along with password
        const { password, confirmPassword, ...tenantData } = data;
        await authService.setupPassword(token, password, tenantData);
      } else {
        await authService.setupPassword(token, data.password);
      }

      toast.success('Account setup complete! You can now login.');
      navigate('/login');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.error;
      const details = error.response?.data?.details;

      if (errorMsg === 'Validation Error' && Array.isArray(details)) {
        toast.error(`Validation Error: ${details.join(', ')}`);
      } else {
        toast.error(
          errorMsg || 'Failed to set password. Link may be expired.'
        );
      }
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Link</CardTitle>
            <CardDescription>
              This setup link is invalid or missing. Please contact the
              administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 rounded-full">
              <Lock className="size-6 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {isTenant ? 'Set Up Your Profile' : 'Set Up Your Password'}
          </CardTitle>
          <CardDescription>
            {isTenant
              ? 'Create a secure password and provide your profile details to finalize your account.'
              : 'Create a secure password to access your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Min. 8 characters"
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
                    <FormLabel>Confirm Password *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Re-enter password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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

              {isTenant && (
                <>
                  <Separator className="my-6" />
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-gray-900">
                      Profile Details
                    </h3>
                    
                    <FormField
                      control={form.control}
                      name="nicDoc"
                      render={({ field: { value, onChange, ...fieldProps } }) => (
                        <FormItem>
                          <FormLabel>NIC Document / Image *</FormLabel>
                          <FormControl>
                            <Input
                              type="file"
                              accept="image/*,application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                onChange(file);
                              }}
                              {...fieldProps}
                            />
                          </FormControl>
                          <CardDescription className="text-[10px] mt-1">
                            Upload a clear photo or PDF of your NIC (Front & Back).
                          </CardDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="nic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>NIC / ID Number (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 199012345678" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="monthlyIncome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monthly Income (LKR) *</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="permanentAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Permanent Address *</FormLabel>
                          <FormControl>
                            <Input placeholder="Full permanent address" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="emergencyContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Contact *</FormLabel>
                            <FormControl>
                              <Input placeholder="Name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Emergency Phone *</FormLabel>
                            <FormControl>
                              <Input placeholder="Phone number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full mt-6"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
