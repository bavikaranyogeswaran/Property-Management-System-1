import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Star, Milestone, Info, AlertCircle, History as HistoryIcon } from 'lucide-react';
import apiClient from '@/services/api';

interface BehaviorLog {
  id: string;
  type: 'positive' | 'negative';
  category: string;
  score_change: number;
  description: string;
  created_at: string;
}

interface BehaviorData {
  score: number;
  logs: BehaviorLog[];
}

export function TenantBehaviorHistory() {
  const [data, setData] = React.useState<BehaviorData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient.get('/behavior/my-score')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching behavior data:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center">Loading your behavior profile...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500">No behavior data found.</div>;
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Tenant';
    if (score >= 60) return 'Good Standing';
    if (score >= 40) return 'Requires Attention';
    return 'At Risk';
  };

  return (
    <div className="space-y-6 overflow-y-auto max-h-full pr-2">
      {/* Score Header */}
      <div className="flex flex-col items-center text-center p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <div className="relative size-32 mb-4">
          <svg className="size-full" viewBox="0 0 36 36">
            <path
              className="text-gray-200 stroke-current"
              strokeWidth="3"
              fill="none"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={`${getScoreColor(data.score)} stroke-current`}
              strokeWidth="3"
              strokeDasharray={`${data.score}, 100`}
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold">{data.score}</span>
            <span className="text-xs text-gray-500">Points</span>
          </div>
        </div>
        <h3 className={`text-xl font-bold ${getScoreColor(data.score)}`}>
          {getScoreLabel(data.score)}
        </h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Your behavior score reflects your history with us. High scores qualify you for renewal bonuses and priority maintenance!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Point Rules */}
        <Card className="border-indigo-100 shadow-sm">
          <CardHeader className="pb-3 text-indigo-900">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="size-4 text-indigo-500" />
              How to Earn Points
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">On-time Rent Payment</span>
              <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">+5 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Lease Renewal</span>
              <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">+20 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Minor Issue Self-Fix</span>
              <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">+10 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Refer a Friend</span>
              <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">+15 pts</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Penalties */}
        <Card className="border-red-100 shadow-sm">
          <CardHeader className="pb-3 text-red-900">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="size-4 text-red-500" />
              Impact on Score
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Late Rent Payment</span>
              <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">-10 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Noise Complaints</span>
              <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">-15 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Property Damage</span>
              <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">-30 pts</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Unauthorized Pets</span>
              <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200">-20 pts</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HistoryIcon className="size-5 text-gray-500" />
            Score History
          </CardTitle>
          <CardDescription>A complete log of your points activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.logs.length > 0 ? (
              data.logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between py-3 border-b last:border-0 border-gray-100">
                  <div className="flex gap-3">
                    <div className={`mt-1 p-2 rounded-lg ${log.type === 'positive' ? 'bg-green-50' : 'bg-red-50'}`}>
                      {log.type === 'positive' ? (
                        <TrendingUp className={`size-4 ${getScoreColor(100)}`} />
                      ) : (
                        <TrendingDown className={`size-4 ${getScoreColor(0)}`} />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{log.description}</p>
                      <p className="text-xs text-gray-500">{log.category} • {new Date(log.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className={`font-bold ${log.type === 'positive' ? 'text-green-600' : 'text-red-600'}`}>
                    {log.type === 'positive' ? '+' : ''}{log.score_change}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-8 text-gray-400 italic">No points history yet. Start earning points by paying rent on time!</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 flex gap-3">
        <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          <strong>Tip:</strong> Maintaining a score above 85 makes you a "Premium Tenant," unlocking early lease renewal options and zero-deposit moves if you switch units!
        </p>
      </div>
    </div>
  );
}
