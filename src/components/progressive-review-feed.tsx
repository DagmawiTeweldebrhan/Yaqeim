"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoreReviews } from "@/app/actions";
import type { Review } from "@/lib/types";
import { ReviewFeed } from "./review-feed";

export function ProgressiveReviewFeed({ initialReviews, initialPage, professorId, courseId, sort }: {
  initialReviews: Review[];
  initialPage: number;
  professorId?: string;
  courseId?: string;
  sort: "helpful" | "newest";
}) {
  const [additional, setAdditional] = useState<Review[]>([]);
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(initialReviews.length === 20 && initialPage < 5001);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (busy.current || !hasMore) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const nextPage = page + 1;
      const next = await loadMoreReviews({ professorId, courseId, page: nextPage, sort });
      setAdditional(previous => {
        const known = new Set([...initialReviews, ...previous].map(review => review.id));
        return [...previous, ...next.filter(review => !known.has(review.id))];
      });
      setPage(nextPage);
      setHasMore(next.length === 20 && nextPage < 5001);
    } catch {
      setError("More reviews could not be loaded. Try again or use the page links below.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [hasMore, page, professorId, courseId, sort, initialReviews]);

  useEffect(() => {
    if (!sentinel.current || !hasMore || error || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) void load();
    }, { rootMargin: "120px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, error, load]);

  return <><ReviewFeed reviews={[...initialReviews, ...additional]} />
    {hasMore && <div ref={sentinel} className="load-more"><button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Loading reviews…" : "Load more reviews"}</button><p className="meta" aria-live="polite">{loading ? "Opening the next page of experiences." : `${initialReviews.length + additional.length} reviews displayed.`}</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
