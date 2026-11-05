import Link from "next/link";
import type { Review } from "@/lib/types";
import { VoteButtons } from "./vote-buttons";
import { rating } from "./metrics-table";

export function ReviewFeed({ reviews }: { reviews: Review[] }) {
  if (!reviews.length)
    return (
      <div className="empty-state">
        <p>No reviews here yet.</p>
        <p className="meta">A thoughtful first review can help the next student find their way.</p>
      </div>
    );
  return (
    <div>
      {reviews.map((review) => (
        <article
          className="review"
          key={review.id}
          aria-label={`Review of ${review.course_code} by ${review.author_label}`}
        >
          <p className="review-context">
            {review.imported ? "Imported on" : "Date"}:{" "}
            <time dateTime={review.created_at}>{review.created_at.slice(0, 10)}</time>
            <span aria-hidden="true"> | </span>Course:{" "}
            <Link href={`/courses/${review.course_id}`}>
              <code>{review.course_code}</code>
            </Link>
            <span aria-hidden="true"> | </span>
            <Link href={`/professors/${review.professor_id}`}>{review.professor_name}</Link>
          </p>
          <p className="meta">
            {review.author_label}
            {review.imported && " · Historical feedback, imported into the archive"}
            {review.is_owner && (
              <>
                {" "}
                · <Link href={`/reviews/${review.id}/edit`}>Edit or delete your review</Link>
              </>
            )}
          </p>
          <p className="review-body">{review.body}</p>
          <p className="review-metrics">
            Overall: {rating(review.overall_rating)}/5 · Workload:{" "}
            {review.workload_rating == null
              ? "Not reported"
              : `${rating(review.workload_rating)}/5`}{" "}
            · Grading difficulty:{" "}
            {review.grading_difficulty == null
              ? "Not reported"
              : `${rating(review.grading_difficulty)}/5`}
          </p>
          <div className="tags" aria-label="Review tags">
            {review.tags.map((tag) => (
              <span className="tag" key={tag}>
                [ {tag} ]
              </span>
            ))}
          </div>
          <VoteButtons
            id={review.id}
            currentVote={review.my_vote}
            helpful={Number(review.helpful_count)}
            unhelpful={Number(review.unhelpful_count)}
            owner={review.is_owner}
          />
          <hr />
        </article>
      ))}
    </div>
  );
}
