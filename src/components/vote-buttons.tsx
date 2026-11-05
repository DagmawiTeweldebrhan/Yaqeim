"use client";
import { useActionState, useState } from "react";
import { voteReview } from "@/app/actions";
import type { ActionState } from "@/lib/types";
export function VoteButtons({ id, currentVote, helpful, unhelpful, owner }: { id: string; currentVote: number; helpful: number; unhelpful: number; owner: boolean }) {
  const [counts, setCounts] = useState({ vote: currentVote, helpful, unhelpful });
  const [lastProps, setLastProps] = useState({ currentVote, helpful, unhelpful });
  if (lastProps.currentVote !== currentVote || lastProps.helpful !== helpful || lastProps.unhelpful !== unhelpful) {
    setLastProps({ currentVote, helpful, unhelpful }); setCounts({ vote: currentVote, helpful, unhelpful });
  }
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData) => {
    const requested = Number(form.get("vote"));
    const next = counts.vote === requested ? 0 : requested;
    const result = await voteReview(id, next, previous);
    if (result.status === "success") setCounts(c => ({ vote: next, helpful: c.helpful - Number(c.vote === 1) + Number(next === 1), unhelpful: c.unhelpful - Number(c.vote === -1) + Number(next === -1) }));
    return result;
  }, { status: "idle", message: "" } as ActionState);
  return <div className="vote-area"><form action={action} className="vote-line"><span className="meta">Was this helpful?</span><button name="vote" value="1" className="small-button" aria-pressed={counts.vote === 1} disabled={pending || owner}>Helpful ({counts.helpful})</button><button name="vote" value="-1" className="small-button" aria-pressed={counts.vote === -1} disabled={pending || owner}>Not helpful ({counts.unhelpful})</button></form>{state.message && <p className="meta" role="status">{state.message}</p>}</div>;
}
