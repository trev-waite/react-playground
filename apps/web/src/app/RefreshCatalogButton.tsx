import { useState } from "react";
import { refreshLiveCatalog } from "../lib/liveCatalog";

export function RefreshCatalogButton({ className }: { className?: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      await refreshLiveCatalog();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not refresh catalog.");
    } finally {
      setRefreshing(false);
    }
  }

  return <>
    <button
      type="button"
      className={className}
      aria-label="Refresh Live catalog"
      disabled={refreshing || import.meta.env.PROD}
      title={import.meta.env.PROD ? "Rebuild to refresh the production catalog" : undefined}
      onClick={() => void refresh()}
    >
      {refreshing ? "Refreshing…" : "Refresh"}
    </button>
    {error && <span role="alert">{error}</span>}
  </>;
}
