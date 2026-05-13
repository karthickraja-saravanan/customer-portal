"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowUpDown, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
export interface DataTableColumnConfig {
  id?: string
  accessorKey?: string
  header?: string | React.ReactNode
  enableSorting?: boolean
}

export interface RowAction<TData> {
  id: string
  header: string
  onClick: (row: TData) => void
}

export interface DataTableProps<TData extends Record<string, unknown>> {
  columns: DataTableColumnConfig[]
  data: TData[]
  rowActions?: RowAction<TData>[]
  loading?: boolean
  pagination?: boolean
  globalSearch?: boolean
  pageSize?: number
}

export function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  rowActions,
  loading,
  pagination = false,
  globalSearch = false,
  pageSize = 10,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")

  const columnDefs = React.useMemo<ColumnDef<TData>[]>(() => {
    const defs: ColumnDef<TData>[] = columns.map((col) => {
      const id = (col.id ?? col.accessorKey) as string
      return {
        id,
        accessorKey: col.accessorKey ?? id,
        header: ({ column }) => {
          if (typeof col.header === "string" && col.enableSorting !== false) {
            return (
              <Button
                variant="ghost"
                className="-ml-3 h-8"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
              >
                {col.header}
                <ArrowUpDown className="ml-2 size-4 opacity-50" />
              </Button>
            )
          }
          return col.header ?? id
        },
        enableSorting: col.enableSorting !== false,
      }
    })

    if (rowActions?.length) {
      defs.push({
        id: "__actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {rowActions.map((a) => (
              <Button
                key={a.id}
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => a.onClick(row.original)}
              >
                {a.header}
              </Button>
            ))}
          </div>
        ),
        enableSorting: false,
      })
    }

    return defs
  }, [columns, rowActions])

  const table = useReactTable({
    data: Array.isArray(data) ? data : [],
    columns: columnDefs,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    initialState: pagination
      ? { pagination: { pageSize } }
      : undefined,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").toLowerCase().trim()
      if (!q) return true
      return Object.values(row.original).some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      )
    },
  })

  return (
    <div className="space-y-3">
      {globalSearch ? (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8"
          />
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columnDefs.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columnDefs.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && table.getPageCount() > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  )
}
