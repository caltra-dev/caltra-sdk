"use client";

import { LoaderCircle } from "lucide-react";

/** Shared loading indicator for disclosures, with a localized screen-reader label. */
export function DetailsLoading({ label }: { label?: string }) {
  return <span role="status" aria-label={label}>
    <LoaderCircle className="caltra-details-spinner" aria-hidden="true" />
  </span>;
}
