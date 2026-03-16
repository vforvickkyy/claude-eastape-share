// Re-export from the central api utility — routes all /api/ calls to Supabase Edge Functions
export { userApiFetch } from "./api.js";

export function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function totalShareSize(share) {
  return (share.files || []).reduce((s, f) => s + (f.size || 0), 0);
}

export function shareLabel(share) {
  const count = share.files?.length || 0;
  return count === 1 ? share.files[0].name : `${count} files`;
}
