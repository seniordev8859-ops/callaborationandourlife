// In-app help: a step-by-step guide for every page, per role.
// Shown on /help and in the "?" panel (components/HelpButton.tsx), which picks the guide matching the current page.

export type HelpRole = "bidder" | "caller" | "user" | "admin";
/** `image`: screenshot for the step (public/help). Page steps default to /help/<page id>-<step number>.webp. */
export type HelpStep = { title: string; detail: string; image?: string };
export type HelpPage = {
  id: string;
  title: string;
  /** Page the guide is about (link target). */
  path: string;
  /** Path prefixes this guide covers (longest match wins). */
  match: string[];
  roles: HelpRole[];
  summary: string;
  steps: HelpStep[];
  tips?: string[];
  /** Menu name for roles that see the page under a different label. */
  titleFor?: Partial<Record<HelpRole, string>>;
};

export const ROLE_TITLE: Record<HelpRole, string> = { bidder: "Bidder", caller: "Caller", user: "User (profile manager)", admin: "Admin" };
export const ROLE_INTRO: Record<HelpRole, string> = {
  bidder: "You generate tailored resumes for full-time roles from job URLs, then submit each application and log the proof.",
  caller: "You schedule and conduct interviews for the profiles assigned to you, then report each result.",
  user: "You manage the candidate profiles assigned to you: their bidders, callers, applications and interviews.",
  admin: "You run TailorBid: accounts, profiles, assignments, API keys, settings, notifications and the activity log.",
};

/** The first things to do, per role. */
export const GETTING_STARTED: Record<HelpRole, HelpStep[]> = {
  bidder: [
    { title: "Sign in and set your password", detail: "Use the email and temporary password from your invitation, then open My Page and choose your own password.", image: "/help/my-page-4.webp" },
    { title: "Check your profiles", detail: "Open View Profile's Information to see the candidate details you will use when filling in application forms.", image: "/help/my-profiles-1.webp" },
    { title: "Generate resumes", detail: "Open Generate Resume, choose a profile, paste the job URLs (one per line) and click Generate resume.", image: "/help/import-2.webp" },
    { title: "Download and apply", detail: "Open View Generated Resumes, download the resume, cover letter and job description, and apply on the company's site.", image: "/help/my-applications-5.webp" },
    { title: "Submit", detail: "Upload a screenshot of the confirmation page and click Submit.", image: "/help/application-detail-3.webp" },
  ],
  caller: [
    { title: "Sign in and set your password", detail: "Use the email and temporary password from your invitation, then choose your own password on My Page.", image: "/help/my-page-4.webp" },
    { title: "Set your reminders", detail: "On My Page, choose how early you want a reminder before each interview and when to get tomorrow's schedule. Set your own time zone there too: your calendar, emails and reminders use it.", image: "/help/my-page-3.webp" },
    { title: "Answer requests quickly", detail: "Interview requests arrive by email and on Interview Requests. Schedule each one before its deadline (3 hours by default).", image: "/help/caller-requests-1.webp" },
    { title: "Prepare with the materials", detail: "Each request includes the resume, job description and job posting the bidder used. Download them before the interview.", image: "/help/caller-requests-2.webp" },
    { title: "Report every result", detail: "After the interview, report the result, the recorded video URL, the interviewer's name and caller ID, and your feedback. Follow-up steps for the same role come back to you.", image: "/help/caller-requests-6.webp" },
  ],
  user: [
    { title: "Sign in and set your password", detail: "Use your invitation details, then choose your own password on My Page.", image: "/help/my-page-4.webp" },
    { title: "Review your profiles", detail: "Open Profiles to check the candidate profiles you manage and keep them up to date.", image: "/help/admin-profiles-5.webp" },
    { title: "Assign bidders and callers", detail: "Open Assignments and choose which bidders generate with each profile and which callers handle its interviews.", image: "/help/admin-assignments-1.webp" },
    { title: "Follow the work", detail: "Use Application History and Interviews to follow applications, submissions and interview schedules for your profiles.", image: "/help/admin-applications-1.webp" },
  ],
  admin: [
    { title: "Add an OpenAI key", detail: "Open API Keys, add a key and make it the default so applications can be generated.", image: "/help/admin-keys-1.webp" },
    { title: "Configure the site", detail: "Open Settings: fees, the resume prompt, the daily report time zone (EST), milestones, cooldown and interview deadline.", image: "/help/admin-settings-1.webp" },
    { title: "Create profiles", detail: "Open Profiles and add each candidate profile (you can import it from a resume with AI).", image: "/help/admin-profiles-1.webp" },
    { title: "Invite people", detail: "Open Users & Bidders and add bidders, callers, users and admins. They receive an invitation email.", image: "/help/admin-users-2.webp" },
    { title: "Assign profiles", detail: "Open Assignments and link each profile to its managers, bidders and callers.", image: "/help/admin-assignments-1.webp" },
    { title: "Monitor", detail: "Use Overview, Application History, Interviews, Feedback and Logs to follow everything that happens.", image: "/help/admin-interviews-1.webp" },
  ],
};

