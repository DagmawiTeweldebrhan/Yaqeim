import Link from "next/link";
import { AccessForm } from "@/components/access-form";
import { first, type QueryParams } from "@/components/pagination";
import { hasSupabase, isDemo, universityDomain } from "@/lib/config";

export default async function Home({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const message = first((await searchParams).message).slice(0, 300);
  const demo = isDemo();
  return (
    <div className="landing">
      <p className="section-label">An academic archive, built on shared experience</p>
      <h1>NYUAD Course &amp; Professor Analytics</h1>
      <p className="intro">
        Good course choices begin with a little perspective. Yaqeim brings student experiences
        together in a quiet, searchable archive: what a class asks of you, how a professor teaches,
        and what others wish they had known.
      </p>
      <p>
        Read across courses, compare professors, and add your own experience for the students who
        come after you. The live archive is restricted to verified{" "}
        <strong>@{universityDomain}</strong> accounts so that community feedback stays within the
        university.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {demo ? (
        <section className="access-form" aria-labelledby="sample-access-title">
          <h2 id="sample-access-title">No sign-in needed</h2>
          <p>
            You’re viewing the sample archive. Explore fictional courses and reviews without
            entering an email address. Reviews and votes are not saved in this preview.
          </p>
          <Link href="/dashboard">Explore the sample archive</Link>
        </section>
      ) : hasSupabase() ? (
        <AccessForm domain={universityDomain} />
      ) : (
        <p className="notice" role="status">
          Sign-in is temporarily unavailable. Please try again later.
        </p>
      )}
      <p className="meta">
        Independent student perspectives. No official rankings, no promises of an easy grade.
      </p>
    </div>
  );
}
