// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressiveReviewFeed } from "@/components/progressive-review-feed";
import { ReviewForm } from "@/components/review-form";
import { VoteButtons } from "@/components/vote-buttons";
import type { ActionState, Course, Professor, Review } from "@/lib/types";

const actions = vi.hoisted(() => ({
  submitNewReview: vi.fn(), updateReview: vi.fn(), deleteReview: vi.fn(),
  voteReview: vi.fn(), loadMoreReviews: vi.fn(),
}));
vi.mock("@/app/actions", () => actions);

const professors: Professor[] = [
  { id: "20000000-0000-4000-8000-000000000001", full_name: "Ada Example", department: "Computer Science" },
  { id: "20000000-0000-4000-8000-000000000002", full_name: "Noor Sample", department: "Mathematics" },
];
const courses: Course[] = [
  { id: "30000000-0000-4000-8000-000000000001", code: "CS-UH 1001", title: "Introduction to Computer Science", department: "Computer Science" },
  { id: "30000000-0000-4000-8000-000000000002", code: "CS-UH 1002", title: "Data Structures", department: "Computer Science" },
];
const success: ActionState = { status: "success", message: "Your vote has been recorded." };
function review(index: number): Review {
  return {
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    professor_id: professors[0].id, professor_name: professors[0].full_name,
    course_id: courses[0].id, course_code: courses[0].code, course_title: courses[0].title,
    body: `Student experience number ${index}: helpful lectures and specific feedback.`,
    overall_rating: 4, workload_rating: 3, grading_difficulty: 2,
    tags: ["Discussion Based"], created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z",
    imported: false, is_anonymous: true, author_label: "Anonymous student", is_owner: false,
    helpful_count: 0, unhelpful_count: 0, my_vote: 0,
  };
}
const firstPage = Array.from({ length: 20 }, (_, index) => review(index + 1));