const ALL: HelpRole[] = ["bidder", "caller", "user", "admin"];
const WORKSPACE: HelpRole[] = ["bidder", "user", "admin"];
/** Workspace pages hidden from bidders (proxy.ts sends them to Generate Resume). */
const STAFF_WORKSPACE: HelpRole[] = ["user", "admin"];
const NOT_BIDDER: HelpRole[] = ["caller", "user", "admin"];
const STAFF: HelpRole[] = ["user", "admin"];

export const HELP_PAGES: HelpPage[] = [
  /* ------------------------------------------------------------ bidder workspace */
  {
    id: "overview",
    title: "Overview",
    path: "/overview",
    match: ["/overview"],
    roles: STAFF_WORKSPACE,
    summary: "Your bids and interviews at a glance: this week and this month compared with the previous ones, with a chart and a table.",
    steps: [
      { title: "Read the two summary cards", detail: "This week and This month show resumes created, applications submitted and initial interviews, with the change from the previous period." },
      { title: "Switch Weekly / Monthly", detail: "Use the toggle above the chart to see the last 8 weeks or the last 6 months." },
      { title: "Hover a bar", detail: "Each bar shows its exact value; the current period is highlighted." },
      { title: "Check the rates in the table", detail: "Submission rate = submitted ÷ created; interview rate = initial interviews ÷ submitted. The last row is your all-time total." },
    ],
    tips: ["Only initial interviews (step 1) are counted, not follow-up steps.", "Weeks start on Monday (GMT-04:00)."],
  },
  {
    id: "generate",
    title: "Generate an application",
    path: "/dashboard",
    match: ["/dashboard"],
    roles: STAFF_WORKSPACE,
    summary: "Create a tailored resume, cover letter and job description from a full-time job posting.",
    steps: [
      { title: "Choose the profile", detail: "Pick the candidate profile to apply with. The remaining monthly quota is shown under it." },
      { title: "Paste the job URL", detail: "Paste the link to the job posting (Greenhouse, Lever, Workday, company sites…) and click Generate resume, cover letter & JD." },
      { title: "If the page can't be read", detail: "Some sites block reading. The attempt is saved as Not-generated and its page opens: paste the job description there to generate it." },
      { title: "Download the ZIP", detail: "When it's ready you're taken to the application. Download the ZIP: resume (PDF + DOCX), cover letter (PDF + DOCX) and job description (DOCX)." },
    ],
    tips: [
      "The same company can't be applied to again with the same profile within the cooldown (30 days by default). A blocked bid is refused on screen with the date it becomes allowed.",
      "Generating is free; the fee is charged only when you submit.",
    ],
  },
  {
    id: "import",
    title: "Generate Resume",
    path: "/dashboard/import",
    match: ["/dashboard/import"],
    roles: WORKSPACE,
    summary: "Paste job posting URLs and get a tailored resume, cover letter and job description for each.",
    steps: [
      { title: "Choose the profile", detail: "Every resume in the batch is tailored with the selected profile. The remaining monthly quota is shown under it." },
      { title: "Paste the job URLs", detail: "Paste the links to the job postings in the Job URLs box, one per line. The box shows how many URLs it found." },
      { title: "Click Generate resumes", detail: "The button shows how many URLs will run. The links are loaded and generation starts right away, two at a time. Keep the page open; you can pause, resume or cancel." },
      { title: "Check each row", detail: "Rows end as generated, not-generated (job page unreadable or AI step failed), already generated, blocked (same company within the cooldown) or failed." },
      { title: "Retry or fix", detail: "Use Retry for failed / not-generated rows, or open a not-generated one to paste its job description." },
      { title: "Submit them later", detail: "Generated resumes appear in View Generated Resumes, ready to download, apply and submit." },
    ],
    tips: ["Up to 200 links per batch; duplicates are removed automatically.", "Generating is free; the fee is charged only when you submit.", "If a job page can't be read, it's saved as Not generated and waits for you to paste the description. When too many are waiting (100 by default, set per bidder by an admin or profile manager), generating from URLs pauses until you handle them."],
  },
  {
    id: "my-applications",
    title: "View Generated Resumes",
    path: "/applications",
    match: ["/applications"],
    roles: WORKSPACE,
    summary: "Every resume you generated: download the documents, upload proof of submission, submit and track fees.",
    steps: [
      { title: "Filter the list", detail: "Use the date range (YYYY-MM-DD), status, profile and search. Unread applications have a blue dot." },
      { title: "Upload the confirmation screenshot", detail: "After applying on the company site, click Upload (or drag / paste with Ctrl+V) to attach a screenshot of the confirmation page." },
      { title: "Click Submit", detail: "Submit becomes available once a screenshot is attached. The fee is charged at this moment." },
      { title: "Add a missing company or role", detail: "If a row shows Unknown company or Untitled role, click it and fill in what's missing (check the job posting). It can't be submitted until both are set; once set, they can't be changed." },
      { title: "Download documents", detail: "Use ZIP or Resume PDF on a row, or tick several rows and use Download ZIP / Resumes only above the table. If nothing is ticked it tells you no resumes are selected." },
      { title: "Customize columns", detail: "Use Columns to show or hide table columns; your choice is remembered." },
      { title: "Check payment status", detail: "The Other column shows whether each submitted application's fee is Paid or Not paid." },
    ],
    tips: ["Paid applications can't be deleted or un-submitted.", "Bidders can't delete applications; ask an admin if one should be removed.", "Click a company or role to open the application's full details."],
  },
  {
    id: "application-detail",
    title: "Application details",
    path: "/applications",
    match: ["/applications/"],
    roles: WORKSPACE,
    summary: "One application: the tailored resume preview, cover letter, job description, screenshots and submission.",
    steps: [
      { title: "Review the documents", detail: "Read the resume preview and cover letter; download the ZIP when you're ready to apply." },
      { title: "Open the job posting", detail: "Use the posting link to apply on the company's site." },
      { title: "Attach screenshots", detail: "Upload, drag or paste (Ctrl+V) the confirmation screenshot. Click a thumbnail to view it full size." },
      { title: "Submit", detail: "Click Submit to log the submission. Removing the last screenshot un-submits it (unless it's already paid)." },
      { title: "Not-generated applications", detail: "Paste the job description (or try the URL again) and click Generate to create the documents." },
    ],
  },
  {
    id: "interview-requests",
    title: "Interview Requests",
    path: "/interviews",
    match: ["/interviews"],
    roles: ["bidder", "user", "admin"],
    summary: "Ask a caller to conduct an interview, follow its status, and see previous interviews.",
    steps: [
      { title: "Click + New interview request", detail: "The request form opens in a window." },
      { title: "Choose the profile and the submitted application", detail: "Pick the application (resume + job posting) this interview is for. Company and role are filled in from it." },
      { title: "Check the step", detail: "The system checks earlier interviews for the same company and role and suggests the step (1 = initial, 2+ = follow-up)." },
      { title: "Choose the caller", detail: "For an initial interview, choose one of the profile's callers. For a follow-up, the caller who did the earlier interview is selected automatically and can't be changed." },
      { title: "Enter when", detail: "Give a specific time or a date / time range and the interview length. Times are in GMT-04:00." },
      { title: "Attach the interview email", detail: "Upload, drag or paste a screenshot of the interview invitation email, add notes, and send." },
      { title: "Follow the status", detail: "Use the Active / Previous / All tabs. You're emailed when the caller schedules it and when the result is reported." },
    ],
    tips: [
      "Cancel a request from its row if the interview is called off; the caller is notified.",
      "Completed interviews show the result, the interviewer, the feedback and a link to the recording. Each interview also lists the other interviews for the same company and role.",
      "Bidders: this page is in your menu unless an admin or profile manager has switched it off for your account.",
    ],
  },
  /* ------------------------------------------------------------ caller */
  {
    id: "caller-requests",
    title: "Interview Requests (caller)",
    path: "/caller/requests",
    match: ["/caller/requests"],
    roles: ["caller"],
    summary: "Requests assigned to you, shared requests other callers couldn't take, your scheduled interviews and results to report.",
    steps: [
      { title: "Assigned to me", detail: "New requests sent to you. Check the step, requested time, notes and the interview email screenshot." },
      { title: "Download the materials", detail: "Use Resume PDF / DOCX, Job description and the job posting link to prepare." },
      { title: "Accept & schedule", detail: "Choose the interview time (GMT-04:00), confirm the step and add a note such as the meeting link. It goes onto My Schedule and everyone responsible is emailed." },
      { title: "Can't do it?", detail: "Click Can't do it, give a reason, and the request is offered to all other callers. Follow-up steps (locked) can't be transferred." },
      { title: "Shared requests", detail: "Requests other callers transferred. The first caller to accept gets it." },
      { title: "Report due", detail: "After an interview, click Report result: choose the outcome, paste the recorded video URL, and enter the interviewer's name, their caller ID (the phone number they called from) and your feedback." },
      { title: "Add or edit feedback", detail: "Open a done interview and click Add feedback (or Edit feedback) to update the interviewer, caller ID or feedback at any time." },
    ],
    tips: ["Schedule each request before its deadline (3 hours by default) or the responsible people are notified.", "Once you conduct the first interview for a role, its follow-up steps are always yours."],
  },
  {
    id: "caller-schedule",
    title: "My Schedule",
    path: "/caller/schedule",
    match: ["/caller/schedule"],
    roles: ["caller"],
    summary: "Your interviews in Calendar, Board or List view.",
    steps: [
      { title: "Choose a view", detail: "Month or Week calendar, Board (cards by date or by status) or List (searchable table). Your choice is remembered." },
      { title: "My interviews / All my profiles", detail: "Switch between only your interviews and every interview on your assigned profiles." },
      { title: "Read the step bar", detail: "Each item shows its step with one coloured segment per step (step 3 = three segments)." },
      { title: "Drag on the board", detail: "Drag a card onto another day to reschedule it, or a shared request onto a day to accept it (shared requests show under All my profiles)." },
      { title: "Open an interview", detail: "Click it to see details, download materials, reschedule, report the result or transfer it (if allowed)." },
    ],
    tips: [
      "You get tomorrow's schedule by email the day before and a reminder before each interview (set on My Page).",
      "Open any of your interviews (including done ones) to add notes; admins can add notes too. Hover over an interview on the calendar to see its details and latest notes.",
      "Add an interview yourself with + Schedule interview or the + on a calendar day. Choose yourself or another caller assigned to the profile; another caller is emailed automatically.",
    ],
  },

  {
    id: "my-profiles",
    title: "My Profiles",
    titleFor: { bidder: "View Profile's Information" },
    path: "/profiles",
    match: ["/profiles"],
    roles: ["bidder", "caller", "user", "admin"],
    summary: "Read-only details of the candidate profiles assigned to you, for filling in application forms or preparing for interviews.",
    steps: [
      { title: "Choose a profile", detail: "Select a profile from the list." },
      { title: "Copy what you need", detail: "Use the copy buttons next to each field (name, contact, address, education, work history, EEO, visa, salary…)." },
    ],
  },

  /* ------------------------------------------------------------ everyone */
  {
    id: "notifications",
    title: "Notifications",
    path: "/notifications",
    match: ["/notifications"],
    roles: ["bidder", "caller", "user", "admin"],
    summary: "Messages from your administrators.",
    steps: [
      { title: "Use the bell", detail: "The bell in the top bar shows how many are unread. Click it to see the latest ones." },
      { title: "Read a notification", detail: "Click it to open the full message and any images; it's marked read." },
      { title: "See them all", detail: "Open Notifications (or View all in the bell) to see every message, filter Unread, or Mark all read." },
    ],
    tips: ["Unread notifications pop up when you open the app, and new ones appear as a pop-up while you work."],
  },
  {
    id: "feedback",
    title: "Feedback",
    path: "/feedback",
    match: ["/feedback"],
    roles: NOT_BIDDER,
    summary: "Report a problem, suggest an improvement or ask a question.",
    steps: [
      { title: "Click + Send feedback", detail: "The form opens in a window." },
      { title: "Choose the type and describe it", detail: "Bug, Idea, Question or Other; add a subject and details." },
      { title: "Attach screenshots", detail: "Add up to 10 screenshots (upload, drag or Ctrl+V)." },
      { title: "Follow the replies", detail: "Your list shows each item's status. Replies appear there and as a notification." },
    ],
  },
  {
    id: "my-page",
    title: "My Page",
    path: "/me",
    match: ["/me"],
    roles: ALL,
    summary: "Your account: avatar, password and (for callers) interview reminders. Times are in GMT-04:00; admins, users and callers can set their own time zone for the interview pages.",
    steps: [
      { title: "Choose an avatar", detail: "Click your avatar to pick a preset, upload a photo or use your initials.", image: "/help/my-page-1.webp" },
      { title: "Admins, users and callers: time zone", detail: "Pick your own time zone. The Interviews (Schedule) page and callers' calendars open in it; callers' emails and reminders use it too. Bidders always see GMT-04:00." },
      { title: "Callers: reminders", detail: "Choose how early to be reminded before each interview and when tomorrow's schedule is emailed.", image: "/help/my-page-3.webp" },
      { title: "Change your password", detail: "Enter your current password and the new one twice.", image: "/help/my-page-4.webp" },
    ],
  },
  {
    id: "help",
    title: "Help",
    path: "/help",
    match: ["/help"],
    roles: ALL,
    summary: "This guide.",
    steps: [
      { title: "Pick a role", detail: "The guide opens for your role; admins can read every role's guide." },
      { title: "Search", detail: "Type a word (for example screenshot, step, paid) to find the right page." },
      { title: "Use the ? button", detail: "On any page, the ? button in the top bar opens the guide for that page." },
    ],
  },

  /* ------------------------------------------------------------ staff */
  {
    id: "admin-overview",
    title: "Admin Overview",
    path: "/admin",
    match: ["/admin"],
    roles: STAFF,
    summary: "This month's totals, the last 30 days and sign-ups waiting for approval.",
    steps: [
      { title: "Approve sign-ups", detail: "Pending accounts are listed in the Pending sign-ups card; approve or reject them (admins)." },
      { title: "Read the totals", detail: "Applications generated and submitted, fees and token usage for the month." },
      { title: "Check profile quotas", detail: "See how much of each profile's monthly quota is used." },
    ],
  },
  {
    id: "admin-users",
    title: "Users & Bidders",
    path: "/admin/users",
    match: ["/admin/users"],
    roles: STAFF,
    summary: "Accounts: create, edit, activate / deactivate, roles, fees and profile assignments.",
    steps: [
      { title: "Filter by role", detail: "Use the role tabs (Bidders, Callers, Users, Admins), status and search." },
      { title: "Add an account (admin)", detail: "Click Add, enter name and email, choose the role (bidder, caller, user, admin), status and profiles. A temporary password is generated and an invitation email sent." },
      { title: "Edit / reset password", detail: "Edit an account to change its role, fee (bidders), profiles or issue a new temporary password. Tick Trusted bidder to let a bidder submit without a screenshot (only admins see this)." },
      { title: "Activate / deactivate", detail: "Deactivated accounts can't sign in; their history is kept." },
      { title: "Open an account", detail: "Click a name to see their usage, applications by profile and recent activity." },
    ],
    tips: ["Users (profile managers) see only bidders and can only change the profiles they manage."],
  },
  {
    id: "admin-profiles",
    title: "Profiles",
    path: "/admin/profiles",
    match: ["/admin/profiles"],
    roles: STAFF,
    summary: "Candidate profiles used to generate applications.",
    steps: [
      { title: "Add a profile", detail: "Click New profile. Fill in personal details, address, EEO, visa, salary, availability, education and experience." },
      { title: "Import from a resume", detail: "Upload the candidate's resume and let AI fill in the fields; review before saving." },
      { title: "Choose the API key and quota", detail: "Pick the OpenAI key / model and a monthly quota (0 = unlimited) for the profile." },
      { title: "Same-company cooldown", detail: "Optionally override the site's cooldown for this profile." },
      { title: "View, activate or deactivate", detail: "Inactive profiles can't be used to generate." },
    ],
  },
  {
    id: "admin-assignments",
    title: "Assignments",
    path: "/admin/assignments",
    match: ["/admin/assignments"],
    roles: STAFF,
    summary: "Who manages, bids with and calls for each profile.",
    steps: [
      { title: "By profile", detail: "Select a profile, then tick its managers (users / admins), bidders and callers, and click Save assignments." },
      { title: "Matrix", detail: "Switch to Matrix to see every profile × person; each tick saves immediately (violet = manages, indigo = bidder, green = caller)." },
      { title: "Notifications", detail: "People whose assignments change are emailed automatically." },
    ],
  },
  {
    id: "admin-applications",
    title: "Application History",
    path: "/admin/applications",
    match: ["/admin/applications"],
    roles: STAFF,
    summary: "Every application in scope: dates, profile, user, bidder, status, screenshots, documents and payment.",
    steps: [
      { title: "Filter", detail: "Date range (YYYY-MM-DD), account, profile, status, payment (paid / not paid) and search." },
      { title: "Select rows", detail: "Tick rows (or the header box for the whole page). The bar shows the count and the fee total." },
      { title: "Download", detail: "Above the table, Download ZIP (resume, cover letter & JD) or Resumes only downloads the ticked rows (it tells you if none are selected). The buttons at the top of the page download everything matching the filters." },
      { title: "Mark as paid (admin)", detail: "Use Mark as paid / not paid in the bar, or Set paid on a row. Only submitted applications carry a fee." },
      { title: "Delete (admin)", detail: "Delete removes an application permanently. Paid applications can't be deleted." },
      { title: "Customize columns", detail: "Use Columns to choose which columns are shown." },
    ],
  },
  {
    id: "admin-interviews",
    title: "Interviews (Schedule)",
    path: "/admin/interviews",
    match: ["/admin/interviews"],
    roles: STAFF,
    summary: "All interview requests and schedules for your profiles: who conducts each interview and when.",
    steps: [
      { title: "Choose a view", detail: "Month, Week, Board (by date or by status) or List. Filter by profile and caller." },
      { title: "Pick the time zone", detail: "Times are shown in GMT-04:00 by default. Choose another zone, such as Calgary (Mountain Time), and every time on the page updates. Callers' pages open in their own time zone." },
      { title: "Show one profile", detail: "Each profile has its own colour. Click a profile above the calendar to show only its interviews; click it again (or All) to show every profile." },
      { title: "Move an interview", detail: "Admins: drag a scheduled interview to another day in the Month or Week view, then confirm the time." },
      { title: "Change a time on the calendar", detail: "Admins: click the time of a scheduled interview in the Month or Week view, pick the new date and time and click Save. The caller and everyone responsible are emailed." },
      { title: "Edit a schedule", detail: "Admins: open an interview and click Edit schedule to change the time, caller, length, role or notes. The caller is emailed." },
      { title: "Send a message to a caller", detail: "Click Send message, choose the caller and the date, and add a note. They get their interviews for that day in their notifications and by email." },
      { title: "Handle requests waiting for a caller", detail: "Use Assign caller on overdue or open requests." },
      { title: "Open an interview", detail: "See its step, timeline, materials, result, interviewer and feedback, and the earlier interviews for the same role. Admins can add or edit feedback on done interviews." },
    ],
    tips: [
      "Book an interview directly with + Schedule interview, or the + on a calendar day: choose the profile, the company and role (or a submitted application), the date, time and time zone (GMT-04:00 by default) and the caller. It goes straight onto the caller's schedule and the caller is emailed automatically.",
      "Admins can choose any caller; profile managers choose among the callers assigned to the profiles they manage.",
      "Locked follow-ups stay with the caller of the earlier interview; only admins can reassign them.",
      "Done interviews are marked ✓ Done in green on the calendar. Hover over any interview to see its details, result and latest notes.",
      "Admins and the interview's caller can add notes: open the interview and use Notes at the bottom. A ✎ count on the calendar shows how many notes it has.",
      "Admins can delete any interview, scheduled or a request: open it and click Delete. If a caller had it, they are emailed. Deleted interviews are hidden; use the Deleted filter (Show deleted too / Only deleted) to find them, and Restore to bring one back.",
    ],
  },
  {
    id: "admin-notifications",
    title: "Notifications (admin)",
    path: "/admin/notifications",
    match: ["/admin/notifications"],
    roles: ["admin"],
    summary: "Send messages to people or groups and see who read them.",
    steps: [
      { title: "Click + New notification", detail: "The composer opens in a window." },
      { title: "Choose recipients", detail: "Tick whole groups (admins, users, bidders, callers) and/or specific people." },
      { title: "Write and attach", detail: "Add a title, the message and any images or screenshots." },
      { title: "Choose delivery", detail: "In-app only (bell + pop-up) or In-app + email." },
      { title: "Track reads", detail: "The list shows read counts; click a notification to see who read it and when, or delete it." },
    ],
  },
  {
    id: "admin-feedback",
    title: "Feedback (admin)",
    path: "/admin/feedback",
    match: ["/admin/feedback"],
    roles: ["admin"],
    summary: "Feedback sent by everyone.",
    steps: [
      { title: "Find new items", detail: "Unopened feedback is highlighted. Filter by status and type." },
      { title: "Open one", detail: "Read the details and view the screenshots." },
      { title: "Reply and set the status", detail: "Write a reply (sent to the person as a notification) and set New, In progress or Resolved." },
    ],
  },
  {
    id: "admin-logs",
    title: "Logs",
    path: "/admin/logs",
    match: ["/admin/logs"],
    roles: ["admin"],
    summary: "Everything that happens: sign-ins, changes, downloads, emails and server errors.",
    steps: [
      { title: "Filter", detail: "Click a category, or filter by date (YYYY-MM-DD), level, person and text." },
      { title: "Spot problems", detail: "Warnings are refused or failed actions; errors are server errors. The red badge shows errors in the last 24 hours." },
      { title: "Open an entry", detail: "See who, what, the request, status, duration, IP address, browser and details (passwords are never stored)." },
      { title: "Export", detail: "Export CSV downloads the filtered log." },
    ],
    tips: ["Logs are kept for one year."],
  },
  {
    id: "admin-keys",
    title: "API Keys",
    path: "/admin/keys",
    match: ["/admin/keys"],
    roles: ["admin"],
    summary: "OpenAI keys used to generate applications.",
    steps: [
      { title: "Add a key", detail: "Click Add, give it a label, paste the key, choose the default model, prices and an optional monthly token limit." },
      { title: "Test it", detail: "Use Test to check the key works." },
      { title: "Make one the default", detail: "Profiles without their own key use the default key." },
      { title: "Watch usage", detail: "Tokens and cost are tracked per key." },
    ],
    tips: ["Keys are stored encrypted and never shown again after saving."],
  },
  {
    id: "admin-prompt-test",
    title: "Test Generate Resume",
    path: "/admin/prompt-test",
    match: ["/admin/prompt-test"],
    roles: ["admin"],
    summary: "Try the resume prompt on a profile and a job before using it. Nothing is saved: no application, no fee, no quota.",
    steps: [
      { title: "Choose a profile and a job", detail: "Pick the profile, then enter a job URL or paste the job description." },
      { title: "Edit the prompt (optional)", detail: "The prompt and extra instructions start as they are in Settings, which is exactly what real generation uses. Change them to try a draft." },
      { title: "Generate a test resume", detail: "Click Generate test resume. The resume, cover letter and job description appear on the right, with tokens, cost and time." },
      { title: "Use it or reset", detail: "Happy with the draft? Click Save prompt to Settings to use it for every new resume. Otherwise click Reset to Settings or Use default prompt." },
    ],
    tips: ["The prompt in Settings is used for every resume: Generate, Generate Resume (job URLs) and retrying a not-generated application."],
  },
  {
    id: "admin-api-access",
    title: "API Access",
    path: "/admin/api-access",
    match: ["/admin/api-access"],
    roles: ["admin"],
    summary: "Keys for the read-only TailorBid API: scheduled interviews, their profiles, generated resumes and job descriptions.",
    steps: [
      { title: "Create a key", detail: "Click + Create API key, name it after what will use it and choose when it expires." },
      { title: "Copy the key", detail: "The key is shown once. Copy it into the system that will call the API; if it is lost, revoke it and create a new one." },
      { title: "Call the API", detail: "Send the key as Authorization: Bearer <key>. The page lists every endpoint (interviews, profiles, resumes, job descriptions) with an example." },
      { title: "Watch and revoke", detail: "The list shows when each key was last used, from which IP, and how many requests it made. Revoke a key to stop it working immediately." },
    ],
    tips: ["API keys can read every profile and interview, including personal details. Share them only with systems you trust.", "OpenAI keys are managed separately on API Keys."],
  },
  {
    id: "admin-settings",
    title: "Settings",
    path: "/admin/settings",
    match: ["/admin/settings"],
    roles: ["admin"],
    summary: "Site-wide configuration.",
    steps: [
      { title: "General", detail: "Site name, default fee for new bidders, same-company cooldown (days), interview scheduling deadline (hours) and sign-up requests." },
      { title: "Notifications & daily report", detail: "Report time zone (EST standard), milestones, and send a report manually for a day (YYYY-MM-DD)." },
      { title: "My Page announcement", detail: "A message shown to everyone on My Page." },
      { title: "Resume & cover letter prompt", detail: "Edit the generation prompt, or reset it to the default." },
    ],
  },
];

/** Guides for a role, in menu order. */
const BY_ROLE = Object.fromEntries(
  (["bidder", "caller", "user", "admin"] as HelpRole[]).map((r) => [
    r,
    HELP_PAGES.filter((p) => p.roles.includes(r)).map((p) => (p.titleFor?.[r] ? { ...p, title: p.titleFor[r] } : p)),
  ]),
) as Record<HelpRole, HelpPage[]>;
export const pagesFor = (role: HelpRole) => BY_ROLE[role];

/** Screenshot for a step: its own image, else the page's numbered screenshot. */
export const stepImage = (page: { id: string }, step: HelpStep, index: number) => step.image ?? (page.id ? `/help/${page.id}-${index + 1}.webp` : undefined);

/** Best guide for the current path (longest matching prefix). */
export function helpForPath(path: string, role: HelpRole) {
  let best: HelpPage | null = null;
  let len = -1;
  for (const p of pagesFor(role))
    for (const m of p.match) {
      const hit = m.endsWith("/") ? path.startsWith(m) : path === m || path.startsWith(m + "/");
      if (hit && m.length > len) {
        best = p;
        len = m.length;
      }
    }
  return best;
}
