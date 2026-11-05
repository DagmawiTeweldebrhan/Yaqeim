import type { Metadata } from "next";
import { getCatalog } from "@/lib/data";
import { ReviewForm } from "@/components/review-form";
import { first, type QueryParams } from "@/components/pagination";
export const metadata: Metadata = { title: "Submit a review" };

export default async function SubmitPage({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const [catalog, query] = await Promise.all([getCatalog(), searchParams]);
  const professor = catalog.professors.some(p => p.id === first(query.professor)) ? first(query.professor) : undefined;
  const course = catalog.courses.some(c => c.id === first(query.course)) ? first(query.course) : undefined;
  return <><div className="page-intro"><p className="section-label">Contribute to the archive</p><h1>Leave a useful review.</h1><p>Your experience can make someone else’s semester a little clearer. Write about the teaching, the work, and what helped you learn.</p></div>
    {catalog.professors.length && catalog.courses.length ? <ReviewForm {...catalog} defaults={{ professor, course }} /> : <div className="empty-state"><h2>The catalog is being prepared.</h2><p>Reviews can be submitted once professors and courses have been added to the archive.</p></div>}
  </>;
}
