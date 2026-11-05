import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getCatalog, getOwnReview } from "@/lib/data";
import { DeleteReviewForm, ReviewForm } from "@/components/review-form";

export default async function EditReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [review, catalog] = await Promise.all([getOwnReview(id), getCatalog()]);
  if (!review) notFound();
  return (
    <>
      <p className="meta">
        <Link href="/reviews">← My reviews</Link>
      </p>
      <div className="page-intro">
        <p className="section-label">Revise your contribution</p>
        <h1>Edit your review</h1>
        <p className="meta">
          Your professor and course stay the same. Update the details of your experience below.
        </p>
      </div>
      <ReviewForm {...catalog} review={review} />
      <hr />
      <DeleteReviewForm id={id} />
    </>
  );
}
