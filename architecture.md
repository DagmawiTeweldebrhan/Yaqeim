System Architecture and Engineering Documentation: NYUAD Course & Professor Analytics Platform
Phase 1: High-Level System Design & Philosophy
This platform serves as a centralized, data-driven application for NYUAD students to navigate course selections based on historical feedback and specific academic goals. The system bridges legacy unstructured data (scraped from the private Facebook group) with new, structured user-generated content.

Architectural Principles:

Decoupled Services: A strict separation between the data ingestion pipeline (Python-based scraping and NLP processing) and the user-facing application (Next.js).

Serverless First: Utilizing managed infrastructure (Supabase, Vercel) to minimize operational overhead while scaling automatically with student traffic spikes during course registration periods.

Design Language: 1. Design Philosophy: "The Academic Archive"
This document outlines the visual identity and user interface guidelines for the NYUAD Course & Professor Analytics Platform.

Moving away from modern brutalism or flashy web 3.0 trends, this platform adopts a "Refined Old-School" aesthetic. The goal is to evoke the feeling of a well-maintained academic wiki, an early 2000s bulletin board, or a university library directory. It should feel nostalgic, incredibly lightweight, text-first, and deeply functional.

Core Principles:

Hyper-Legibility: Text is the interface. Content takes precedence over chrome.

Classic Web Affordances: Links look like links (underlined, blue). Buttons look like standard, tactile UI elements.

Warm Minimalism: Instead of sterile white and gray, use soft, paper-like off-whites and warm grays to reduce eye strain during long reading sessions.

Zero Flash: No CSS animations, no sticky headers, no pop-up modals, no parallax scrolling. State changes are immediate.

2. Color Palette
The color system relies on classic web defaults softened for modern high-resolution displays. The palette leans into an "archival paper" feel, accented by a muted, academic violet (a nod to NYU).

Global Background: #F9F8F6 (Alabaster / Soft Parchment) - Used for the main <body> background.

Container Background: #FFFFFF (Pure White) - Used sparingly for search inputs or specific data tables to make them pop against the parchment.

Primary Text: #222222 (Soft Charcoal) - Used for all body copy and standard text. Avoid pure #000000 to reduce harsh contrast.

Secondary Text (Metadata): #666666 (Warm Gray) - Used for dates, timestamps, and subtle UI labels.

Primary Link (Unvisited): #0033CC (Classic Web Blue) - Must always be underlined.

Primary Link (Visited): #551A8B (Classic Visited Purple) - Crucial for helping users track which professors they have already viewed.

Accent / Brand Color: #57068C (NYU Violet) - Used strictly for active button states or highlighting a specific search match.

Borders & Dividers: #D1CDC7 (Light Ash) - Used for horizontal rules <hr> and thin container borders.

3. Typography System
The typography mixes a classic, authoritative Serif for headings with a highly legible, utilitarian Sans-Serif for data and UI elements.

Font Families:

Headings (H1, H2, H3): Georgia, fallback to Times New Roman, Serif.

Body & UI (Paragraphs, Inputs, Tags): Verdana, fallback to Tahoma, Sans-Serif. (These fonts were designed specifically for early-web screen legibility).

Data/Code (Course Codes, UUIDs): Courier New, Monospace.

Typographic Scale:

H1 (Page Titles): 28px, Georgia, Normal weight, #222222.

H2 (Section Headers): 22px, Georgia, Bold, #222222.

H3 (Professor/Course Names): 18px, Georgia, Bold, #0033CC (if linked).

Body Text: 14px, Verdana, 1.6 Line Height, #222222.

Small Text (Metadata): 12px, Verdana, #666666.

4. Layout and Grid Structure
The layout eschews edge-to-edge fluid design in favor of a comfortable, fixed-width reading column.

Max Width: The main content wrapper is strictly capped at 800px and centered on the screen. This mimics the narrow, readable columns of old web articles and Wikipedia.

Spacing: Use generous, consistent vertical spacing.

Margins between distinct sections: 32px.

Padding inside data tables/forms: 12px.

Navigation: A simple, top-aligned horizontal text menu. No hamburger menus, even on mobile. Just plain text links separated by a pipe character (e.g., Home | Search | Submit Review | Logout).

5. UI Components
Components should mimic native browser HTML elements but with slight polish for alignment and spacing.

Buttons:

