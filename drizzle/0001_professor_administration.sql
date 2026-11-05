-- Admin-only duplicate reconciliation. Authors, votes, source hashes and dates
-- stay attached to the original review; no review is silently discarded.
CREATE FUNCTION public.merge_professors(p_source_id uuid, p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE locked_count integer; moved_count integer;
BEGIN
  IF p_source_id IS NULL OR p_target_id IS NULL OR p_source_id=p_target_id THEN
    RAISE EXCEPTION 'Choose two different professor profiles.' USING ERRCODE='22023';
  END IF;
  -- Stable lock order avoids competing merges deadlocking. FOR UPDATE also
  -- blocks new reviews acquiring an FK key-share lock until this merge commits.
  PERFORM id FROM public.professors WHERE id IN (p_source_id,p_target_id) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS locked_count = ROW_COUNT;
  IF locked_count <> 2 THEN
    RAISE EXCEPTION 'Both professor profiles must exist.' USING ERRCODE='P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.reviews source_review JOIN public.reviews target_review
      ON source_review.user_id=target_review.user_id AND source_review.course_id=target_review.course_id
    WHERE source_review.professor_id=p_source_id AND target_review.professor_id=p_target_id
  ) THEN
    RAISE EXCEPTION 'Cannot merge: a student reviewed both professors for the same course. Resolve the conflicting reviews before retrying.' USING ERRCODE='23505';
  END IF;
  UPDATE public.reviews SET professor_id=p_target_id WHERE professor_id=p_source_id;
  GET DIAGNOSTICS moved_count = ROW_COUNT;
  DELETE FROM public.professors WHERE id=p_source_id;
  RETURN jsonb_build_object('source_id',p_source_id,'target_id',p_target_id,'reviews_moved',moved_count);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.merge_professors(uuid,uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.merge_professors(uuid,uuid) TO service_role;
