import Link from "next/link";
export default function NotFound() { return <><p className="section-label">Record unavailable</p><h1>This page could not be found.</h1><p>The record may have been removed, or this address may be incomplete.</p><p><Link href="/dashboard">Return to the archive →</Link></p></>; }
