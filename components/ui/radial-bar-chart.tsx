"use client"

import * as React from "react"
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart as RechartsRadialBarChart,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface RadialBarChartProps {
  data: Record<string, unknown>[]
  dataKey: string
  dataLabel: string
}

export function RadialBarChart({
  data,
  dataKey,
  dataLabel,
}: RadialBarChartProps) {
  const config = React.useMemo<ChartConfig>(() => {
    const c: ChartConfig = {}
    data.forEach((row, i) => {
      const name = String(row[dataLabel] ?? i)
      c[name] = { label: name, color: `hsl(var(--chart-${(i % 5) + 1}))` }
    })
    return c
  }, [data, dataLabel])

  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[300px] w-full">
      <RechartsRadialBarChart
        data={data}
        innerRadius="20%"
        outerRadius="100%"
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarAngleAxis type="category" dataKey={dataLabel} tickLine={false} tick={false} />
        <RadialBar dataKey={dataKey} background cornerRadius={6} fill="hsl(var(--chart-1))" />
      </RechartsRadialBarChart>
    </ChartContainer>
  )
}
