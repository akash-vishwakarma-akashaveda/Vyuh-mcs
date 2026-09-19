import React from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

interface SparklineProps {
  data?: number[];
  color?: string;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data = [28.1, 28.3, 28.2, 28.4, 28.5, 28.4, 28.6, 28.4],
  color = 'var(--action-primary)',
  height = 24,
}) => {
  const chartData = data.map((val, idx) => ({ idx, val }));

  return (
    <div className="w-16 h-6 flex items-center overflow-hidden">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="val"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