Style: Rectangular, 2px border radius (just enough to take the sharp edge off).

Default State: Background #EAE8E3, Border 1px solid #BDBABB, Text #222222.

Hover/Active State: Background #E0DDDB, cursor changes to pointer.

Note: Buttons should look slightly raised, mimicking Windows 98/2000 UI or standard HTML <button> elements, avoiding the flat UI trend.

Input Fields & Textareas:

Style: Inset appearance. 1px solid #A9A9A9 border, #FFFFFF background.

Padding: 6px internal padding (slightly roomier than old-school defaults, but not oversized like modern mobile apps).

Focus State: Border changes to #0033CC, outlining the active input clearly without glowing shadows.

Dividers:

Use standard <hr> tags heavily to separate content blocks, reviews, and header from body.

Style: border-top: 1px solid #D1CDC7;, border-bottom: none;, margin: 24px 0;.

Tags (The Filtering System):

Instead of modern "pill" shaped tags, tags look like classic bracketed metadata or small square badges.

Style: [ Easy A ] or [ Heavy Workload ].

Font: 12px Verdana, #666666.

Interaction: When used as a filter toggle, selecting a tag changes its background to #EAE8E3 and makes the text #222222 bold.

6. Page-Level Specifications
The Landing / Login Page
Layout: Vertically and horizontally centered container.

Header: "NYUAD Course & Professor Analytics" in large Georgia serif.

Body: A brief, two-paragraph plain-text explanation of the site's purpose and exclusivity.

Auth Box: A simple HTML <form> containing one text input for the email and a standard gray submit button labeled "Request Access".

Footer: A small copyright notice and a link to terms of service, separated by an <hr>.

The Dashboard (Search & Discover)
Top Bar: Site title on the left, navigation links on the right.

Search Interface: A wide text input stretching 100% of the container width (800px). Below it, a set of native-looking HTML checkboxes for the quick filters (e.g., ☑ Easy A, ☐ Light Workload).

Results Feed: Rendered as a definition list (<dl>) or a basic table.

Row format: Course Code (Monospace) - Professor Name (Link) - Aggregate Rating (e.g., "Score: 8.5/10").

