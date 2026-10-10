# Trippo

**Group trips, minus the group-chat chaos.** Trippo is one place for a friend
group to go from "where should we go?" to "who owes whom ₹340?" with preferences,
an AI itinerary built from real places, voting, prep, live location and a
shared budget.

Built for the SerpApi Hackathon (Travel & Local Discovery).

## The journey

Trippo is organised around five stages, and the **Overview** tells each person
the single next thing _they_ should do:

1. **Invite your crew**: share one link (WhatsApp-ready). Friends sign in and
   land straight on the trip.
2. **Share preferences**: diet, pace, budget, interests, accessibility needs.
3. **Build the plan**: SerpApi research + Groq turn the group's answers into a
   day-by-day itinerary. The admin can edit, reorder and add stops.
4. **Approve together**: everyone votes; the plan locks when all voters agree.
   Any edit resets the votes.
5. **Get ready & go**: prep guide + private packing checklist, live map,
   shared budget with settle-up, and a cinematic "story" fly-through.

Along the way: a **crew chat** where `@trippo` answers hotel, transport and place
questions from live SerpApi data (with polls and "add to itinerary" built in), and
**Gear & shopping**: trip-specific product ideas, Amazon search through SerpApi's
`amazon` engine, and a crew list every member can add to and vote on.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · shadcn/ui (preset `b3Sm9Pe4Y`) ·
Prisma 7 + Neon Postgres · Auth.js v5 (Google) · SerpApi · Groq ·
Leaflet/OpenStreetMap + MapLibre · ElevenLabs (optional narration)

## Design system

The UI follows the shadcn preset `b3Sm9Pe4Y` (style `radix-sera`, Space Grotesk,
a lime primary). On top of it, a few house rules live in `src/app/globals.css`:

- **Square corners everywhere**: `--radius` is 0 and a global reset catches any
  `rounded-*` class.
- **Glass surfaces**: cards, the sidebar and sticky bars are translucent and
  blurred, over a very mild WebGL shader (`components/shader-background.tsx`).
- **Light / dark / system**: chosen in **Settings** (`/settings`), with quick
  toggles in the headers. Use `text-brand` (not `text-primary`) for accent text:
  the preset's lime is too light to read on white.

## Getting started

```bash
cp .env.example .env     # then fill in the values (see below)
npm install
npx prisma migrate deploy
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | Neon pooled URL (runtime) and direct URL (migrations) |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Auth.js + Google sign-in |
| `SERPAPI_API_KEY` | Live places, hotels, events, photos |
| `GROQ_API_KEY`, `GROQ_MODEL` | Itinerary, prep guide and story narration |
| `GROQ_CHAT_MODEL` | Optional. Model for `@trippo` in the crew chat (defaults to `GROQ_MODEL`) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Optional premium voice-over (falls back to the browser voice) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional Web Push (`npx web-push generate-vapid-keys`; subject is a `mailto:` or https URL). Without them, in-app notifications still work |

Without SerpApi/Groq keys the app still works and generates a clearly-labelled
sample plan. In development a "Dev sign in" box on `/login` lets you sign in
with any email (never enabled in production).

### Commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
npx tsc --noEmit # typecheck
```

## How the code is organised

```
src/app/(app)/trips/[id]/   the trip workspace (server page + one component per section)
src/app/(app)/trips/[id]/chat/   the crew chat UI (messages, cards, polls, composer)
src/app/join/[code]/        public invite-link landing page
src/lib/journey.ts          pure logic: the 5-stage journey + "your next step"
src/lib/plan-state.ts       single source of truth for "is the plan approved?"
src/lib/access.ts           membership / admin checks shared by server actions
src/server/*                server actions (trips, itinerary, polls, budget, …)
src/server/chat*.ts         chat actions and the shared chat queries
src/server/trippo-*.ts      the @trippo agent and its SerpApi tools
```

Notes for contributors:

- The active trip section lives in the URL (`?tab=itinerary`), so every section
  is deep-linkable. Add a section in `nav-config.ts`, then render a
  `<TabsPrimitive.Content value="…">` for it in `page.tsx`.
