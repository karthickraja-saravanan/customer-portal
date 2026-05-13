"use client"

import * as React from "react"
import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

function normalizeSeriesKeys(
  dataKeys: string | string[] | undefined,
  fallback: string
): string[] {
  if (Array.isArray(dataKeys)) return dataKeys.map(String)
  if (typeof dataKeys === "string") {
    try {
      const p = JSON.parse(dataKeys)
      if (Array.isArray(p)) return p.map(String)
    } catch {
      if (dataKeys.trim()) return [dataKeys]
    }
  }
  return [fallback]
}

export interface LineChartProps {
  data: Record<string, unknown>[]
  dataLabel: string
  dataKeys?: string | string[]
  dataKey?: string
  showLegends?: boolean
}

export function LineChart({
  data,
  dataLabel,
  dataKeys,
  dataKey = "value",
  showLegends,
}: LineChartProps) {
  const keys = normalizeSeriesKeys(dataKeys, dataKey)
  const config = React.useMemo<ChartConfig>(() => {
    const c: ChartConfig = {}
    keys.forEach((k, i) => {
      c[k] = { label: k, color: `hsl(var(--chart-${(i % 5) + 1}))` }
    })
    return c
  }, [keys])

  return (
    <ChartContainer config={config} className="min-h-[220px] w-full">
      <RechartsLineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
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
        {keys.map((k) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={`var(--color-${k})`}
            strokeWidth={2}
            dot={false}
          />
        ))}
        {showLegends ? (
          <ChartLegend verticalAlign="bottom" content={<ChartLegendContent />} />
        ) : null}
      </RechartsLineChart>
    </ChartContainer>
  )
}