No cards, no drop shadows. Just lines of text separated by thin borders or zebra-striping (#FDFDFD alternating with #F9F8F6).

The Professor Profile Page
Header Profile:

H1: Professor Name.

Subtitle: Department Name, Total Reviews Count.

Data Box: A simple HTML <table> with visible borders (border="1" style) showing the aggregated averages (Overall, Workload, Grading).

Review Feed:

Reviews are stacked vertically.

Each review block starts with metadata: Date: YYYY-MM-DD | Course: [Course Code].

The review body is plain text, indented slightly.

Tags applied to that specific review sit at the bottom of the text block in smaller font.

Separated by <hr> tags.

Submit a Review Page
Form Structure: A strictly top-to-bottom layout. Labels are placed directly above their inputs (bolded).

Select Menus: Standard browser <select> dropdowns for choosing Professor and Course.

Sliders/Ratings: Use standard HTML5 <input type="range"> sliders or classic radio button groups ((1) (2) (3) (4) (5)) for numerical ratings.

Text Area: A large, unstyled <textarea> that allows for resizing at the bottom right corner.

Submission: A single submit button at the bottom. Upon success, a classic plain-text green confirmation message appears above the form: Success: Your review has been recorded.

Phase 2: Infrastructure and Technology Stack
The stack is optimized for rapid iteration, strict type safety, and seamless relational data management.

Frontend Framework: Next.js (App Router) leveraging server-side rendering for optimal performance and SEO.

Language: TypeScript across the entire web stack for end-to-end type safety.

Styling: Tailwind CSS, configured with a custom strict-dark theme and disabled border-radius utilities to enforce the brutalist aesthetic.

Backend & Database: Supabase (managed PostgreSQL) serving as the primary relational database, authentication provider, and Row Level Security (RLS) enforcement layer.

ORM: Drizzle ORM for type-safe database queries and schema migrations.

Data Ingestion Pipeline: Python, orchestrated locally or via Docker containers, utilizing Selenium for DOM interaction and an LLM API (e.g., Gemini) for unstructured data structuring.

Hosting & CI/CD: Frontend deployed on Vercel with automated GitHub integration for seamless deployment pipelines.

Phase 3: The Data Pipeline & Ingestion Strategy
The ingestion pipeline transforms unstructured, conversational posts from the Room of Requirement into a highly structured PostgreSQL database.

Step 1: Authenticated Scraping
A headless Python Selenium script runs locally, utilizing active session cookie injection to bypass login portals and mimic legitimate browser behavior. The script targets the specific Facebook group search URL for professors, infinitely scrolls to capture historical data, and extracts the raw text from post containers.

Step 2: Natural Language Processing & Structuring
The raw text strings are piped into an LLM processing script. The LLM is strictly prompted to return structured JSON containing specific keys: Professor Name, Course Name, Sentiment Score (1-10), and Tags.

Step 3: Taxonomy & Tagging Standardization
The LLM categorizes the unstructured text into predefined, rigid tags that power the frontend recommendation engine. Standardized tags include:

Workload: "Heavy Workload", "Light Workload", "Reading Heavy"

Grading: "Easy A", "Harsh Grader", "Generous Curve"

Teaching Style: "Lecture Heavy", "Discussion Based", "Accessible Office Hours", "Self-Taught"

Step 4: Database Seeding
The Python script connects to the Supabase PostgreSQL instance and performs batch inserts. It normalizes the data, ensuring professors and courses are created in their respective tables if they do not exist, and links the structured review to them via foreign keys. These legacy reviews are flagged with an "imported" boolean to distinguish them from native platform reviews.

Phase 4: Database Schema and Entity Relationships
The relational model is designed in 3rd Normal Form to prevent data anomalies and ensure fast query execution for the filtering engine.

Table 1: Users

Primary Key: UUID (handled by Supabase Auth)

Fields: Email address, Account Creation Timestamp, Verification Status.

Constraints: Must end in the designated university email domain.

Table 2: Professors

Primary Key: UUID

Fields: Full Name, Department Name, Average Rating (computed column or updated via triggers).

Indexes: B-Tree index on Full Name for rapid search.

Table 3: Courses

Primary Key: UUID

Fields: Course Code (e.g., CS-UH 1001), Course Title, Department.

Indexes: B-Tree index on Course Code.

Table 4: Reviews

Primary Key: UUID

Foreign Keys: Professor UUID, Course UUID, User UUID (nullable for imported legacy data).

Fields: Review Body Text, Overall Rating (Integer 1-5), Workload Rating (Integer 1-5), Grading Difficulty (Integer 1-5), Array of Standardized Tags, Creation Timestamp, Imported Flag (Boolean).

Table 5: Upvotes/Helpful Votes

Primary Key: Composite (User UUID, Review UUID)

Fields: Vote Type (Up/Down).

Purpose: Crowdsources quality control, surfacing the most accurate reviews to the top of the feed.

Phase 5: Authentication, Authorization, and Security Architecture
Security is enforced at the database level to ensure data integrity even if the frontend is compromised.

Authentication Flow
Authentication is handled entirely via Supabase Auth using Magic Links or Google OAuth restricted exclusively to university email domains. This guarantees that only active students can view the data or submit new reviews, maintaining the privacy expected from the original Facebook group.

Row Level Security (RLS)
PostgreSQL RLS policies are applied to every table:

Read Access: Granted to any authenticated user holding a valid JWT. Unauthenticated users receive a 403 Forbidden error.

Insert Access (Reviews): Granted to authenticated users. The User UUID in the insert payload must strictly match the UUID inside the user's JWT.

Update/Delete Access: Users can only modify or delete rows in the Reviews table where their UUID matches the author's UUID.

Admin Access: A designated database role bypasses standard RLS for managing tags, merging duplicate professor profiles, and running the ingestion pipeline.

Application Security

Rate Limiting: Implemented via Next.js middleware to prevent API abuse and automated spamming of new reviews.

Input Sanitization: Drizzle ORM inherently protects against SQL injection through parameterized queries. The frontend sanitizes all markdown/text inputs to prevent Cross-Site Scripting (XSS).

Anonymity Layer: While reviews are tied to a User UUID in the database for accountability and rate limiting, the UI features a "Post Anonymously" toggle. When active, the frontend redacts the author's identity, but the backend retains the relationship to prevent multiple anonymous reviews from the same user on the same course.

Phase 6: Frontend Architecture and User Interface
The frontend architecture maps directly to the brutalist design philosophy: functional, fast, and highly legible.

Application Routing (Next.js App Router)

/ - The Landing Page (Authentication gate).

/dashboard - The central hub, recommendation engine, and global feed.

/professors/[id] - Dynamic route detailing a specific professor, their aggregated stats, and all associated reviews.

/courses/[id] - Dynamic route detailing a specific course, historically taught by various professors, allowing side-by-side comparison.

/submit - The review submission form.

State Management & Data Fetching
Server Components are utilized for the heavy lifting: fetching professor profiles, aggregating statistics, and initial page loads. Client Components are reserved strictly for interactive elements: search bars, filter toggles, and infinite scrolling feeds.

Brutalist Design System Specifications

Color Palette: Pitch black background (#000000), stark white text (#FFFFFF), and an accent color (e.g., a harsh neon green or industrial yellow) used exclusively for active states and primary buttons.

Typography: A single monospace or highly legible sans-serif typeface (like Inter or Roboto Mono) used consistently across all weights.

Component Architecture: Cards, inputs, and modals have border-radius: 0. Borders are solid, thick, and high-contrast (e.g., border-2 border-white). Shadows, if used, are hard-edged (box-shadow: 4px 4px 0px white) rather than soft blurs.

Phase 7: Core Features and Application Workflows
Workflow 1: Onboarding and Landing
The user arrives at a stark landing page explaining the platform's value proposition. The only interactive element is a domain-restricted login input. Upon submitting their email, they receive a secure magic link. Clicking the link provisions a session and redirects them to the Dashboard.

Workflow 2: The Recommendation Engine (The "Easy A" Finder)
The Dashboard features a prominent, multi-select tagging interface. A user can select a specific intent, such as "Need an Easy A" and "Less Workload".

The frontend translates this intent into an array of required tags.

The backend queries the Reviews table, filtering for entries that contain the exact intersection of these tags.

The results are grouped by Professor and Course, calculating an aggregate confidence score based on the volume of reviews mentioning those specific traits.

The UI renders a ranked list: "Top Professors for Low Workload / High Grades."

Workflow 3: Search and Discovery
A global search bar allows students to query by Course Name, Course Code, or Professor Name. The search utilizes PostgreSQL's full-text search capabilities (via Drizzle) to return instantaneous, weighted results, handling typos and partial matches.

Workflow 4: Review Submission
Users navigate to the /submit route. They select a Professor and Course from autocomplete dropdowns. They input their textual review, rate the core metrics via numerical sliders, and select applicable tags from a predefined brutalist checkbox grid. They toggle their desired anonymity state and submit. The UI optimistically updates while the backend validates and inserts the record.

Phase 8: Internal API Design & Data Access Methods
While Next.js Server Actions blur the line between frontend and backend, the data access layer maintains strict procedural methods.

Method: getAggregatedProfessorStats(professorId)
Calculates the mean overall rating, workload rating, and grading difficulty for a single professor across all courses. It also groups and counts the frequency of tags applied to this professor to determine their "defining traits" (e.g., identifying that 80% of reviews tag them as "Harsh Grader").

Method: getCourseComparisons(courseId)
Fetches all professors who have ever taught a specific course, grouping their reviews side-by-side. This powers a specific UI view allowing a student to directly compare Professor X vs. Professor Y for "Data Structures."

Method: submitNewReview(payload)
Accepts the validated form payload. Verifies the user's authentication token. Checks the database to ensure the user has not already reviewed this exact Professor/Course combination. Inserts the record and triggers a background recalculation of the professor's aggregate statistics.

Phase 9: Deployment, Scaling, and Maintenance
Hosting Environments

Production: Vercel handles the Next.js edge functions and static asset delivery. Supabase hosts the production database in a region geographically closest to the user base (e.g., Middle East/UAE regions) to minimize latency.

Staging: A mirrored environment linked to a separate staging database for testing schema migrations and UI updates before merging to the main branch.

Database Migrations
Database schema changes (adding new tag categories, altering table structures) are managed through Drizzle Kit. Migrations are generated locally as SQL files, reviewed, and pushed to the Supabase instance via CI/CD pipelines, ensuring zero downtime and preventing data loss.

Maintenance of the Ingestion Pipeline
The Python scraping script is maintained separately from the web application. It is executed periodically (e.g., at the end of every semester) by a designated administrator to capture any new posts made in the legacy Facebook group, funneling the fresh data through the LLM categorization tool and appending it to the production database.