beforeEach(() => {
  vi.clearAllMocks();
  actions.voteReview.mockResolvedValue(success);
  actions.loadMoreReviews.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("review form", () => {
  it.each([
    "Your change could not be saved. Please try again.",
    "Sample archive: this review was validated but was not saved.",
  ])("preserves the complete draft after: %s", async message => {
    actions.submitNewReview.mockResolvedValue({ status: "error", message });
    const user = userEvent.setup();
    render(<ReviewForm professors={professors} courses={courses} />);
    await user.selectOptions(screen.getByLabelText("Professor"), professors[1].id);
    await user.selectOptions(screen.getByLabelText("Course"), courses[1].id);
    const body = "The examples helped me learn, and the weekly feedback was useful.";
    await user.type(screen.getByLabelText("Review text"), body);
    fireEvent.change(screen.getByLabelText("Overall rating"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Workload"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Grading difficulty"), { target: { value: "4" } });
    await user.click(screen.getByLabelText("Easy A"));
    await user.click(screen.getByLabelText("Accessible Office Hours"));
    await user.click(screen.getByLabelText("Post anonymously"));
    await user.click(screen.getByRole("button", { name: "Submit review" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByLabelText("Review text")).toHaveProperty("value", body);
    expect(screen.getByLabelText("Professor")).toHaveProperty("value", professors[1].id);
    expect(screen.getByLabelText("Course")).toHaveProperty("value", courses[1].id);
    expect(screen.getByLabelText("Overall rating")).toHaveProperty("value", "5");
    expect(screen.getByLabelText("Workload")).toHaveProperty("value", "2");
    expect(screen.getByLabelText("Grading difficulty")).toHaveProperty("value", "4");
    expect(screen.getByLabelText("Easy A")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Accessible Office Hours")).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Post anonymously")).toHaveProperty("checked", false);
    const submitted = actions.submitNewReview.mock.calls[0][1] as FormData;
    expect(submitted.get("body")).toBe(body);
    expect(submitted.get("overall_rating")).toBe("5");
    expect(submitted.getAll("tags")).toEqual(["Easy A", "Accessible Office Hours"]);
    expect(submitted.has("is_anonymous")).toBe(false);
  });

  it("narrows native selects by department or course name while preserving a selection", async () => {
    const user = userEvent.setup();
    render(<ReviewForm professors={professors} courses={courses} />);
    await user.type(screen.getByLabelText("Find a professor"), "mathematics");
    const professorSelect = screen.getByLabelText("Professor");
    expect(within(professorSelect).queryByRole("option", { name: /Ada Example/ })).toBeNull();
    expect(within(professorSelect).getByRole("option", { name: /Noor Sample/ })).toBeTruthy();
    await user.selectOptions(professorSelect, professors[1].id);
    await user.clear(screen.getByLabelText("Find a professor"));
    await user.type(screen.getByLabelText("Find a professor"), "no matching faculty");
    expect(professorSelect).toHaveProperty("value", professors[1].id);
    expect(within(professorSelect).getByRole("option", { name: /Noor Sample/ })).toBeTruthy();

    await user.type(screen.getByLabelText("Find a course"), "data structures");
    const courseSelect = screen.getByLabelText("Course");
    expect(within(courseSelect).queryByRole("option", { name: /Introduction/ })).toBeNull();
    await user.selectOptions(courseSelect, courses[1].id);
    expect(courseSelect).toHaveProperty("value", courses[1].id);
  });

  it("shows an actionable message when a search has no matches", async () => {
    const user = userEvent.setup();
    render(<ReviewForm professors={professors} courses={courses} />);
    await user.type(screen.getByLabelText("Find a professor"), "unlisted faculty");
    expect(screen.getByText("No matching professors. Try a shorter name.")).toBeTruthy();
    expect(within(screen.getByLabelText("Professor")).getAllByRole("option")).toHaveLength(1);
  });

  it("submits edits to the existing review and keeps its course and professor fixed", async () => {
    const user = userEvent.setup();
    const existing = review(1);
    actions.updateReview.mockResolvedValue({ status: "success", message: "Success: Your review has been updated." });
    render(<ReviewForm professors={professors} courses={courses} review={existing} />);
    expect(screen.getByLabelText("Professor")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Course")).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText("Find a professor")).toBeNull();
    await user.clear(screen.getByLabelText("Review text"));
    await user.type(screen.getByLabelText("Review text"), "An updated account after finishing the course and final project.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Success: Your review has been updated.");
    expect(actions.updateReview.mock.calls[0][0]).toBe(existing.id);
    const form = actions.updateReview.mock.calls[0][2] as FormData;
    expect(form.get("professor_id")).toBe(existing.professor_id);
    expect(form.get("course_id")).toBe(existing.course_id);
    expect(actions.submitNewReview).not.toHaveBeenCalled();
  });
});

describe("helpful votes", () => {
  it("adds and removes a helpful vote with accurate counts", async () => {
    const user = userEvent.setup();
    render(<VoteButtons id={review(1).id} currentVote={0} helpful={2} unhelpful={1} owner={false} />);
    await user.click(screen.getByRole("button", { name: "Helpful (2)" }));
    const voted = await screen.findByRole("button", { name: "Helpful (3)" });
    expect(voted.getAttribute("aria-pressed")).toBe("true");
    expect(actions.voteReview.mock.calls[0][1]).toBe(1);
    await user.click(voted);
    const removed = await screen.findByRole("button", { name: "Helpful (2)" });
    expect(removed.getAttribute("aria-pressed")).toBe("false");
    expect(actions.voteReview.mock.calls[1][1]).toBe(0);
    expect(screen.getByRole("button", { name: "Not helpful (1)" })).toBeTruthy();
  });

  it("switches between vote directions without retaining the previous count", async () => {
    const user = userEvent.setup();
    render(<VoteButtons id={review(1).id} currentVote={-1} helpful={5} unhelpful={2} owner={false} />);
    await user.click(screen.getByRole("button", { name: "Helpful (5)" }));
    await screen.findByRole("button", { name: "Helpful (6)" });
    expect(screen.getByRole("button", { name: "Not helpful (1)" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("leaves counts untouched when the server rejects a vote", async () => {
    actions.voteReview.mockResolvedValue({ status: "error", message: "Sample archive: votes are not saved." });
    const user = userEvent.setup();
    render(<VoteButtons id={review(1).id} currentVote={0} helpful={2} unhelpful={1} owner={false} />);
    await user.click(screen.getByRole("button", { name: "Helpful (2)" }));
    await screen.findByText("Sample archive: votes are not saved.");
    expect(screen.getByRole("button", { name: "Helpful (2)" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Not helpful (1)" })).toBeTruthy();
  });

  it("does not double-count when refreshed server props already contain the successful vote", async () => {
    let resolveVote!: (value: ActionState) => void;
    actions.voteReview.mockImplementation(() => new Promise<ActionState>(resolve => { resolveVote = resolve; }));
    const user = userEvent.setup();
    const { rerender } = render(<VoteButtons id={review(1).id} currentVote={0} helpful={2} unhelpful={1} owner={false} />);
    await user.click(screen.getByRole("button", { name: "Helpful (2)" }));
    expect(screen.getByRole("button", { name: "Helpful (2)" })).toHaveProperty("disabled", true);
    rerender(<VoteButtons id={review(1).id} currentVote={1} helpful={3} unhelpful={1} owner={false} />);
    await act(async () => { resolveVote(success); });
    const button = await screen.findByRole("button", { name: "Helpful (3)" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Helpful (4)" })).toBeNull();
    rerender(<VoteButtons id={review(1).id} currentVote={1} helpful={3} unhelpful={1} owner={false} />);
    expect(screen.getByRole("button", { name: "Helpful (3)" })).toBeTruthy();
  });

  it("disables voting on the current student's own review", async () => {
    const user = userEvent.setup();
    render(<VoteButtons id={review(1).id} currentVote={0} helpful={2} unhelpful={1} owner />);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Helpful (2)" }));
    expect(actions.voteReview).not.toHaveBeenCalled();
  });
});

describe("progressive review feed", () => {
  it("loads the next initial page with its exact filters, removes repeated reviews and stops on a short page", async () => {
    actions.loadMoreReviews.mockResolvedValue([review(20), review(21), review(22), review(22)]);
    const user = userEvent.setup();
    render(<ProgressiveReviewFeed initialReviews={firstPage} initialPage={3} professorId={professors[0].id} courseId={courses[0].id} sort="newest" />);
    await user.click(screen.getByRole("button", { name: "Load more reviews" }));
    await screen.findByText(review(22).body);
    expect(actions.loadMoreReviews).toHaveBeenCalledWith({ professorId: professors[0].id, courseId: courses[0].id, page: 4, sort: "newest" });
    expect(screen.getAllByRole("article")).toHaveLength(22);
    expect(screen.getAllByText(review(20).body)).toHaveLength(1);
    expect(screen.getAllByText(review(22).body)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more reviews" })).toBeNull();
  });

  it("keeps pagination available for a full page and advances on each successful request", async () => {
    actions.loadMoreReviews.mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => review(index + 21))).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<ProgressiveReviewFeed initialReviews={firstPage} initialPage={1} professorId={professors[0].id} sort="helpful" />);
    await user.click(screen.getByRole("button", { name: "Load more reviews" }));
    await screen.findByText("40 reviews displayed.");
    await user.click(screen.getByRole("button", { name: "Load more reviews" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more reviews" })).toBeNull());
    expect(actions.loadMoreReviews.mock.calls.map(call => call[0].page)).toEqual([2, 3]);
    expect(screen.getAllByRole("article")).toHaveLength(40);
  });

  it("retains reviews on an error and retries the same page", async () => {
    actions.loadMoreReviews.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce([review(21)]);
    const user = userEvent.setup();
    render(<ProgressiveReviewFeed initialReviews={firstPage} initialPage={1} courseId={courses[0].id} sort="helpful" />);
    await user.click(screen.getByRole("button", { name: "Load more reviews" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be loaded");
    expect(screen.getAllByRole("article")).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: "Load more reviews" }));
    await screen.findByText(review(21).body);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(actions.loadMoreReviews.mock.calls.map(call => call[0].page)).toEqual([2, 2]);
    expect(screen.getAllByRole("article")).toHaveLength(21);
  });

  it("does not request another page when the initial page is already short", () => {
    render(<ProgressiveReviewFeed initialReviews={[review(1)]} initialPage={1} sort="helpful" />);
    expect(screen.queryByRole("button", { name: "Load more reviews" })).toBeNull();
    expect(actions.loadMoreReviews).not.toHaveBeenCalled();
  });

  it("loads when the sentinel enters view and avoids overlapping observer requests", async () => {
    let intersect!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe = vi.fn(); disconnect = disconnect;
    });
    let resolvePage!: (reviews: Review[]) => void;
    actions.loadMoreReviews.mockImplementation(() => new Promise<Review[]>(resolve => { resolvePage = resolve; }));
    render(<ProgressiveReviewFeed initialReviews={firstPage} initialPage={1} sort="newest" />);
    act(() => {
      const entries = [{ isIntersecting: true }] as IntersectionObserverEntry[];
      intersect(entries, {} as IntersectionObserver);
      intersect(entries, {} as IntersectionObserver);
    });
    expect(actions.loadMoreReviews).toHaveBeenCalledTimes(1);
    await act(async () => { resolvePage([review(21)]); });
    expect(screen.getAllByRole("article")).toHaveLength(21);
    expect(disconnect).toHaveBeenCalled();
  });
});
