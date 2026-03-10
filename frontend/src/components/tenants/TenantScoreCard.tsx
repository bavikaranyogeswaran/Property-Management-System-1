import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trophy, AlertTriangle, AlertOctagon } from 'lucide-react';

interface TenantScoreCardProps {
  score: number;
}

export const TenantScoreCard: React.FC<TenantScoreCardProps> = ({ score }) => {
  const getStatusColor = (val: number) => {
    if (val >= 80) return 'text-green-600';
    if (val >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBarColor = (val: number) => {
    if (val >= 80) return 'bg-green-600';
    if (val >= 50) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const getIcon = (val: number) => {
    if (val >= 80) return <Trophy className="h-6 w-6 text-green-600" />;
    if (val >= 50) return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
    return <AlertOctagon className="h-6 w-6 text-red-600" />;
  };

  const getMessage = (val: number) => {
    if (val >= 80) return 'Excellent Standing';
    if (val >= 50) return 'Good Standing';
    return 'At Risk';
  };

  return (
    <Card className="h-full flex flex-col justify-center">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-gray-700">
          Tenant Behavior Score
        </CardTitle>
        {getIcon(score)}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold flex items-baseline gap-2">
          <span className={getStatusColor(score)}>{score}</span>
          <span className="text-muted-foreground text-sm font-normal">
            / 100
          </span>
        </div>
        <div className="mt-2 mb-2">
          {/* Custom Progress bar implementation if shadcn progress doesn't support color injection easily via props, 
                         but usually className works on the indicator if we override. 
                         However, shadcn Progress implies usage of 'value' and styling the root/indicator.
                         We will use a simple div for colored bar or standard Progress.
                     */}
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full ${getStatusBarColor(score)} transition-all duration-500`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Status:{' '}
          <span className={`font-medium ${getStatusColor(score)}`}>
            {getMessage(score)}
          </span>
        </p>
      </CardContent>
    </Card>
  );
};
