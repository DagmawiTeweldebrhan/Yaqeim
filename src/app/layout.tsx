import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { isDemo } from "@/lib/config";
import { logout } from "./actions";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { default: "Yaqeim · NYUAD Course & Professor Analytics", template: "%s · Yaqeim" },
  description: "A private academic archive of course experiences, professor feedback, and student perspectives for the NYU community.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = isDemo();
  const user = await currentUser();
  return <html lang="en"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="archive-shell">
      <header className="site-header">
        <div><Link className="wordmark" href="/">Yaqeim<span aria-hidden="true">.</span></Link><p className="eyebrow">NYUAD · Student archive</p></div>
        <nav aria-label="Main navigation"><Link href="/">Home</Link><span aria-hidden="true"> | </span><Link href="/dashboard">Search</Link><span aria-hidden="true"> | </span><Link href="/submit">Submit Review</Link>{(user || demo) && <><span aria-hidden="true"> | </span><Link href="/reviews">My reviews</Link><span aria-hidden="true"> | </span><form className="inline-logout" action={logout}><button className="link-button">Logout</button></form></>}</nav>
      </header>
      {demo && <aside className="demo-notice" aria-label="Sample archive notice"><strong>Sample archive.</strong> Every person, course experience, and review shown here is fictional. Changes are not saved.</aside>}
      <main id="main-content">{children}</main>
      <footer className="site-footer"><hr /><div className="footer-line"><p>© {new Date().getUTCFullYear()} Yaqeim. An independent student project.</p><Link href="/terms">Terms & privacy</Link></div><p>Made for thoughtful course choices. Not affiliated with or endorsed by New York University.</p></footer>
    </div>
  </body></html>;
}
