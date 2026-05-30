// SIMULATION DATA — not a live API.
// Realistic raw items mimicking what each real source would return, so we can
// demo the dashboard end-to-end without connecting real accounts. The AI still
// reads each of these for real; only the source content is fabricated here.
// When a real source is wired up (see docs/poc-plan.md), it returns this same
// shape and the rest of the pipeline is unchanged.

export type RawFeedItem = {
  source: string; // 'gmail' | 'classroom' | 'calendar' | 'drive' | 'youtube' | 'instagram' | 'whatsapp' | 'veracross' | 'buzz'
  source_id: string; // stable id, used to avoid storing duplicates
  title: string;
  sender: string;
  body: string;
  url: string;
  occurred_at: string; // ISO timestamp
};

// A mix of genuinely-important school items AND realistic "noise" (promos,
// unrelated videos) so you can watch the AI filter actually do its job.
export const SAMPLE_ITEMS: RawFeedItem[] = [
  // --- School Gmail: teacher reminders & admin notices ---
  {
    source: "gmail",
    source_id: "sim-gmail-1",
    title: "Reminder: Biology lab report due this Friday",
    sender: "Ms. Alvarez <alvarez@bhs.edu>",
    body: "Hi class, a quick reminder that your photosynthesis lab report is due this Friday, May 31 by 11:59pm. Submit through Classroom. Rubric is attached. Late work loses 10% per day. — Ms. Alvarez",
    url: "https://mail.google.com/mail/u/0/#inbox/sim1",
    occurred_at: "2026-05-30T08:12:00Z",
  },
  {
    source: "gmail",
    source_id: "sim-gmail-2",
    title: "Early dismissal Wednesday — staff development",
    sender: "BHS Main Office <office@bhs.edu>",
    body: "Families, please note school will dismiss at 12:30pm this Wednesday, June 4, for a staff development afternoon. Buses will run on the early schedule. Aftercare is available by sign-up.",
    url: "https://mail.google.com/mail/u/0/#inbox/sim2",
    occurred_at: "2026-05-29T15:40:00Z",
  },
  {
    source: "gmail",
    source_id: "sim-gmail-3",
    title: "🔥 48 hours only: 40% off sitewide at SneakerHub",
    sender: "SneakerHub Deals <deals@sneakerhub.com>",
    body: "Don't miss our biggest sale of the season! 40% off all shoes, plus free shipping over $50. Shop now before it's gone. Unsubscribe anytime.",
    url: "https://mail.google.com/mail/u/0/#inbox/sim3",
    occurred_at: "2026-05-30T06:02:00Z",
  },
  {
    source: "gmail",
    source_id: "sim-gmail-4",
    title: "Your AP Exam scores are now available",
    sender: "College Board <no-reply@collegeboard.org>",
    body: "Your AP scores for May 2026 are ready to view. Sign in to your College Board account to see your results and send free score reports to your chosen college by the June 20 deadline.",
    url: "https://mail.google.com/mail/u/0/#inbox/sim4",
    occurred_at: "2026-05-30T07:30:00Z",
  },

  // --- Google Classroom: announcements & coursework ---
  {
    source: "classroom",
    source_id: "sim-classroom-1",
    title: "New assignment: Chapter 7 Problem Set",
    sender: "AP Calculus · Mr. Tran",
    body: "Posted a new assignment: Chapter 7 Problem Set (integration by parts). 12 problems, due Monday June 2. Show all work. This is practice for the unit test on June 6.",
    url: "https://classroom.google.com/c/sim/a/1",
    occurred_at: "2026-05-29T18:05:00Z",
  },
  {
    source: "classroom",
    source_id: "sim-classroom-2",
    title: "Announcement: Field trip permission slip due Monday",
    sender: "Spanish III · Sra. Gómez",
    body: "¡Hola! Permission slips for our trip to the Cervantes Institute are due Monday. No slip, no trip — please don't forget. We leave at 9am Tuesday and return by 2pm.",
    url: "https://classroom.google.com/c/sim/p/2",
    occurred_at: "2026-05-29T12:20:00Z",
  },

  // --- Google Calendar: events ---
  {
    source: "calendar",
    source_id: "sim-calendar-1",
    title: "Parent-Teacher Conferences",
    sender: "BHS School Calendar",
    body: "Parent-teacher conferences, Thursday June 5, 4:00pm–7:00pm in the main gym. Sign up for slots with individual teachers via the front office link.",
    url: "https://calendar.google.com/event?sim=1",
    occurred_at: "2026-06-05T16:00:00Z",
  },
  {
    source: "calendar",
    source_id: "sim-calendar-2",
    title: "Varsity Basketball vs. Lincoln High",
    sender: "BHS Athletics Calendar",
    body: "Home game! Varsity basketball vs. Lincoln High, Friday June 6 at 6:00pm in the main gym. Wear blue for the spirit section.",
    url: "https://calendar.google.com/event?sim=2",
    occurred_at: "2026-06-06T18:00:00Z",
  },

  // --- Google Drive: shared files ---
  {
    source: "drive",
    source_id: "sim-drive-1",
    title: "Mr. Rivera shared 'Unit 5 Study Guide.pdf'",
    sender: "Mr. Rivera (US History)",
    body: "A file was shared with you: 'Unit 5 Study Guide.pdf' — covers the Civil Rights movement for the test on June 9. 6 pages, includes practice questions.",
    url: "https://drive.google.com/file/d/sim1/view",
    occurred_at: "2026-05-30T09:15:00Z",
  },

  // --- YouTube: BHS channel uploads (body includes a transcript snippet) ---
  {
    source: "youtube",
    source_id: "sim-youtube-1",
    title: "BHS Spring Concert 2026 — Full Performance",
    sender: "Barcelona High School (YouTube)",
    body: "Transcript excerpt: 'Welcome everyone to the Barcelona High Spring Concert. Tonight our jazz band, choir, and orchestra will perform pieces they've rehearsed all semester. First up, the wind ensemble with a medley from...' Full 1h12m recording of the May 28 concert.",
    url: "https://youtube.com/watch?v=sim1",
    occurred_at: "2026-05-28T21:00:00Z",
  },
  {
    source: "youtube",
    source_id: "sim-youtube-2",
    title: "I Built a Gaming PC for $300 (INSANE Results)",
    sender: "TechBroDaily (YouTube)",
    body: "Transcript excerpt: 'What is up guys, today we're building the cheapest gaming PC possible and benchmarking it against a console...' Recommended for you.",
    url: "https://youtube.com/watch?v=sim2",
    occurred_at: "2026-05-30T05:45:00Z",
  },

  // --- Instagram: @bhsnews posts/reels (caption text) ---
  {
    source: "instagram",
    source_id: "sim-instagram-1",
    title: "Reel: Robotics team takes 2nd at regionals!",
    sender: "@bhsnews",
    body: "🤖🏆 SO proud of our Robotics team for placing 2nd at the regional championship this weekend! They're headed to states next month. Swipe for the winning run 👉 #BHSPride #Robotics",
    url: "https://instagram.com/reel/sim1",
    occurred_at: "2026-05-29T20:10:00Z",
  },
  {
    source: "instagram",
    source_id: "sim-instagram-2",
    title: "Post: Spirit Week starts Monday!",
    sender: "@bhsnews",
    body: "📣 SPIRIT WEEK is here! Mon: Pajama Day 😴 Tue: Twin Day 👯 Wed: Decades Day 🕺 Thu: Jersey Day 🏀 Fri: Blue & White Day 💙 Tag a friend and show your school spirit!",
    url: "https://instagram.com/p/sim2",
    occurred_at: "2026-05-30T13:00:00Z",
  },

  // --- WhatsApp: official school broadcast number ---
  {
    source: "whatsapp",
    source_id: "sim-whatsapp-1",
    title: "BHS Office broadcast",
    sender: "BHS Office (Broadcast)",
    body: "⚠️ WEATHER ALERT: Due to the forecasted storm, all after-school activities are CANCELLED today. Regular classes are unaffected. Stay safe and check email for updates.",
    url: "",
    occurred_at: "2026-05-30T11:30:00Z",
  },

  // --- Veracross: SIS (grades & attendance) ---
  {
    source: "veracross",
    source_id: "sim-veracross-1",
    title: "Grade posted: Chemistry Quiz 3",
    sender: "Veracross",
    body: "A new grade was posted. Chemistry — Quiz 3: 88% (B+). Class average: 81%. Your current Chemistry grade is an 84% (B).",
    url: "https://portals.veracross.com/bhs/student/grades",
    occurred_at: "2026-05-29T17:00:00Z",
  },
  {
    source: "veracross",
    source_id: "sim-veracross-2",
    title: "Attendance notice — Period 4",
    sender: "Veracross",
    body: "You were marked ABSENT in Period 4 (US History) on May 28. If this is an error, please contact the attendance office within 48 hours.",
    url: "https://portals.veracross.com/bhs/student/attendance",
    occurred_at: "2026-05-29T09:00:00Z",
  },

  // --- Buzz / Accelerate: LMS course activity ---
  {
    source: "buzz",
    source_id: "sim-buzz-1",
    title: "You're behind pace in Spanish II",
    sender: "Accelerate (Buzz LMS)",
    body: "Heads up: you're 2 lessons behind the recommended pace in Spanish II. Complete Lessons 18 and 19 by Sunday to stay on track for on-time course completion.",
    url: "https://accelerate.agilixbuzz.com/course/spanish2",
    occurred_at: "2026-05-30T10:00:00Z",
  },
];
