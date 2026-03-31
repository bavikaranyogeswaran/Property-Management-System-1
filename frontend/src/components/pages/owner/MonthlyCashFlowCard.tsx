import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import apiClient from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatLKR } from '@/utils/formatters';

interface MonthlyData {
  month: string;
  revenue: number;
  expense: number;
}

export function MonthlyCashFlowCard() {
  const [data, setData] = React.useState<MonthlyData[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient.get('/reports/cash-flow')
      .then(res => {
        // Ensure we handle potential sorting issues from DB
        const sortedData = res.data.sort((a: any, b: any) => a.month.localeCompare(b.month));
        setData(sortedData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching cash flow data:', err);
        setLoading(false);
      });
  }, []);



  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleString('default', { month: 'short' });
  };

  if (loading) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-6 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Calculate some basic stats for the header
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalExpense = data.reduce((sum, d) => sum + d.expense, 0);
  const netProfit = totalRevenue - totalExpense;

  return (
    <Card className="col-span-full lg:col-span-2 shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="size-5 text-emerald-600" />
            Monthly Cash Flow
          </CardTitle>
          <CardDescription>Revenue vs Maintenance Expenses (Last 12 Months)</CardDescription>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Annual Net Position</p>
          <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {netProfit >= 0 ? '+' : ''}{formatLKR(netProfit)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              barGap={8}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.2}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="month" 
                tickFormatter={formatMonth}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 12 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(val) => val > 1000 ? `LKR ${(val/1000).toFixed(0)}k` : `LKR ${val}`}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: 'none', 
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)' 
                }}
                formatter={(value: number) => [formatLKR(value), '']}
                labelFormatter={(label) => {
                  const [year, month] = label.split('-');
                  return new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
                }}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                iconType="circle"
                wrapperStyle={{ paddingTop: '0px', paddingBottom: '24px' }}
              />
              <Bar 
                name="Revenue" 
                dataKey="revenue" 
                fill="url(#colorRevenue)" 
                radius={[4, 4, 0, 0]} 
                animationDuration={1500}
              />
              <Bar 
                name="Expenses" 
                dataKey="expense" 
                fill="url(#colorExpense)" 
                radius={[4, 4, 0, 0]} 
                animationDuration={1500}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Mobile Insight Bar */}
        <div className="grid grid-cols-2 gap-4 mt-6 sm:hidden border-t border-slate-100 pt-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Revenue</p>
            <p className="text-sm font-bold text-emerald-600">{formatLKR(totalRevenue)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Net Profit</p>
            <p className={`text-sm font-bold ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {formatLKR(netProfit)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
