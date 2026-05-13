"use client"

import * as React from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadarChart,
} from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface RadarChartProps {
  data: Record<string, unknown>[]
  /** Key used for the angle labels (e.g. `subject`). */
  dataLabel: string
  /** Numeric series to plot; defaults to other keys on the first row. */
  dataKeys?: string[]
  showLegends?: boolean
}

export function RadarChart({
  data,
  dataLabel,
  dataKeys,
  showLegends,
}: RadarChartProps) {
  const keys = React.useMemo(() => {
    if (dataKeys?.length) return dataKeys
    const row = data[0]
    if (!row) return [] as string[]
    return Object.keys(row).filter((k) => {
      if (k === dataLabel) return false
      const v = row[k]
      return (
        typeof v === "number" ||
        (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
      )
    })
  }, [data, dataLabel, dataKeys])

  const config = React.useMemo<ChartConfig>(() => {
    const c: ChartConfig = {}
    keys.forEach((k, i) => {
      c[k] = { label: k, color: `hsl(var(--chart-${(i % 5) + 1}))` }
    })
    return c
  }, [keys])

  if (!keys.length) return null

  return (
    <ChartContainer config={config} className="min-h-[280px] w-full">
      <RechartsRadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <PolarGrid />
        <PolarAngleAxis dataKey={dataLabel} />
        <PolarRadiusAxis angle={30} domain={[0, "auto"]} />
        {keys.map((k) => (
          <Radar
            key={k}
            name={k}
            dataKey={k}
            stroke={`var(--color-${k})`}
            fill={`var(--color-${k})`}
            fillOpacity={0.35}
          />
        ))}
        {showLegends ? (
          <ChartLegend verticalAlign="bottom" content={<ChartLegendContent />} />
        ) : null}
      </RechartsRadarChart>
    </ChartContainer>
  )
}
