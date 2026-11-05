# Database administration

Use the project database administrator or a server-side Supabase client configured with the service-role key. Never expose that key in a browser. The `service_role` role can administer application tables; students have read access under RLS and use guarded mutation RPCs.

## Merge duplicate professors

Review both profiles first and choose the profile whose name and department should remain. Then call:

```sql
select public.merge_professors(
  'SOURCE-PROFESSOR-UUID'::uuid,
  'TARGET-PROFESSOR-UUID'::uuid
);
```

The operation moves reviews to the target and deletes the source profile atomically. Review IDs, authors, votes, archive hashes and dates remain unchanged. Live statistics immediately include the moved reviews. The source profile URL will no longer exist. The result reports `reviews_moved`.

If the same student reviewed both profiles for the same course, the entire merge fails without changing either profile or any review. Resolve the conflicting records with the review author before retrying; do not silently remove a review. Missing IDs and merging a profile into itself also fail. Only database administrators and `service_role` can execute this RPC.

## Maintain the taxonomy

The ten tags in the architecture are deliberately fixed and enforced with the `reviews_tags_check` database constraint. To add, rename or retire a tag, update the web taxonomy, Python pipeline taxonomy, Drizzle schema constraint and tests together. Generate and review a new migration with `npm run db:generate`; include an explicit transactional data migration when renaming or retiring an existing tag. Apply it to staging before production. Do not edit an already deployed migration or disable the constraint to accept arbitrary LLM output.

## University domain

The private settings row defines the authoritative exact domain, initially `nyu.edu`:

```sql
update private.settings set university_domain = 'nyu.edu' where singleton;
```

Keep this value aligned with the application's `UNIVERSITY_EMAIL_DOMAIN`. Changing the domain immediately denies old-domain accounts access even if their JWT has not expired. Email verification establishes control of a university mailbox; it does not verify current enrollment.

## Migration ownership

`drizzle/` is the single migration source. Apply it through `npm run db:migrate`; do not also apply the same SQL through a second migration system. Table snapshots support subsequent Drizzle generation. Functions, grants, triggers and policies live in reviewed custom SQL migrations and must be preserved when changing the schema. `npm run test:db` runs every migration against PostgreSQL and checks application privileges, RLS, privacy and business rules.