- This Next.js version differs from older releases (e.g. `error.tsx` receives
  `retry`; `middleware` is `proxy`). Read `node_modules/next/dist/docs/` first.
- Anything that can change who has approved the plan must call
  `syncPlanState(tripId)`.

## How the itinerary route is built

Plans are built route-first, so they are travellable, not just a list of places:

1. **Gateway and mode.** From the trip's origin city and destination, Trippo decides flight
   or road (`src/lib/airports.ts`), and for flights fetches real one-way fares and times
   with SerpApi's `google_flights` engine, picking an early arrival and a late direct return.
2. **Bases.** The model proposes where to sleep; code keeps only bases inside the chosen
   destination, rejects any leg that is too long for the trip length (90 minutes by road for
   3 days or fewer), and orders the loop to be the shortest (`src/lib/geo.ts`, exact up to 12 stops).
3. **Days.** Each day gets a time window set by the real flights and transfers, and a set of
   nearby places ordered along the shortest path, so a day never zigzags.
4. **Wording.** The model only writes the free-time parts around that fixed skeleton, and its
   output is checked against it (invented far-off places are dropped, times are repaired).

Without Groq, the same skeleton produces a complete deterministic plan.

## Crew chat and @trippo

The **Chat** tab is a group chat for the crew. Mention `@trippo` and the AI answers in the
thread with live data instead of guesses:

- **Hotels**: "top 3 hotels near Colombo" runs SerpApi `google_hotels` and returns cards with a
  photo, nightly price, rating, amenities and distance. Ratings are weighted by review count,
  so a 5.0 from a dozen reviews does not beat a 4.7 from thousands.
- **Between two stops**: `google_maps_directions` for driving, transit (train and bus operators
  with departure and arrival times), two-wheeler and walking, plus a web search for local fares
  and a currency conversion. The fastest option is worked out in code, not by the model.
- **Places and food**: `google_maps` search around a stop. **Anything else**: a web search,
  summed up in a few sentences.

Every card can go two ways:

- **Add to itinerary**: an admin adds it straight to a day (in time order, and the votes on the
  plan reset). Anyone else sends a request that the admins see in the chat and approve or decline.
- **Start a poll**: tick two or more options on a card, or use the Poll button for a free-form
  question. Polls live in the thread, votes are private, a result is posted when a poll closes,
  and the winner can be added to the plan.

How it works: `src/server/trippo-ai.ts` runs one tool round (the model picks tools, the code
runs them in parallel) and then a forced `reply` call. Cards are built only from the tool
results, never from text the model wrote, so no hotel or fare is invented. Groq's free tier has a
small tokens-per-minute budget, so tool output is kept lean and a 429 is waited out and retried.
Questions are limited to 10 per person per hour and 60 per trip per day, which protects the
SerpApi and Groq quotas (a hotel question costs about 1 to 2 searches, a transport question
about 6, and results are cached).

The chat itself uses short polling (`getChat` with a `since` cursor), not websockets, which suits
the free Render plan. `ChatMessage.updatedAt` is touched on every change, so votes, card states
and request decisions reach everyone on the next poll. People who are away from the chat get a
notification (and a push if enabled); people looking at it do not.

## Notifications & installing the app

- **In-app inbox**: every crew action that matters (chat mentions and messages while
  you are away, polls, votes, gear picks, expenses, plan changes) writes a `Notification`
  row. Notifications are scoped to a trip: each trip card has its own bell with a count,
  and the bell and `/notifications` deep-link to the right trip section.
- **Push**: standard Web Push (VAPID + service worker); no Firebase needed.
  Each person opts in per device in **Settings**. iPhones only allow push for
  apps added to the Home Screen.
- **PWA**: `manifest.webmanifest`, generated icons at `/icons/*`, and
  `public/sw.js` (offline shell + push). Use the browser's "Install" option.

## Deployment

`render.yaml` describes a Render web service (free plan). Create it with
**New → Blueprint** pointing at this repo, then fill in the variables marked
`sync: false` above. Migrations run during the build. After the first deploy,
add `https://<service>.onrender.com/api/auth/callback/google` to the Google
OAuth client's authorised redirect URIs. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is
inlined at build time, so set it before the first deploy (or redeploy after).
