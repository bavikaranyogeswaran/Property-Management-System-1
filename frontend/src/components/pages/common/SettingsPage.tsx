import React, { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { User, Lock, Bell, Shield } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsPage() {
    const { user } = useAuth();
    const [profileData, setProfileData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: '+94 77 123 4567', // Mock phone as it's not in user object yet
    });

    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: '',
    });

    const [notifications, setNotifications] = useState({
        email: true,
        push: false,
        marketing: false,
    });

    const handleProfileUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        // Simulate API call
        setTimeout(() => {
            toast.success('Profile updated successfully');
        }, 500);
    };

    const handlePasswordUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            toast.error('New passwords do not match');
            return;
        }
        // Simulate API call
        setTimeout(() => {
            toast.success('Password updated successfully');
            setPasswords({ current: '', new: '', confirm: '' });
        }, 500);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your account and preferences</p>
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
                    <TabsTrigger value="notifications">
                        <Bell className="size-4 mr-2" />
                        Notifications
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
                                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profileData.email}
                                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone Number</Label>
                                    <Input
                                        id="phone"
                                        type="tel"
                                        value={profileData.phone}
                                        onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Account Role</Label>
                                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md border text-sm">
                                        <Shield className="size-4 text-gray-500" />
                                        <span className="capitalize font-medium">{user?.role}</span>
                                        <Badge variant="secondary" className="ml-auto">Verified</Badge>
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
                            <CardDescription>Manage your password and security questions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handlePasswordUpdate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Current Password</Label>
                                    <Input
                                        id="current"
                                        type="password"
                                        value={passwords.current}
                                        onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new">New Password</Label>
                                    <Input
                                        id="new"
                                        type="password"
                                        value={passwords.new}
                                        onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                        required
                                        minLength={8}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm">Confirm New Password</Label>
                                    <Input
                                        id="confirm"
                                        type="password"
                                        value={passwords.confirm}
                                        onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                                        required
                                        minLength={8}
                                    />
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button type="submit">Update Password</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="notifications">
                    <Card>
                        <CardHeader>
                            <CardTitle>Notification Preferences</CardTitle>
                            <CardDescription>Choose how you want to be notified</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Email Notifications</Label>
                                    <p className="text-sm text-gray-500">Receive emails about account activity</p>
                                </div>
                                <Switch
                                    checked={notifications.email}
                                    onCheckedChange={(c) => setNotifications({ ...notifications, email: c })}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Push Notifications</Label>
                                    <p className="text-sm text-gray-500">Receive push notifications on your device</p>
                                </div>
                                <Switch
                                    checked={notifications.push}
                                    onCheckedChange={(c) => setNotifications({ ...notifications, push: c })}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>Marketing Emails</Label>
                                    <p className="text-sm text-gray-500">Receive news and updates</p>
                                </div>
                                <Switch
                                    checked={notifications.marketing}
                                    onCheckedChange={(c) => setNotifications({ ...notifications, marketing: c })}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                {user?.role === 'owner' && (
                    <TabsContent value="types">
                        <Card>
                            <CardHeader>
                                <CardTitle>Property & Unit Types</CardTitle>
                                <CardDescription>Manage the types available for your properties and units</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <TypeManager />
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}

function TypeManager() {
    const { propertyTypes, unitTypes, addPropertyType, deletePropertyType, addUnitType, deleteUnitType } = useApp();
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
                    <Button type="submit" size="sm">Add</Button>
                </form>
                <div className="border rounded-md divide-y">
                    {propertyTypes.map(type => (
                        <div key={type.type_id} className="p-2.5 flex justify-between items-center text-sm">
                            <span>{type.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deletePropertyType(type.type_id)}
                            >
                                <Lock className="size-3" /> {/* Using Lock icon as placeholder for protected/delete if allowed */}
                                <span className="sr-only">Delete</span>
                            </Button>
                        </div>
                    ))}
                    {propertyTypes.length === 0 && (
                        <div className="p-4 text-center text-gray-500 text-sm">No types defined</div>
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
                    <Button type="submit" size="sm">Add</Button>
                </form>
                <div className="border rounded-md divide-y">
                    {unitTypes.map(type => (
                        <div key={type.type_id} className="p-2.5 flex justify-between items-center text-sm">
                            <span>{type.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => deleteUnitType(type.type_id)}
                            >
                                <Lock className="size-3" />
                            </Button>
                        </div>
                    ))}
                    {unitTypes.length === 0 && (
                        <div className="p-4 text-center text-gray-500 text-sm">No types defined</div>
                    )}
                </div>
            </div>
        </div>
    );
}
