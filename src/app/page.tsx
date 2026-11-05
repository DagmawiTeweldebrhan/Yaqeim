import Link from "next/link";
import { AccessForm } from "@/components/access-form";
import { first, type QueryParams } from "@/components/pagination";
import { isDemo, universityDomain } from "@/lib/config";

export default async function Home({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const message = first((await searchParams).message).slice(0, 300);
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
      <AccessForm domain={universityDomain} />
      {isDemo() && (
        <p>
          <Link href="/dashboard">Explore the sample archive</Link>
          <br />
          <span className="meta">
            A fictional preview of the archive. No account needed; nothing is saved.
          </span>
        </p>
      )}
      <p className="meta">
        Independent student perspectives. No official rankings, no promises of an easy grade.
      </p>
    </div>
  );
}
