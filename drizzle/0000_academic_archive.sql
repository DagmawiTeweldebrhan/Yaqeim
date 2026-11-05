-- Canonical initial migration. Apply with Drizzle, never both Drizzle and Supabase CLI.
CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS private;
--> statement-breakpoint
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
--> statement-breakpoint

CREATE TABLE private.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  university_domain text NOT NULL DEFAULT 'nyu.edu'
    CHECK (university_domain = lower(university_domain) AND university_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);
--> statement-breakpoint
INSERT INTO private.settings DEFAULT VALUES;
--> statement-breakpoint
ALTER TABLE private.settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE TABLE public.users (
  id uuid PRIMARY KEY CONSTRAINT users_id_users_id_fk REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE TABLE public.professors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  department text NOT NULL DEFAULT 'Unspecified' CHECK (length(btrim(department)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX professors_name_unique ON public.professors (lower(btrim(full_name)));
--> statement-breakpoint
CREATE INDEX professors_full_name_idx ON public.professors (full_name);
--> statement-breakpoint
CREATE INDEX professors_name_trgm_idx ON public.professors USING gin (full_name extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX professors_search_idx ON public.professors USING gin (to_tsvector('english', full_name || ' ' || department));
--> statement-breakpoint

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 40),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  department text NOT NULL DEFAULT 'Unspecified' CHECK (length(btrim(department)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX courses_code_unique ON public.courses (lower(btrim(code)));
--> statement-breakpoint
CREATE INDEX courses_code_idx ON public.courses (code);
--> statement-breakpoint
CREATE INDEX courses_title_trgm_idx ON public.courses USING gin (title extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX courses_code_trgm_idx ON public.courses USING gin (code extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX courses_search_idx ON public.courses USING gin (to_tsvector('english', code || ' ' || title));
--> statement-breakpoint

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL CONSTRAINT reviews_professor_id_professors_id_fk REFERENCES public.professors(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL CONSTRAINT reviews_course_id_courses_id_fk REFERENCES public.courses(id) ON DELETE RESTRICT,
  user_id uuid CONSTRAINT reviews_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 20 AND 10000),
  overall_rating integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  workload_rating integer CHECK (workload_rating BETWEEN 1 AND 5),
  grading_difficulty integer CHECK (grading_difficulty BETWEEN 1 AND 5),
  tags text[] NOT NULL DEFAULT '{}' CHECK (
    tags <@ ARRAY['Heavy Workload','Light Workload','Reading Heavy','Easy A','Harsh Grader','Generous Curve','Lecture Heavy','Discussion Based','Accessible Office Hours','Self-Taught']::text[]
    AND cardinality(tags) <= 10 AND array_position(tags, NULL) IS NULL
  ),
  is_anonymous boolean NOT NULL DEFAULT true,
  imported boolean NOT NULL DEFAULT false,
  source_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_origin_check CHECK (
    (imported AND user_id IS NULL AND is_anonymous AND source_hash ~ '^[0-9a-f]{64}$' AND source_hash IS NOT NULL)
    OR (NOT imported AND user_id IS NOT NULL AND source_hash IS NULL AND workload_rating IS NOT NULL AND grading_difficulty IS NOT NULL)
  ),
  CONSTRAINT reviews_user_professor_course_unique UNIQUE (user_id, professor_id, course_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX reviews_source_hash_unique ON public.reviews(source_hash) WHERE source_hash IS NOT NULL;
--> statement-breakpoint
CREATE INDEX reviews_professor_created_idx ON public.reviews(professor_id, created_at DESC NULLS LAST, id);
--> statement-breakpoint
CREATE INDEX reviews_course_created_idx ON public.reviews(course_id, created_at DESC NULLS LAST, id);
--> statement-breakpoint
CREATE INDEX reviews_tags_idx ON public.reviews USING gin(tags);
--> statement-breakpoint
CREATE TABLE public.helpful_votes (
  user_id uuid NOT NULL CONSTRAINT helpful_votes_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE,
  review_id uuid NOT NULL CONSTRAINT helpful_votes_review_id_reviews_id_fk REFERENCES public.reviews(id) ON DELETE CASCADE,
  vote_type integer NOT NULL CHECK (vote_type IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT helpful_votes_user_id_review_id_pk PRIMARY KEY(user_id, review_id)
);
--> statement-breakpoint
CREATE INDEX helpful_votes_review_idx ON public.helpful_votes(review_id);
--> statement-breakpoint
CREATE TABLE private.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL CHECK (count > 0)
);
--> statement-breakpoint
ALTER TABLE private.rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Check authoritative Auth state, not user-editable metadata or a stale email claim.
CREATE FUNCTION private.is_student() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u CROSS JOIN private.settings s
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
      AND lower(split_part(u.email, '@', 2)) = s.university_domain
      AND u.email ~ '^[^@[:space:]]+@[^@[:space:]]+$'
      AND (u.banned_until IS NULL OR u.banned_until < now())
  );
$$;
--> statement-breakpoint
CREATE FUNCTION private.require_student() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_student() THEN
    RAISE EXCEPTION 'A verified university account is required.' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$$;
--> statement-breakpoint

-- This trigger also rejects disallowed users when the optional Auth hook is not enabled.
CREATE FUNCTION private.sync_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allowed_domain text;
BEGIN
  SELECT university_domain INTO allowed_domain FROM private.settings WHERE singleton;
  IF NEW.email IS NULL OR NEW.email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
     OR lower(split_part(NEW.email, '@', 2)) <> allowed_domain THEN
    RAISE EXCEPTION 'University email domain required.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.users(id, email, created_at, verified)
  VALUES (NEW.id, lower(NEW.email), COALESCE(NEW.created_at, now()), NEW.email_confirmed_at IS NOT NULL)
  ON CONFLICT(id) DO UPDATE SET email = EXCLUDED.email, verified = EXCLUDED.verified;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_sync AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.sync_user();
--> statement-breakpoint
INSERT INTO public.users(id, email, created_at, verified)
SELECT u.id, lower(u.email), COALESCE(u.created_at, now()), u.email_confirmed_at IS NOT NULL
FROM auth.users u CROSS JOIN private.settings s
WHERE lower(split_part(u.email, '@', 2)) = s.university_domain
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint

CREATE FUNCTION public.before_user_created(event jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE requested_email text := event->'user'->>'email'; allowed_domain text;
BEGIN
  SELECT university_domain INTO allowed_domain FROM private.settings WHERE singleton;
  IF requested_email IS NULL OR requested_email !~ '^[^@[:space:]]+@[^@[:space:]]+$'
    OR lower(split_part(requested_email, '@', 2)) <> allowed_domain THEN
    RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'A university email address is required.'));
  END IF;
  RETURN '{}'::jsonb;
END;
$$;
--> statement-breakpoint

-- Atomic counters survive serverless instances. Fixed windows are deliberately conservative.
CREATE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_count integer;
BEGIN
  IF p_key IS NULL OR p_limit IS NULL OR p_window_seconds IS NULL OR length(p_key) NOT BETWEEN 1 AND 200 OR p_limit NOT BETWEEN 1 AND 1000
     OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO private.rate_limits AS limits(key, window_start, count) VALUES(p_key, clock_timestamp(), 1)
  ON CONFLICT(key) DO UPDATE SET
    window_start = CASE WHEN limits.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds)
      THEN clock_timestamp() ELSE limits.window_start END,
    count = CASE WHEN limits.window_start <= clock_timestamp() - make_interval(secs => p_window_seconds)
      THEN 1 ELSE least(limits.count + 1, p_limit + 1) END
  RETURNING count INTO new_count;
  -- Bound storage for per-IP keys. Does not reset any live window.
  DELETE FROM private.rate_limits WHERE window_start < clock_timestamp() - interval '2 days';
  RETURN new_count <= p_limit;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION private.check_write_limit(p_action text, p_limit integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.consume_rate_limit(p_action || ':' || private.require_student()::text, p_limit, 3600) THEN
    RAISE EXCEPTION 'Too many requests. Please try again later.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;
--> statement-breakpoint

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.professors ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.helpful_votes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_own_read ON public.users FOR SELECT TO authenticated
USING (private.is_student() AND id = auth.uid());
--> statement-breakpoint
CREATE POLICY professors_student_read ON public.professors FOR SELECT TO authenticated USING (private.is_student());
--> statement-breakpoint
CREATE POLICY courses_student_read ON public.courses FOR SELECT TO authenticated USING (private.is_student());
--> statement-breakpoint
-- Other authors' raw rows are never exposed, even for authenticated API clients.
CREATE POLICY reviews_own_read ON public.reviews FOR SELECT TO authenticated
USING (private.is_student() AND user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY reviews_own_insert ON public.reviews FOR INSERT TO authenticated
WITH CHECK (private.is_student() AND user_id = auth.uid() AND NOT imported AND source_hash IS NULL);
--> statement-breakpoint
CREATE POLICY reviews_own_update ON public.reviews FOR UPDATE TO authenticated
USING (private.is_student() AND user_id = auth.uid() AND NOT imported)
WITH CHECK (private.is_student() AND user_id = auth.uid() AND NOT imported AND source_hash IS NULL);
--> statement-breakpoint
CREATE POLICY reviews_own_delete ON public.reviews FOR DELETE TO authenticated
USING (private.is_student() AND user_id = auth.uid() AND NOT imported);
--> statement-breakpoint
CREATE POLICY votes_own_read ON public.helpful_votes FOR SELECT TO authenticated
USING (private.is_student() AND user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY votes_own_insert ON public.helpful_votes FOR INSERT TO authenticated
WITH CHECK (private.is_student() AND user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY votes_own_update ON public.helpful_votes FOR UPDATE TO authenticated
USING (private.is_student() AND user_id = auth.uid()) WITH CHECK (private.is_student() AND user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY votes_own_delete ON public.helpful_votes FOR DELETE TO authenticated
USING (private.is_student() AND user_id = auth.uid());
--> statement-breakpoint

CREATE FUNCTION public.get_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_student();
  RETURN jsonb_build_object(
    'professors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'department',department) ORDER BY full_name) FROM public.professors), '[]'::jsonb),
    'courses', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'title',title,'department',department) ORDER BY code) FROM public.courses), '[]'::jsonb)
  );
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.search_catalog(p_query text DEFAULT '', p_tags text[] DEFAULT '{}', p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
RETURNS TABLE(professor_id uuid, professor_name text, department text, course_id uuid, course_code text,
  course_title text, review_count bigint, matching_reviews bigint, overall_rating numeric,
  workload_rating numeric, grading_difficulty numeric, confidence_score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET pg_trgm.similarity_threshold = 0.2 AS $$
DECLARE query_text text := btrim(COALESCE(p_query,'')); search_query tsquery; candidate_query tsquery;
BEGIN
  PERFORM private.require_student();
  IF p_limit IS NULL OR p_offset IS NULL OR length(query_text) > 200 OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 100000
    OR p_tags IS NULL OR cardinality(p_tags) > 10 THEN RAISE EXCEPTION 'Invalid search parameters.' USING ERRCODE='22023'; END IF;
  search_query := websearch_to_tsquery('english', query_text);
  candidate_query := replace(plainto_tsquery('english',query_text)::text, ' & ', ' | ')::tsquery;
  RETURN QUERY
  WITH candidate_professors AS (
    SELECT p.id FROM public.professors p WHERE query_text=''
      OR to_tsvector('english',p.full_name || ' ' || p.department) @@ candidate_query
      OR p.full_name ILIKE '%' || query_text || '%' OR p.full_name OPERATOR(extensions.%) query_text
  ), candidate_courses AS (
    SELECT c.id FROM public.courses c WHERE query_text=''
      OR to_tsvector('english',c.code || ' ' || c.title) @@ candidate_query
      OR c.title ILIKE '%' || query_text || '%' OR c.code ILIKE '%' || query_text || '%'
      OR c.title OPERATOR(extensions.%) query_text OR c.code OPERATOR(extensions.%) query_text
  ), matching_pairs AS (
    SELECT DISTINCT r.professor_id,r.course_id FROM public.reviews r WHERE r.tags @> p_tags
      AND (r.professor_id IN (SELECT id FROM candidate_professors) OR r.course_id IN (SELECT id FROM candidate_courses))
  ), pairs AS (
    SELECT r.professor_id, r.course_id, count(*) AS total,
      count(*) FILTER (WHERE r.tags @> p_tags) AS matching,
      round(avg(r.overall_rating),2) AS overall, round(avg(r.workload_rating),2) AS workload,
      round(avg(r.grading_difficulty),2) AS grading
    FROM public.reviews r JOIN matching_pairs m ON m.professor_id=r.professor_id AND m.course_id=r.course_id
    GROUP BY r.professor_id,r.course_id
    HAVING count(*) FILTER (WHERE r.tags @> p_tags) > 0
  ), ranked AS (
    SELECT p.id AS pid,p.full_name,p.department AS dept,c.id AS cid,c.code,c.title,
      x.total,x.matching,x.overall,x.workload,x.grading,
      -- A Wilson lower confidence bound rewards corroboration instead of a single perfect review.
      round(((x.matching::numeric/x.total + 3.8416/(2*x.total)
        - 1.96*sqrt((x.matching::numeric/x.total)*(1-x.matching::numeric/x.total)/x.total+3.8416/(4*x.total*x.total)))
        /(1+3.8416/x.total))*100,2) AS confidence,
      (ts_rank(setweight(to_tsvector('english',p.full_name),'A') || setweight(to_tsvector('english',c.code),'A')
        || setweight(to_tsvector('english',c.title),'B'),search_query)
        + greatest(extensions.similarity(p.full_name,query_text),extensions.similarity(c.title,query_text),extensions.similarity(c.code,query_text))) AS relevance
    FROM pairs x JOIN public.professors p ON p.id=x.professor_id JOIN public.courses c ON c.id=x.course_id
    WHERE query_text='' OR to_tsvector('english',p.full_name || ' ' || c.code || ' ' || c.title) @@ search_query
      OR strpos(lower(p.full_name || ' ' || c.code || ' ' || c.title),lower(query_text)) > 0
      OR greatest(extensions.similarity(p.full_name,query_text),extensions.similarity(c.title,query_text),extensions.similarity(c.code,query_text)) >= 0.2
  )
  SELECT pid,full_name,dept,cid,code,title,total,matching,overall,workload,grading,confidence
  FROM ranked ORDER BY CASE WHEN query_text<>'' THEN relevance ELSE 0 END DESC,
    CASE WHEN cardinality(p_tags)>0 THEN confidence ELSE 0 END DESC,overall DESC,total DESC,full_name,code
  LIMIT p_limit OFFSET p_offset;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.get_professor_stats(p_professor_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_student();
  SELECT jsonb_build_object('id',p.id,'full_name',p.full_name,'department',p.department,
    'review_count',count(r.id),'overall_rating',round(avg(r.overall_rating),2),
    'workload_rating',round(avg(r.workload_rating),2),'grading_difficulty',round(avg(r.grading_difficulty),2),
    'tag_counts',COALESCE((SELECT jsonb_agg(jsonb_build_object('tag',t.tag,'count',t.n,'percentage',t.percentage) ORDER BY t.n DESC,t.tag)
      FROM (SELECT tag,count(*) AS n,round(100.0*count(*)/NULLIF((SELECT count(*) FROM public.reviews z WHERE z.professor_id=p.id),0),1) AS percentage
        FROM public.reviews z CROSS JOIN LATERAL (SELECT DISTINCT unnest(z.tags) AS tag) tags
        WHERE z.professor_id=p.id GROUP BY tag) t),'[]'::jsonb)) INTO result
  FROM public.professors p LEFT JOIN public.reviews r ON r.professor_id=p.id
  WHERE p.id=p_professor_id GROUP BY p.id;
  RETURN result;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.get_course_comparisons(p_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.require_student();
  SELECT jsonb_build_object('course',jsonb_build_object('id',c.id,'code',c.code,'title',c.title,'department',c.department),
    'professors',COALESCE((SELECT jsonb_agg(stats ORDER BY (stats->>'overall_rating')::numeric DESC NULLS LAST, stats->>'full_name') FROM (
      SELECT jsonb_build_object('id',p.id,'full_name',p.full_name,'department',p.department,'review_count',count(r.id),
        'overall_rating',round(avg(r.overall_rating),2),'workload_rating',round(avg(r.workload_rating),2),
        'grading_difficulty',round(avg(r.grading_difficulty),2)) AS stats
      FROM public.reviews r JOIN public.professors p ON p.id=r.professor_id WHERE r.course_id=c.id GROUP BY p.id
    ) q),'[]'::jsonb)) INTO result FROM public.courses c WHERE c.id=p_course_id;
  RETURN result;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.get_reviews(p_professor_id uuid DEFAULT NULL,p_course_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,p_offset integer DEFAULT 0,p_sort text DEFAULT 'helpful')
RETURNS TABLE(id uuid,professor_id uuid,professor_name text,course_id uuid,course_code text,course_title text,
  body text,overall_rating integer,workload_rating integer,grading_difficulty integer,tags text[],
  created_at timestamptz,updated_at timestamptz,imported boolean,is_anonymous boolean,author_label text,
  is_owner boolean,helpful_count bigint,unhelpful_count bigint,my_vote integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid;
BEGIN
  viewer := private.require_student();
  IF p_limit IS NULL OR p_offset IS NULL OR p_sort IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 100000 OR p_sort NOT IN ('helpful','newest') THEN
    RAISE EXCEPTION 'Invalid pagination or sort.' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT r.id,r.professor_id,p.full_name,r.course_id,c.code,c.title,r.body,r.overall_rating,
    r.workload_rating,r.grading_difficulty,r.tags,r.created_at,r.updated_at,r.imported,r.is_anonymous,
    CASE WHEN r.imported THEN 'Archive import' WHEN r.is_anonymous THEN 'Anonymous student' ELSE split_part(u.email,'@',1) END,
    COALESCE(r.user_id=viewer,false),
    COALESCE(v.upvotes,0),COALESCE(v.downvotes,0),COALESCE(v.viewer_vote,0)
  FROM public.reviews r JOIN public.professors p ON p.id=r.professor_id JOIN public.courses c ON c.id=r.course_id
  LEFT JOIN public.users u ON u.id=r.user_id
  LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE hv.vote_type=1) AS upvotes,
    count(*) FILTER(WHERE hv.vote_type=-1) AS downvotes,max(hv.vote_type) FILTER(WHERE hv.user_id=viewer) AS viewer_vote
    FROM public.helpful_votes hv WHERE hv.review_id=r.id) v ON true
  WHERE (p_professor_id IS NULL OR r.professor_id=p_professor_id) AND (p_course_id IS NULL OR r.course_id=p_course_id)
  ORDER BY CASE WHEN p_sort='helpful' THEN COALESCE(v.upvotes-v.downvotes,0) ELSE 0 END DESC,r.created_at DESC,r.id
  LIMIT p_limit OFFSET p_offset;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.get_own_review(p_review_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid; result jsonb;
BEGIN
  viewer := private.require_student();
  SELECT jsonb_build_object('id',r.id,'professor_id',r.professor_id,'course_id',r.course_id,'body',r.body,
    'overall_rating',r.overall_rating,'workload_rating',r.workload_rating,'grading_difficulty',r.grading_difficulty,
    'tags',r.tags,'is_anonymous',r.is_anonymous) INTO result
  FROM public.reviews r WHERE r.id=p_review_id AND r.user_id=viewer AND NOT r.imported;
  RETURN result;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.get_my_reviews(p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,professor_id uuid,professor_name text,course_id uuid,course_code text,course_title text,
  body text,overall_rating integer,workload_rating integer,grading_difficulty integer,tags text[],
  created_at timestamptz,updated_at timestamptz,imported boolean,is_anonymous boolean,author_label text,
  is_owner boolean,helpful_count bigint,unhelpful_count bigint,my_vote integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid;
BEGIN
  viewer := private.require_student();
  IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Invalid pagination.' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT r.id,r.professor_id,p.full_name,r.course_id,c.code,c.title,r.body,r.overall_rating,
    r.workload_rating,r.grading_difficulty,r.tags,r.created_at,r.updated_at,r.imported,r.is_anonymous,
    CASE WHEN r.is_anonymous THEN 'Anonymous student' ELSE split_part(u.email,'@',1) END,
    true,COALESCE(v.upvotes,0),COALESCE(v.downvotes,0),COALESCE(v.viewer_vote,0)
  FROM public.reviews r JOIN public.professors p ON p.id=r.professor_id JOIN public.courses c ON c.id=r.course_id
  JOIN public.users u ON u.id=r.user_id
  LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE hv.vote_type=1) AS upvotes,
    count(*) FILTER(WHERE hv.vote_type=-1) AS downvotes,max(hv.vote_type) FILTER(WHERE hv.user_id=viewer) AS viewer_vote
    FROM public.helpful_votes hv WHERE hv.review_id=r.id) v ON true
  WHERE r.user_id=viewer ORDER BY r.created_at DESC,r.id LIMIT p_limit OFFSET p_offset;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.submit_review(p_professor_id uuid,p_course_id uuid,p_body text,p_overall_rating integer,
  p_workload_rating integer,p_grading_difficulty integer,p_tags text[],p_is_anonymous boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid; result uuid;
BEGIN
  viewer := private.require_student();
  PERFORM private.check_write_limit('review',10);
  INSERT INTO public.reviews(professor_id,course_id,user_id,body,overall_rating,workload_rating,grading_difficulty,tags,is_anonymous)
  VALUES(p_professor_id,p_course_id,viewer,btrim(p_body),p_overall_rating,p_workload_rating,p_grading_difficulty,
    ARRAY(SELECT DISTINCT unnest(p_tags) ORDER BY 1),p_is_anonymous) RETURNING id INTO result;
  RETURN result;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.update_review(p_review_id uuid,p_body text,p_overall_rating integer,
  p_workload_rating integer,p_grading_difficulty integer,p_tags text[],p_is_anonymous boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid; result uuid;
BEGIN
  viewer := private.require_student();
  PERFORM private.check_write_limit('review-edit',30);
  UPDATE public.reviews SET body=btrim(p_body),overall_rating=p_overall_rating,workload_rating=p_workload_rating,
    grading_difficulty=p_grading_difficulty,tags=ARRAY(SELECT DISTINCT unnest(p_tags) ORDER BY 1),is_anonymous=p_is_anonymous,updated_at=now()
  WHERE id=p_review_id AND user_id=viewer AND NOT imported RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Review not found or not owned by you.' USING ERRCODE='42501'; END IF;
  RETURN result;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.delete_review(p_review_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid;
BEGIN
  viewer := private.require_student();
  PERFORM private.check_write_limit('review-delete',30);
  DELETE FROM public.reviews WHERE id=p_review_id AND user_id=viewer AND NOT imported;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found or not owned by you.' USING ERRCODE='42501'; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.vote_review(p_review_id uuid,p_vote integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE viewer uuid;
BEGIN
  viewer := private.require_student();
  PERFORM private.check_write_limit('vote',120);
  IF p_vote IS NULL OR p_vote NOT IN(-1,0,1) THEN RAISE EXCEPTION 'Invalid vote.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.reviews r WHERE r.id=p_review_id AND r.user_id IS DISTINCT FROM viewer) THEN
    RAISE EXCEPTION 'You may only vote on another review.' USING ERRCODE='42501'; END IF;
  IF p_vote=0 THEN DELETE FROM public.helpful_votes WHERE user_id=viewer AND review_id=p_review_id;
  ELSE INSERT INTO public.helpful_votes(user_id,review_id,vote_type) VALUES(viewer,p_review_id,p_vote)
    ON CONFLICT(user_id,review_id) DO UPDATE SET vote_type=EXCLUDED.vote_type;
  END IF;
END;
$$;
--> statement-breakpoint

-- Mutation privileges only through validated procedures; RLS remains a second boundary.
REVOKE ALL ON public.users,public.professors,public.courses,public.reviews,public.helpful_votes FROM anon,authenticated;
--> statement-breakpoint
GRANT SELECT ON public.users,public.professors,public.courses,public.reviews,public.helpful_votes TO authenticated;
--> statement-breakpoint
GRANT ALL ON public.users,public.professors,public.courses,public.reviews,public.helpful_votes TO service_role;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.is_student() TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.before_user_created(jsonb) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.before_user_created(jsonb) TO supabase_auth_admin;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.consume_rate_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text,integer,integer) TO service_role;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_catalog(),public.search_catalog(text,text[],integer,integer),
  public.get_professor_stats(uuid),public.get_course_comparisons(uuid),public.get_reviews(uuid,uuid,integer,integer,text),
  public.get_own_review(uuid),public.get_my_reviews(integer,integer),public.submit_review(uuid,uuid,text,integer,integer,integer,text[],boolean),
  public.update_review(uuid,text,integer,integer,integer,text[],boolean),public.delete_review(uuid),public.vote_review(uuid,integer)
  FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_catalog(),public.search_catalog(text,text[],integer,integer),
  public.get_professor_stats(uuid),public.get_course_comparisons(uuid),public.get_reviews(uuid,uuid,integer,integer,text),
  public.get_own_review(uuid),public.get_my_reviews(integer,integer),public.submit_review(uuid,uuid,text,integer,integer,integer,text[],boolean),
  public.update_review(uuid,text,integer,integer,integer,text[],boolean),public.delete_review(uuid),public.vote_review(uuid,integer)
  TO authenticated;
--> statement-breakpoint
