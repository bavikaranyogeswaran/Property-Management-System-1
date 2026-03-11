import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { BehaviorLog } from '@/types/models';

interface BehaviorLogListProps {
  logs: BehaviorLog[];
}

export const BehaviorLogList: React.FC<BehaviorLogListProps> = ({ logs }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'positive':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'negative':
        return 'bg-red-100 text-red-800 hover:bg-red-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Score Impact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center h-24 text-muted-foreground"
              >
                No behavior records found.
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.log_id}>
                <TableCell>
                  {format(new Date(log.created_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell>{log.category}</TableCell>
                <TableCell>
                  <Badge className={getTypeColor(log.type)} variant="outline">
                    {log.type.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>{log.description}</TableCell>
                <TableCell
                  className={`text-right font-medium ${log.score_change >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {log.score_change > 0 ? '+' : ''}
                  {log.score_change}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
