"use client"

import * as React from "react"
import { Bar, BarChart as RechartsBarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface BarChartProps {
  data: Record<string, unknown>[]
  dataKey: string
  dataLabel: string
  showLegends?: boolean
  legendsPosition?: "top" | "bottom" | "left" | "right"
}

export function BarChart({
  data,
  dataKey,
  dataLabel,
  showLegends,
  legendsPosition = "bottom",
}: BarChartProps) {
  const config = React.useMemo<ChartConfig>(
    () => ({
      [dataKey]: { label: dataKey, color: "hsl(var(--chart-1))" },
    }),
    [dataKey]
  )

  return (
    <ChartContainer config={config} className="min-h-[220px] w-full">
      <RechartsBarChart
        data={data}
        margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={dataLabel}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => String(v)}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar
          dataKey={dataKey}
          fill={`var(--color-${dataKey})`}
          radius={4}
        />
        {showLegends ? (
          <ChartLegend
            verticalAlign={legendsPosition === "top" ? "top" : "bottom"}
            content={<ChartLegendContent />}
          />
        ) : null}
      </RechartsBarChart>
    </ChartContainer>
  )
}
