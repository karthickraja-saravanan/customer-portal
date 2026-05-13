"use client"

import * as React from "react"
import { Cell, Pie, PieChart as RechartsPieChart } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface PieChartProps {
  data: Record<string, unknown>[]
  dataKey: string
  dataLabel: string
  innerRadius?: number
  showPercentage?: boolean
  showLegends?: boolean
}

export function PieChart({
  data,
  dataKey,
  dataLabel,
  innerRadius = 0,
}: PieChartProps) {
  const config = React.useMemo<ChartConfig>(() => {
    const c: ChartConfig = {}
    data.forEach((row, i) => {
      const name = String(row[dataLabel] ?? i)
      c[name] = { label: name, color: `hsl(var(--chart-${(i % 5) + 1}))` }
    })
    return c
  }, [data, dataLabel])

  return (
    <ChartContainer config={config} className="min-h-[240px] w-full">
      <RechartsPieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={dataLabel}
          innerRadius={innerRadius}
          strokeWidth={2}
          stroke="hsl(var(--background))"
        >
          {data.map((row, i) => (
            <Cell
              key={String(row[dataLabel] ?? i)}
              fill={`hsl(var(--chart-${(i % 5) + 1}))`}
            />
          ))}
        </Pie>
      </RechartsPieChart>
    </ChartContainer>
  )
}
