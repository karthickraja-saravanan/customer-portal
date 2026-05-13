"use client"

import * as React from "react"
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
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

export interface AreaChartProps {
  data: Record<string, unknown>[]
  dataLabel: string
  /** One or more numeric series keys (multi-series). */
  dataKeys?: string | string[]
  /** Single-series fallback when `dataKeys` is omitted. */
  dataKey?: string
  showLegends?: boolean
}

export function AreaChart({
  data,
  dataLabel,
  dataKeys,
  dataKey = "value",
  showLegends,
}: AreaChartProps) {
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
      <RechartsAreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
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
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stroke={`var(--color-${k})`}
            fill={`var(--color-${k})`}
            fillOpacity={0.35}
            stackId="stack"
          />
        ))}
        {showLegends ? (
          <ChartLegend verticalAlign="bottom" content={<ChartLegendContent />} />
        ) : null}
      </RechartsAreaChart>
    </ChartContainer>
  )
}
