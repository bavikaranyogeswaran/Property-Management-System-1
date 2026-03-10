import React, { useState } from 'react';
import { useApp } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  Users,
  Home,
  Wrench,
  FileText,
  Calendar
} from 'lucide-react';

export function AnalyticsPage() {
  const {
    properties,
    units,
    leases,
    tenants,
    invoices,
    payments,
    receipts,
    maintenanceRequests,
    maintenanceCosts,
    leads,
    leadStageHistory,
  } = useApp();

  const [dateRange, setDateRange] = useState('all');

  // Financial Analytics
  const totalRevenue = receipts.reduce((sum, r) => sum + r.amount, 0);
  const totalMaintenanceCost = maintenanceCosts.reduce((sum, c) => sum + c.amount, 0);
  const netIncome = totalRevenue - totalMaintenanceCost;
  const pendingPayments = invoices.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0);
  const expectedMonthlyRevenue = leases
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + l.monthlyRent, 0);

  // Occupancy Analytics
  const totalUnits = units.length;
  const occupiedUnits = units.filter(u => u.status === 'occupied').length;
  const availableUnits = units.filter(u => u.status === 'available').length;
  const maintenanceUnits = units.filter(u => u.status === 'maintenance').length;
  const occupancyRate = totalUnits > 0 ? ((occupiedUnits / totalUnits) * 100).toFixed(1) : '0';

  // Maintenance Analytics
  const completedRequests = maintenanceRequests.filter(r => r.status === 'completed').length;
  const openRequests = maintenanceRequests.filter(r => r.status === 'submitted' || r.status === 'in_progress').length;
  const avgMaintenanceCost = completedRequests > 0 ? (totalMaintenanceCost / completedRequests).toFixed(2) : '0';

  // Payment Analytics
  const totalInvoices = invoices.length;
  const paidInvoices = invoices.filter(i => i.status === 'paid').length;
  const overdueInvoices = invoices.filter(i => {
    return i.status === 'pending' && new Date(i.dueDate) < new Date();
  }).length;
  const collectionRate = totalInvoices > 0 ? ((paidInvoices / totalInvoices) * 100).toFixed(1) : '0';

  // Chart data
  const unitStatusData = [
    { name: 'Occupied', value: occupiedUnits, color: '#10b981' },
    { name: 'Available', value: availableUnits, color: '#f59e0b' },
    { name: 'Maintenance', value: maintenanceUnits, color: '#ef4444' },
  ];

  const propertyRevenueData = properties.map(property => {
    const propertyUnits = units.filter(u => u.propertyId === property.id);
    const propertyLeases = leases.filter(l =>
      propertyUnits.some(u => u.id === l.unitId) && l.status === 'active'
    );
    const revenue = propertyLeases.reduce((sum, l) => sum + l.monthlyRent, 0);

    return {
      name: property.name,
      revenue: revenue,
      units: propertyUnits.length,
      occupied: propertyUnits.filter(u => u.status === 'occupied').length,
    };
  });

  const maintenanceCostByProperty = properties.map(property => {
    const propertyUnits = units.filter(u => u.propertyId === property.id);
    const propertyRequests = maintenanceRequests.filter(r =>
      propertyUnits.some(u => u.id === r.unitId)
    );
    const totalCost = propertyRequests.reduce((sum, r) => {
      const costs = maintenanceCosts.filter(c => c.requestId === r.id);
      return sum + costs.reduce((s, c) => s + c.amount, 0);
    }, 0);

    return {
      name: property.name,
      cost: totalCost,
    };
  });

  // Monthly revenue trend (mock data for demonstration)
  const monthlyData = [
    { month: 'Jul 25', revenue: 8500, expenses: 1200 },
    { month: 'Aug 25', revenue: 9200, expenses: 800 },
    { month: 'Sep 25', revenue: 9800, expenses: 1500 },
    { month: 'Oct 25', revenue: 10200, expenses: 900 },
    { month: 'Nov 25', revenue: 11000, expenses: 1100 },
    { month: 'Dec 25', revenue: 11500, expenses: 1300 },
    { month: 'Jan 26', revenue: totalRevenue, expenses: totalMaintenanceCost },
  ];

  const kpiCards = [
    {
      title: 'Total Revenue',
      value: `LKR ${totalRevenue.toLocaleString()}`,
      subtitle: 'Collected to date',
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Expected Monthly',
      value: `LKR ${expectedMonthlyRevenue.toLocaleString()}`,
      subtitle: 'From active leases',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Pending Payments',
      value: `LKR ${pendingPayments.toLocaleString()}`,
      subtitle: `${invoices.filter(i => i.status === 'pending').length} invoices`,
      icon: FileText,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Maintenance Cost',
      value: `LKR ${totalMaintenanceCost.toLocaleString()}`,
      subtitle: `Avg: LKR ${avgMaintenanceCost} per request`,
      icon: Wrench,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Net Income',
      value: `LKR ${netIncome.toLocaleString()}`,
      subtitle: 'Revenue - Expenses',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Occupancy Rate',
      value: `${occupancyRate}%`,
      subtitle: `${occupiedUnits} of ${totalUnits} units`,
      icon: Home,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      title: 'Collection Rate',
      value: `${collectionRate}%`,
      subtitle: `${paidInvoices} of ${totalInvoices} paid`,
      icon: DollarSign,
      color: 'text-teal-600',
      bgColor: 'bg-teal-50',
    },
    {
      title: 'Active Tenants',
      value: tenants.length,
      subtitle: `${leases.filter(l => l.status === 'active').length} leases`,
      icon: Users,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Analytics & Reports</h2>
          <p className="text-sm text-gray-500 mt-1">Comprehensive business insights and reporting</p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="date-range" className="text-sm">Period:</Label>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger id="date-range" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-600">{kpi.title}</p>
                    <p className={`text-xl font-semibold mt-1 ${kpi.color}`}>
                      {kpi.value}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{kpi.subtitle}</p>
                  </div>
                  <div className={`${kpi.bgColor} p-2 rounded-lg`}>
                    <Icon className={`size-4 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="financial" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="occupancy">Occupancy</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* Financial Tab */}
        <TabsContent value="financial" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Expenses Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue by Property</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={propertyRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Financial Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary by Property</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 text-sm font-medium text-gray-600">Property</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Units</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Occupied</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Monthly Revenue</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propertyRevenueData.map((prop, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="py-3 font-medium">{prop.name}</td>
                        <td className="py-3">{prop.units}</td>
                        <td className="py-3">{prop.occupied}</td>
                        <td className="py-3 font-semibold">LKR {prop.revenue.toLocaleString()}</td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${prop.units === 0 ? 'bg-gray-100 text-gray-600' :
                              (prop.occupied / prop.units) >= 0.8 ? 'bg-green-100 text-green-700' :
                                (prop.occupied / prop.units) >= 0.5 ? 'bg-orange-100 text-orange-700' :
                                  'bg-red-100 text-red-700'
                            }`}>
                            {prop.units === 0 ? 'N/A' : `${((prop.occupied / prop.units) * 100).toFixed(0)}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Occupancy Tab */}
        <TabsContent value="occupancy" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Unit Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={unitStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {unitStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Occupancy by Property</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={propertyRevenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="units" fill="#94a3b8" name="Total Units" />
                    <Bar dataKey="occupied" fill="#10b981" name="Occupied" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Occupancy Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-600">Total Units</p>
                <p className="text-2xl font-semibold mt-1">{totalUnits}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-600">Occupied</p>
                <p className="text-2xl font-semibold mt-1 text-green-600">{occupiedUnits}</p>
                <p className="text-xs text-gray-500 mt-1">{occupancyRate}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-600">Available</p>
                <p className="text-2xl font-semibold mt-1 text-orange-600">{availableUnits}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-600">In Maintenance</p>
                <p className="text-2xl font-semibold mt-1 text-red-600">{maintenanceUnits}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Maintenance Costs by Property</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={maintenanceCostByProperty}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="cost" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Maintenance Request Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Total Requests', value: maintenanceRequests.length, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Submitted', value: maintenanceRequests.filter(r => r.status === 'submitted').length, color: 'bg-orange-100 text-orange-700' },
                    { label: 'In Progress', value: maintenanceRequests.filter(r => r.status === 'in_progress').length, color: 'bg-yellow-100 text-yellow-700' },
                    { label: 'Completed', value: maintenanceRequests.filter(r => r.status === 'completed').length, color: 'bg-green-100 text-green-700' },
                  ].map((stat, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium">{stat.label}</span>
                      <span className={`px-3 py-1 rounded-full font-semibold ${stat.color}`}>
                        {stat.value}
                      </span>
                    </div>
                  ))}
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Total Cost</span>
                      <span className="text-xl font-semibold">LKR {totalMaintenanceCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">Average per Request</span>
                      <span className="font-semibold">LKR {avgMaintenanceCost}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Status Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-xs text-gray-700">Paid</p>
                      <p className="text-2xl font-semibold text-green-700 mt-2">{paidInvoices}</p>
                      <p className="text-xs text-gray-600 mt-1">LKR {invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0).toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                      <p className="text-xs text-gray-700">Pending</p>
                      <p className="text-2xl font-semibold text-orange-700 mt-2">
                        {invoices.filter(i => i.status === 'pending').length}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">LKR {pendingPayments.toLocaleString()}</p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs text-gray-700">Overdue</p>
                      <p className="text-2xl font-semibold text-red-700 mt-2">{overdueInvoices}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        LKR {invoices.filter(i => i.status === 'pending' && new Date(i.dueDate) < new Date()).reduce((s, i) => s + i.amount, 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Collection Rate</span>
                      <span className="text-2xl font-semibold text-blue-700">{collectionRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${collectionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Verification Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      label: 'Verified Payments',
                      value: payments.filter(p => p.status === 'verified').length,
                      amount: payments.filter(p => p.status === 'verified').reduce((s, p) => s + p.amount, 0),
                      color: 'bg-green-100 text-green-700'
                    },
                    {
                      label: 'Pending Verification',
                      value: payments.filter(p => p.status === 'pending').length,
                      amount: payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
                      color: 'bg-orange-100 text-orange-700'
                    },
                    {
                      label: 'Rejected Payments',
                      value: payments.filter(p => p.status === 'rejected').length,
                      amount: payments.filter(p => p.status === 'rejected').reduce((s, p) => s + p.amount, 0),
                      color: 'bg-red-100 text-red-700'
                    },
                    {
                      label: 'Receipts Generated',
                      value: receipts.length,
                      amount: receipts.reduce((s, r) => s + r.amount, 0),
                      color: 'bg-blue-100 text-blue-700'
                    },
                  ].map((stat, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{stat.label}</p>
                        <p className="text-xs text-gray-600 mt-1">LKR {stat.amount.toLocaleString()}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full font-semibold ${stat.color}`}>
                        {stat.value}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Occupancy Tab Content */}
        <TabsContent value="occupancy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Unit Occupancy by Property</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {properties.map((property) => {
                  const propUnits = units.filter(u => u.propertyId === property.id);
                  const propOccupied = propUnits.filter(u => u.status === 'occupied').length;
                  const propRate = propUnits.length > 0 ? (propOccupied / propUnits.length) * 100 : 0;

                  return (
                    <div key={property.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{property.name}</p>
                          <p className="text-sm text-gray-500">
                            {propOccupied} of {propUnits.length} units occupied
                          </p>
                        </div>
                        <span className="text-lg font-semibold">{propRate.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${propRate >= 80 ? 'bg-green-600' :
                              propRate >= 50 ? 'bg-orange-600' :
                                'bg-red-600'
                            }`}
                          style={{ width: `${propRate}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance Tab Content */}
        <TabsContent value="maintenance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance Cost Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 text-sm font-medium text-gray-600">Property</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Total Requests</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Completed</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Total Cost</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((property) => {
                      const propUnits = units.filter(u => u.propertyId === property.id);
                      const propRequests = maintenanceRequests.filter(r =>
                        propUnits.some(u => u.id === r.unitId)
                      );
                      const propCompleted = propRequests.filter(r => r.status === 'completed').length;
                      const propCost = propRequests.reduce((sum, r) => {
                        const costs = maintenanceCosts.filter(c => c.requestId === r.id);
                        return sum + costs.reduce((s, c) => s + c.amount, 0);
                      }, 0);
                      const propAvg = propCompleted > 0 ? (propCost / propCompleted).toFixed(2) : '0.00';

                      return (
                        <tr key={property.id} className="border-b last:border-0">
                          <td className="py-3 font-medium">{property.name}</td>
                          <td className="py-3">{propRequests.length}</td>
                          <td className="py-3">{propCompleted}</td>
                          <td className="py-3 font-semibold">LKR {propCost.toLocaleString()}</td>
                          <td className="py-3">LKR {propAvg}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold bg-gray-50">
                      <td className="py-3">Total</td>
                      <td className="py-3">{maintenanceRequests.length}</td>
                      <td className="py-3">{completedRequests}</td>
                      <td className="py-3">LKR {totalMaintenanceCost.toLocaleString()}</td>
                      <td className="py-3">LKR {avgMaintenanceCost}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab Content */}
        <TabsContent value="payments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoice & Payment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Invoice Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">Total Invoices</span>
                      <span className="font-semibold">{totalInvoices}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-green-50 rounded">
                      <span className="text-sm text-green-900">Paid</span>
                      <span className="font-semibold text-green-700">{paidInvoices}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-orange-50 rounded">
                      <span className="text-sm text-orange-900">Pending</span>
                      <span className="font-semibold text-orange-700">
                        {invoices.filter(i => i.status === 'pending').length}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 bg-red-50 rounded">
                      <span className="text-sm text-red-900">Overdue</span>
                      <span className="font-semibold text-red-700">{overdueInvoices}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Financial Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm">Expected Revenue</span>
                      <span className="font-semibold">LKR {expectedMonthlyRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-green-50 rounded">
                      <span className="text-sm text-green-900">Collected</span>
                      <span className="font-semibold text-green-700">LKR {totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-orange-50 rounded">
                      <span className="text-sm text-orange-900">Pending</span>
                      <span className="font-semibold text-orange-700">LKR {pendingPayments.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2 bg-blue-50 rounded">
                      <span className="text-sm text-blue-900">Collection Rate</span>
                      <span className="font-semibold text-blue-700">{collectionRate}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tenant Payment History */}
          <Card>
            <CardHeader>
              <CardTitle>Tenant Payment Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="pb-3 text-sm font-medium text-gray-600">Tenant</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Total Invoices</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Paid</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Pending</th>
                      <th className="pb-3 text-sm font-medium text-gray-600">Total Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => {
                      const tenantInvoices = invoices.filter(i => i.tenantId === tenant.id);
                      const tenantPaid = tenantInvoices.filter(i => i.status === 'paid').length;
                      const tenantPending = tenantInvoices.filter(i => i.status === 'pending').length;
                      const tenantTotal = receipts
                        .filter(r => r.tenantId === tenant.id)
                        .reduce((sum, r) => sum + r.amount, 0);

                      return (
                        <tr key={tenant.id} className="border-b last:border-0">
                          <td className="py-3 font-medium">{tenant.name}</td>
                          <td className="py-3">{tenantInvoices.length}</td>
                          <td className="py-3 text-green-700 font-semibold">{tenantPaid}</td>
                          <td className="py-3 text-orange-700">{tenantPending}</td>
                          <td className="py-3 font-semibold">LKR {tenantTotal.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
