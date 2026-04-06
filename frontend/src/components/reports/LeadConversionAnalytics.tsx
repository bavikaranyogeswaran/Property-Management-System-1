import React from 'react';
import { Lead, LeadStageHistory } from '@/app/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart,
  Bar,
  FunnelChart,
  Funnel,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import { TrendingUp, TrendingDown, Clock, Target } from 'lucide-react';

interface LeadConversionAnalyticsProps {
  leads: Lead[];
  leadStageHistory: LeadStageHistory[];
}

export function LeadConversionAnalytics({
  leads,
  leadStageHistory,
}: LeadConversionAnalyticsProps) {
  // Calculate lead metrics
  const totalLeads = leads.length;
  const interestedLeads = leads.filter((l) => l.status === 'interested').length;
  const convertedLeads = leads.filter((l) => l.status === 'converted').length;
  const droppedLeads = leads.filter((l) => l.status === 'dropped').length;

  const conversionRate =
    totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0.0';
  const dropOffRate =
    totalLeads > 0 ? ((droppedLeads / totalLeads) * 100).toFixed(1) : '0.0';

  // Funnel data
  const funnelData = [
    {
      stage: 'Interested',
      value: interestedLeads + convertedLeads,
      fill: '#3b82f6',
    },
    { stage: 'Converted', value: convertedLeads, fill: '#10b981' },
  ];

  // Stage distribution
  const stageDistribution = [
    { name: 'Interested', value: interestedLeads, color: '#3b82f6' },
    { name: 'Converted', value: convertedLeads, color: '#10b981' },
    { name: 'Dropped', value: droppedLeads, color: '#ef4444' },
  ];

  // Calculate conversion from each stage
  const interestedToConverted = leadStageHistory.filter(
    (h) => h.fromStatus === 'interested' && h.toStatus === 'converted'
  ).length;

  const interestedToDropped = leadStageHistory.filter(
    (h) => h.fromStatus === 'interested' && h.toStatus === 'dropped'
  ).length;

  // Calculate average time in each stage
  const calculateAvgTimeInStage = (stage: Lead['status']) => {
    const transitionsFromStage = leadStageHistory.filter(
      (h) => h.fromStatus === stage
    );
    if (transitionsFromStage.length === 0) return 0;

    const totalDays = transitionsFromStage.reduce(
      (sum, h) => sum + (h.durationInPreviousStage || 0),
      0
    );
    return Math.round(totalDays / transitionsFromStage.length);
  };

  const avgTimeInterested = calculateAvgTimeInStage('interested');

  // Calculate average time to convert
  const convertedLeadsHistory = leads
    .filter((l) => l.status === 'converted')
    .map((lead) => {
      const history = leadStageHistory.filter(
        (h) => String(h.leadId) === String(lead.id)
      );
      const totalTime = history.reduce(
        (sum, h) => sum + (h.durationInPreviousStage || 0),
        0
      );
      return totalTime;
    });

  const avgTimeToConvert =
    convertedLeadsHistory.length > 0
      ? Math.round(
          convertedLeadsHistory.reduce((a, b) => a + b, 0) /
            convertedLeadsHistory.length
        )
      : 0;

  // Stage velocity data
  const stageVelocityData = [
    { stage: 'Interested', avgDays: avgTimeInterested },
  ];

  // Conversion rate by stage
  const conversionByStageData = [
    {
      stage: 'Interested → Converted',
      converted: interestedToConverted,
      dropped: interestedToDropped,
      rate:
        interestedToConverted + interestedToDropped > 0
          ? (
              (interestedToConverted /
                (interestedToConverted + interestedToDropped)) *
              100
            ).toFixed(1)
          : '0.0',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-600">Total Leads</p>
                <p className="text-2xl font-semibold mt-1">{totalLeads}</p>
                <p className="text-xs text-gray-500 mt-1">All-time</p>
              </div>
              <div className="bg-blue-50 p-2 rounded-lg">
                <Target className="size-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-600">Conversion Rate</p>
                <p className="text-2xl font-semibold mt-1 text-green-700">
                  {conversionRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {convertedLeads} of {totalLeads} converted
                </p>
              </div>
              <div className="bg-green-50 p-2 rounded-lg">
                <TrendingUp className="size-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-600">Drop-off Rate</p>
                <p className="text-2xl font-semibold mt-1 text-red-700">
                  {dropOffRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {droppedLeads} leads lost
                </p>
              </div>
              <div className="bg-red-50 p-2 rounded-lg">
                <TrendingDown className="size-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-600">Avg Time to Convert</p>
                <p className="text-2xl font-semibold mt-1">
                  {avgTimeToConvert}
                </p>
                <p className="text-xs text-gray-500 mt-1">days</p>
              </div>
              <div className="bg-purple-50 p-2 rounded-lg">
                <Clock className="size-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={funnelData}
                layout="vertical"
                margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="stage" />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Lead Stage Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stageDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stageDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Average Time in Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Stage Velocity (Avg Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stageVelocityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgDays" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Conversion Rate by Stage */}
        <Card>
          <CardHeader>
            <CardTitle>Stage Transition Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {conversionByStageData.map((data, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{data.stage}</span>
                    <Badge variant="outline">{data.rate}%</Badge>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${data.rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>✓ {data.converted} converted</span>
                    <span>✗ {data.dropped} dropped</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Conversion Metrics Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="pb-3 text-sm font-medium text-gray-600">
                    Stage
                  </th>
                  <th className="pb-3 text-sm font-medium text-gray-600">
                    Current Leads
                  </th>
                  <th className="pb-3 text-sm font-medium text-gray-600">
                    Avg Time (days)
                  </th>
                  <th className="pb-3 text-sm font-medium text-gray-600">
                    Conversion To Next
                  </th>
                  <th className="pb-3 text-sm font-medium text-gray-600">
                    Drop-off
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 font-medium">Interested</td>
                  <td className="py-3">{interestedLeads}</td>
                  <td className="py-3">{avgTimeInterested} days</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-green-700 font-semibold">
                        {interestedToConverted}
                      </span>
                      <span className="text-xs text-gray-500">
                        (
                        {interestedToConverted + interestedToDropped > 0
                          ? (
                              (interestedToConverted /
                                (interestedToConverted + interestedToDropped)) *
                              100
                            ).toFixed(0)
                          : 0}
                        %)
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="text-red-700 font-semibold">
                      {interestedToDropped}
                    </span>
                  </td>
                </tr>
                <tr className="bg-green-50">
                  <td className="py-3 font-medium text-green-900">Converted</td>
                  <td className="py-3 text-green-900">{convertedLeads}</td>
                  <td className="py-3 text-green-900">-</td>
                  <td className="py-3 text-green-900 font-semibold">
                    Success!
                  </td>
                  <td className="py-3 text-green-900">-</td>
                </tr>
                <tr className="bg-red-50">
                  <td className="py-3 font-medium text-red-900">Dropped</td>
                  <td className="py-3 text-red-900">{droppedLeads}</td>
                  <td className="py-3 text-red-900">-</td>
                  <td className="py-3 text-red-900">-</td>
                  <td className="py-3 text-red-900 font-semibold">Lost</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-sm text-blue-900 mb-2">
                Pipeline Health
              </h4>
              <p className="text-sm text-blue-800">
                {interestedLeads} leads currently in active stages. Focus on
                converting {interestedLeads} interested leads.
              </p>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-medium text-sm text-green-900 mb-2">
                Conversion Performance
              </h4>
              <p className="text-sm text-green-800">
                Overall conversion rate of {conversionRate}% with an average
                time of {avgTimeToConvert} days.
                {parseFloat(conversionRate) > 30
                  ? ' Excellent performance!'
                  : ' Room for improvement.'}
              </p>
            </div>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <h4 className="font-medium text-sm text-orange-900 mb-2">
                Stage Bottleneck
              </h4>
              <p className="text-sm text-orange-800">
                {avgTimeInterested > 14
                  ? `Leads spend ${avgTimeInterested} days in Interested stage. Consider faster follow-ups.`
                  : `Average conversion time is good.`}
              </p>
            </div>

            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-sm text-red-900 mb-2">
                Drop-off Analysis
              </h4>
              <p className="text-sm text-red-800">
                {droppedLeads} leads lost ({dropOffRate}% drop-off rate).
                {droppedLeads} leads lost ({dropOffRate}% drop-off rate).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
