import React, { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useApp } from '@/app/context/AppContext';
import { useLease } from '@/app/context/LeaseContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { User, Lock, Shield, Trash, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  passwordUpdateSchema,
  type PasswordUpdateFormValues,
} from '@/schemas/authSchemas';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

export function SettingsPage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });

  // Fix: Update profileData when user loads/updates
  React.useEffect(() => {
    if (user) {
      setProfileData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user]);

  // React Hook Form for Password Update
  const passwordForm = useForm<PasswordUpdateFormValues>({
    resolver: zodResolver(passwordUpdateSchema),
    defaultValues: {
      current: '',
      new: '',
      confirm: '',
    },
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onPasswordSubmit = async (data: PasswordUpdateFormValues) => {
    try {
      await changePassword({
        currentPassword: data.current,
        newPassword: data.new,
      });
      toast.success('Password updated successfully');
      passwordForm.reset();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Failed to update password');
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Send only updatable fields
      const { name, phone } = profileData;
      await updateProfile({ name, phone });
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || 'Failed to update profile');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">
            <User className="size-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="size-4 mr-2" />
            Security
          </TabsTrigger>
          {user?.role === 'owner' && (
            <TabsTrigger value="types">
              <Shield className="size-4 mr-2" />
              Types
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profileData.name}
                    onChange={(e) =>
                      setProfileData({ ...profileData, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      disabled
                      className="bg-gray-50 text-gray-500"
                    />
                    <Lock className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
                  </div>
                  <p className="text-xs text-gray-500">
                    Email cannot be changed. Contact owner for support.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Role</Label>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border text-sm">
                    <Shield className="size-4 text-gray-500" />
                    <span className="capitalize font-medium">{user?.role}</span>
                    <Badge variant="secondary" className="ml-auto">
                      Verified
                    </Badge>
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your password and security questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="current"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showCurrentPassword ? 'text' : 'password'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            >
                              {showCurrentPassword ? (
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
                    control={passwordForm.control}
                    name="new"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showNewPassword ? 'text' : 'password'}
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                            >
                              {showNewPassword ? (
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
                    control={passwordForm.control}
                    name="confirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
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
                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={passwordForm.formState.isSubmitting}
                    >
                      {passwordForm.formState.isSubmitting
                        ? 'Updating...'
                        : 'Update Password'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {user?.role === 'owner' && (
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <CardTitle>Property & Unit Types</CardTitle>
                <CardDescription>
                  Manage the types available for your properties and units
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <TypeManager />
                <div className="pt-6 border-t">
                  <LeaseTermManager />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function TypeManager() {
  const {
    propertyTypes,
    unitTypes,
    addPropertyType,
    deletePropertyType,
    addUnitType,
    deleteUnitType,
  } = useApp();
  const [newPropType, setNewPropType] = useState('');
  const [newUnitType, setNewUnitType] = useState('');

  const handleAddPropType = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPropType.trim()) {
      addPropertyType({ name: newPropType, description: '' });
      setNewPropType('');
    }
  };

  const handleAddUnitType = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUnitType.trim()) {
      addUnitType({ name: newUnitType, description: '' });
      setNewUnitType('');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Property Types */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-gray-900">Property Types</h3>
        <form onSubmit={handleAddPropType} className="flex gap-2">
          <Input
            placeholder="Add property type..."
            value={newPropType}
            onChange={(e) => setNewPropType(e.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <div className="border rounded-md divide-y">
          {propertyTypes.map((type) => (
            <div
              key={type.type_id}
              className="p-2.5 flex justify-between items-center text-sm"
            >
              <span>{type.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => deletePropertyType(type.type_id)}
              >
                <Trash className="size-3" />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          ))}
          {propertyTypes.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No types defined
            </div>
          )}
        </div>
      </div>

      {/* Unit Types */}
      <div className="space-y-4">
        <h3 className="font-medium text-sm text-gray-900">Unit Types</h3>
        <form onSubmit={handleAddUnitType} className="flex gap-2">
          <Input
            placeholder="Add unit type..."
            value={newUnitType}
            onChange={(e) => setNewUnitType(e.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <div className="border rounded-md divide-y">
          {unitTypes.map((type) => (
            <div
              key={type.type_id}
              className="p-2.5 flex justify-between items-center text-sm"
            >
              <span>{type.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => deleteUnitType(type.type_id)}
              >
                <Trash className="size-3" />
              </Button>
            </div>
          ))}
          {unitTypes.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">
              No types defined
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function LeaseTermManager() {
  const { leaseTerms, addLeaseTerm, deleteLeaseTerm } = useLease();
  const [newTerm, setNewTerm] = useState({
    name: '',
    type: 'fixed' as 'fixed' | 'periodic',
    durationMonths: 12,
    noticePeriodMonths: 2,
  });

  const handleAddTerm = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTerm.name.trim()) {
      if (newTerm.type === 'fixed' && newTerm.durationMonths < 3) {
        toast.error('Minimum lease duration is 3 months');
        return;
      }
      addLeaseTerm({
        name: newTerm.name,
        type: newTerm.type,
        durationMonths: newTerm.type === 'fixed' ? newTerm.durationMonths : undefined,
        noticePeriodMonths: newTerm.noticePeriodMonths,
        isDefault: false,
      });
      setNewTerm({
        name: '',
        type: 'fixed',
        durationMonths: 12,
        noticePeriodMonths: 2,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-gray-900">Lease Terms</h3>
        <Badge variant="outline">Fixed Terms Only</Badge>
      </div>

      <form onSubmit={handleAddTerm} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <Input
            placeholder="Name (e.g. 1 Year Fixed)"
            value={newTerm.name}
            onChange={(e) => setNewTerm({ ...newTerm, name: e.target.value })}
          />
        </div>
        <div className="sm:col-span-1">
          <Input
            type="number"
            placeholder="Months"
            min="3"
            value={newTerm.durationMonths}
            onChange={(e) => setNewTerm({ ...newTerm, durationMonths: parseInt(e.target.value) })}
          />
        </div>
        <div className="sm:col-span-1 flex gap-2">
          <Button type="submit" className="flex-1">
            Add Term
          </Button>
        </div>
      </form>

      <div className="border rounded-md divide-y overflow-hidden">
        {leaseTerms.map((term) => (
          <div
            key={term.leaseTermId}
            className="p-3 flex justify-between items-center text-sm bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">{term.name}</span>
              <span className="text-gray-500 text-xs">({term.durationMonths} months)</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => deleteLeaseTerm(term.leaseTermId)}
            >
              <Trash className="size-3.5" />
            </Button>
          </div>
        ))}
        {leaseTerms.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">
            No lease terms defined yet.
          </div>
        )}
      </div>
    </div>
  );
}
