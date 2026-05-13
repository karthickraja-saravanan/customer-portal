"use client";

import * as React from "react";
import { toast as sonnerToast } from "sonner";

type ToastVariant = "default" | "destructive";

export type ToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  action?: React.ReactElement;
};

function toMessage(node: React.ReactNode | undefined): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "string" || typeof node === "number") return String(node);
  return undefined;
}

/** Sonner-backed toast compatible with common shadcn `toast({ title, description, variant })` usage. */
export function toast(input: ToastInput) {
  const title = toMessage(input.title) ?? "";
  const description = toMessage(input.description);
  if (input.variant === "destructive") {
    return sonnerToast.error(title || "Error", { description });
  }
  return sonnerToast(title || "Done", { description });
}

export function useToast() {
  return React.useMemo(
    () => ({
      toast,
      dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    }),
    []
  );
}
