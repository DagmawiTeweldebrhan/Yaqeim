import Link from "next/link";
export type QueryParams = Record<string, string | string[] | undefined>;
export function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
export function pageNumber(value: string | string[] | undefined) {
  const n = Number(first(value));
  return Number.isInteger(n) && n > 0 ? Math.min(n, 5001) : 1;
}
export function Pagination({
  page,
  count,
  path,
  query = {},
}: {
  page: number;
  count: number;
  path: string;
  query?: QueryParams;
}) {
  function href(next: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (key !== "page" && value)
        for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry);
    if (next > 1) params.set("page", String(next));
    return `${path}${params.size ? `?${params}` : ""}`;
  }
  if (page === 1 && count < 20) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>{page > 1 && <Link href={href(page - 1)}>← Previous</Link>}</span>
      <span className="current-page">Page {page}</span>
      <span>{count === 20 && page < 5001 && <Link href={href(page + 1)}>Next →</Link>}</span>
    </nav>
  );
}
