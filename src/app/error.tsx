"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <><p className="section-label">A temporary interruption</p><h1>The archive could not be loaded.</h1><p>Your request could not be completed. Please try again in a moment.</p><p><button onClick={reset}>Try again</button></p><Link href="/">Return home</Link></>; }
