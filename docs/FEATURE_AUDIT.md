# Feature audit: did we implement everything?

Audit of branch `mobile/facebook-shell`, mobile app only (`frontend/mobile`) plus the backend. Built from 17
adversarially verified audit reports (see the appendix). Baseline: `pytest` 1020 passed, `ruff` clean.

## Verdict

No. Of the 38 features in scope, 3 work end to end, 13 work partly, and the other 22 are backend-only, mock-only or missing.
The core loop works for real: sign up, add friends, post a Move to friends or a Circle, poke people, get an in-app
banner, pull up from the map, see updates live, and share a link. Almost everything after that dead-ends.

The three biggest structural problems:

1. **The surfaces lane was never built.** The proximity, calendar, ratings, leaderboards, Reels and demo routers are empty, and
   nothing runs when a Move ends: no hangouts, no rating prompt. As a result Muse has no history to learn from,
   the flare can never fire, and there is no Demo Control to trigger anything on stage.
2. **The backend is far ahead of the app.** Muse suggestions, settings and blocking, Circles, Saved Marks, Moments, the Mark page,
   End and "I'm here", place search and pseudo-groups all have working endpoints and no screen. Every Muse
   notification opens nothing when tapped.
3. **Fake data passes for real data.** Every account sees Anish's profile. The Notifications tab and Home feed are mostly mock rows.
   Sign-up auto-friends everyone. Any backend error silently swaps in the mock world and "posts" Moves nobody can see.

**Muse:** the real client is written to the documented Messages-style wire format but has never been run, because no
`MUSE_API_KEY` is set. Every agent runs its heuristic fallback. Even with a key, the composer always asks for the
template draft, the 6 s and 10 s timeouts are shorter than Muse's measured 6 to 9 s latency, and nothing can honestly show "Muse
did this". In the app a user reaches only the notify picker and the ranker (whose reason is never shown), and the picker has
zero hangout data to work from.

## Feature status, F1 to F46

Statuses: **Works end to end**, **Partial**, **Backend only, no UI**, **UI is mock only**, **Missing**, **Out of
scope by decision**.

| ID | Feature | Status | What a user experiences today |
| --- | --- | --- | --- |
| F1 | Share a Move | Partial | You can post a Move to friends or a Circle, but the text is always a template, you can only pick from the 8 nearest seeded places (no search, no new place), and if any call fails the app quietly makes a fake local post. |
| F2 | Friends notified, pull up | Partial | Friends you poke get a banner and can tap "I'm going". If you post without tapping Poke, nobody is told. Tapping "I'm going" again makes you leave, leaves a ghost, and locks you out of that Move with no message. |
| F3 | Solo discovery from the map | Works end to end | You open the map, tap a Move, pull up, and your friends get a "pulling up" notice. This only works within 25 km of the seeded Menlo Park places. |
| F4 | Reach beyond the group chat | Partial | Share links work and seeded Circles can be picked, but you cannot create a Circle such as "HS friends". |
| F5 | Randoms nearby over BLE (open Moves only) | Missing | You cannot mark a Move open, and there is no nearby discovery. Only an "open" flag exists in the backend. |
| F6 | Map of Moves (Marks) | Partial | Real Moves show as pins, but fake Moves flash on every open and replace real ones on any error. Panning never loads new areas, and pins are per Move, not per place. |
| F7 | Saved Marks | Backend only, no UI | You cannot save a place, and the Saved menu tile does nothing. |
| F8 | Avatar at venue, then ghost | Partial | Ghost pins appear for seeded users. Friends who join never show as "there", there is no Leave or End button, and new accounts never see the seeded ghosts. |
| F9 | Tap a ghost to see Moments | UI is mock only | The "See Moments" button does nothing. |
| F10 | Distinct Mark categories | Partial | You see a small category badge, but 10 categories collapse into 7 (outdoors shows as gym) and there is no category filter. |
| F11 | Bluetooth auto-join | Missing | You never see "You're with Anish and Maya, add yourself?", and the auto-join list has no screen. |
| F12 | Skip people already there | Partial | Only people already in the Move are skipped, because nothing ever detects who is physically together. |
| F13 | Personal notifications | Works end to end | Recipients see "Hey Anish, Tony's doing this" style copy from a template, not from Muse. |
| F14 | AI picks who gets notified | Partial | The composer shows "Muse picked" names with reasons, but they come from a heuristic with no hangout history, so the picks are effectively arbitrary. |
| F15 | Pseudo-groups | Backend only, no UI | No learned groups appear anywhere, and there is no hangout data to learn them from. |
| F16 | Muse ranks nearby Moves | Partial | The list is ordered by a heuristic, and the "why this Move" reason is never shown. |
| F17 | Calendar flare ("30 min free, send a flare?") | Backend only, no UI | It never fires because there is no calendar, and there is no screen to accept it. |
| F18 | "Want to start a Move?" when free | Backend only, no UI | The free-time prompt never fires. The related "nobody bit" nudge does fire, but tapping it does nothing. |
| F19 | Rating after each Move, taste learning | Missing | You are never asked to rate, there is no rating screen, and taste never updates. |
| F20 | Revive quiet groups | Backend only, no UI | It never fires (no group history), and there is no fading-groups screen. |
| F21 | Agents coordinate future Moves / BLE shared context | Missing | Nothing. |
| F22 | Ride and route suggestions | Out of scope by decision | Not built for the UI, but a backend route agent still fires on every join and sends notifications that open nothing. |
| F23 | Beli-style leaderboard | Missing | There is no leaderboard screen. The backend ranking code is unwired and lets scores drift outside their bands. |
| F24 | Location is opt-in | Partial | Location is asked for on the Moves tab. If you deny it, you still get a fake "Me" pin and a "here?" label, and you cannot search for a place. |
| F25 | Never show live location | Works end to end | Avatars sit on places, never on people, and no response carries user coordinates. |
| F26 | Share to chosen groups, not public | Partial | Choosing friends and Circles works. You cannot hide Moves from someone (such as a parent), and a forwarded share link shows names to anyone. |
| F27 | Obvious who will see a post | Partial | An audience line appears before posting, but it is computed on the phone and wrong: it lists people the server has hidden (the seeded Mom). |
| F28 | Privacy settings and Move preferences | Backend only, no UI | There is no settings screen. The gear and every Settings row do nothing. |
| F29 | Verification against fake profiles | UI is mock only | Everyone shows a hardcoded verified badge. New sign-ups are unverified with no way to verify. |
| F30 | Leave quietly | Missing | There is no Leave button at all, quiet or otherwise. |
| F31 | "Don't suggest this group again" | Missing | No option exists, and revive itself is unreachable. |
| F32 | Mocked Facebook shell | Partial | It looks like Facebook. Most tiles, buttons and the profile are mock: everyone sees Anish's profile, and about 25 Menu entries do nothing. |
| F33 | Marketplace tie-in | Out of scope by decision | The Marketplace tile is present and does nothing. |
| F34 | Reel place chip ("Kumo Matcha · 1.2mi") | UI is mock only | The chip shows on fake Reels with made-up distances. |
| F35 | Chip opens "Tony + 2 are here" / "Start a Move here" | Missing | Tapping the chip does nothing. |
| F36 | Muse reads the Reel, writes the Move, picks who to tell | Backend only, no UI | The place resolver and writer exist in the backend, but no Reel path reaches them. |
| F37 | Save a Reel becomes a Saved Mark | UI is mock only | The bookmark toggles on the phone only and is lost. Nothing reaches the map. |
| F38 | Calendar gap plus saved spot triggers a flare | Backend only, no UI | It never fires: there is no calendar, and new users have no saved spots. |
| F39 | Tap yes, Move goes out with a 5 to 10 min fill | Backend only, no UI | There is no accept button. Accepting would also fail for any free window of 60 minutes or more (a fill-time bug). |
| F40 | Mock calendar, fire button, reasoning card | Missing | None of it exists. |
| F41 | Marketplace pickup Move | Out of scope by decision | Not built. |
| F42 | Marketplace safety check-in | Out of scope by decision | Not built. |
| F43 | Safe midpoint suggestion | Out of scope by decision | Not built. |
| F44 | "Hey Meta, start a Move" | Out of scope by decision | Not built in the app. A backend intent parser exists, unused. |
| F45 | "Hey Meta, save this place" | Out of scope by decision | Not built. |
| F46 | Glasses POV Moments, recap Reel | Out of scope by decision | Not built. |

Count of the 38 in-scope features: Works end to end 3, Partial 13, Backend only 9, UI is mock only 4, Missing 9.

## Basics a working app needs that were never written down

| Area | Status | What a user experiences today |
| --- | --- | --- |
| Sign up and log in | Partial | Real accounts work. There is no hint of demo credentials and no quick seeded-user picker. |
| Sign-up auto-friends everyone | Partial | A new account is instantly friends with every user, including the seeded Mom, so friend requests are pointless. |
| Stale session after a database reset | Missing | The app looks signed in, every call fails, and it silently shows the fake world instead of logging you out. |
| Log out / switch account | Partial | Logging out works, but the next account briefly sees the previous account's friends and badge. |
| Own profile | UI is mock only | Everyone sees Anish's name, photo, 412 friends and posts. The menu card and composer header also show Anish. |
| Edit profile (name, photo, bio) | Missing | The Edit button is dead and there is no backend for it. |
| Other people's profiles | Missing | No name or avatar anywhere opens a profile. |
| People search | Partial | Results load, but Add friend, Confirm, Delete or Unfriend snaps back within a split second after you tap it. |
| Friend requests | Partial | Sending and accepting work from the Notifications tab. Taps on friend banners and pushes open the map instead. |
| Friend list | Partial | There is only the empty-search list. The Friends tile is dead and shows a fake "2 new". |
| People You May Know / Add friends card | UI is mock only | Fake people, and the buttons only flip locally. |
| Mutual friends | Missing | Never computed. |
| Circles: create, rename, members, delete | Backend only, no UI | New accounts have zero Circles forever. |
| Block / "Hidden from" | Backend only, no UI | You cannot hide Moves from anyone. Blocking does not remove the friendship. |
| Auto-join list | Backend only, no UI | You cannot see or edit it. |
| Settings and privacy screen | Backend only, no UI | Location, BLE, calendar, Muse proactive, quiet hours and ghost visibility cannot be changed. |
| Account settings (password, username, delete account) | Missing | None exist. |
| Onboarding / first run | Missing | Sign-up drops you onto the mock Home feed with no explainer, permission primer or find-friends step. |
| Home feed | UI is mock only | All posts are fake. Your own posts appear as Anish's and vanish on restart. Moves and Muse cards never appear on Home. |
| Entry points to make a Move | Partial | The only way in is a small icon on the map. The Home composer makes a fake Facebook post instead. |
| Move detail screen | Partial | There is a card in the map sheet only, with no audience line, no going vs there, and no fill timer. Links to a Move outside the loaded list do nothing. |
| "I'm here" (arrive) | Backend only, no UI | Joiners stay "going" forever. |
| Leave a Move | Partial | The only way out is un-tapping "I'm going", which leaves a ghost and blocks rejoining. |
| End your own Move | Backend only, no UI | The "Your Move" button does nothing, and your own row shows a dead "Going" button. Moves end only after 3 idle hours. |
| Edit or cancel a Move | Missing | Typos and audience mistakes are permanent. |
| Directions to the place | Missing | After pulling up there is no maps link. |
| Past Moves / history | Missing | You cannot see your past Moves or rate one later. |
| Place page (Mark detail) | Backend only, no UI | There is nowhere to see a place's score, past Moves, Save or "start a Move here". |
| Search or add a place | Backend only, no UI | You cannot find or create a place by name. |
| Moments: upload, view, approve tags | Backend only, no UI | There is no camera or upload, and tagged people can never approve, so tagged Moments stay pending. |
| Muse suggestions: see, accept, dismiss | Backend only, no UI | Muse notifications show in the inbox and banner, and tapping them does nothing. This breaks product rule 6's "user disposes" half. |
| Notifications tab | Partial | Real Move and friend rows sit on top of 14 fake rows. Real rows are capped at 8. Filter, Mark all read and Remove act on fake rows only. |
| Unread badge | Partial | It starts at a fake 4 on launch. Live notifications add to it. |
| Notification tap routing | Partial | Only Move notifications for Moves already on your map open anything. Suggestion, Moment, friend and ended-Move taps do nothing. |
| Push notifications | Partial | Push is off unless Apple push keys are set. When on, tapping a push can never find its Move (a payload format mismatch). Permission is asked at login, not in context. |
| Notification preferences / mute | Backend only, no UI | There is no quiet hours setting, Muse off switch, or mute for a person or Move. "Turn off notifications like this" only shows a snackbar. |
| Moves ended notice | Missing | Friends on their way are not told when the Move ends. |
| Share a Move link | Partial | Works on the same Wi-Fi. Links point at the laptop's LAN address, so they fail elsewhere. On ghost Moves, Share sends text with no link. |
| Loading, empty and error states | Partial | On any backend error the app silently shows fake Moves and allows fake posts. The empty map reads 'No Moves match ""'. Failed pull-ups flip back with no message. |
| Crash protection (error boundary) | Missing | Any render error is a red screen in dev and a crash in a release build. |
| Dead buttons across the shell | UI is mock only | Messenger, post comment/share/menu, story taps, Reel comment/share, map style, Menu tiles and Settings rows do nothing. The map header shows a hardcoded "73°". |
| Phones far from the seed city | Partial | More than 25 km from Menlo Park the map is empty, including your own new Move, and the composer offers far-away places as "here?". |
| Demo Control (`/demo/*` and a demo screen) | Missing | Nothing time-, calendar-, Bluetooth- or other-person-dependent can be triggered on stage. Demo time shifting is not wired. |
| Seed data: core world | Works end to end | People, Circles, places, live Moves, last night's ghost and Moments are seeded and kept fresh. |
| Seed data: history, Reels, calendar, ratings | Missing | No 8-week history or hangouts, Reels, calendar gap or ratings, so Muse learning, leaderboards and the flare have no data. |
| Seeded example Moves revive themselves | Partial | Every 5 minutes the example job puts ended seeded Moves back live, which undoes "end Tony's Move" on stage. It also adds every user to every live example Move, so the "open" one is effectively public. |
| Demo reset | Missing | The backend points at a shared remote Postgres, and a full reseed would wipe real sign-ups. |
| Realtime updates | Works end to end | Moves, joins and notifications update live, with reconnect. New Muse suggestions and Moment approvals are ignored by the client. |
| Unauthenticated user list | Partial | Anyone can list every user without logging in. Identity is a forgeable header (accepted for a hackathon). |
| Muse provenance ("Muse did this") | Missing | The backend marks drafts "muse" even when it fell back to templates, so no honest badge can be shown yet. |

## Decided against: confirmed absent

| Item | Present? | Note |
| --- | --- | --- |
| Spin-wheel restaurant picker | No | Nothing in mobile or backend. |
| Making people create events or choose from options | No | No polls, RSVPs or event creation. The empty-state copy says "No events, no RSVPs." |
| Showing live location | No | Avatars sit only at place coordinates, and no response schema has user coordinates. Tests cover this. One caveat: the map center (your rough position after the first fix) is sent to a third-party city-name lookup at 2 decimal places. |
| Fully public posting | No, for Moves | Moves have no public option. The mock Facebook post composer still offers "Public", but those posts are local mock posts, not Moves. Share links and the example-Move job widen reach (see the basics table). |
| Building on real Facebook code | No | Mocked look only. No Facebook SDK or code. |
| Positioning as a dating app | No | No dating copy or features. |
| A recording feature | No | Nothing records. The mock composer shows a "Live video" button that does nothing. Remove it to be safe. |

Also confirmed absent: Marketplace flows, Meta glasses flows, and ride or route UI. The backend route agent (F22)
still runs on every join and should be switched off.

## Appendix: where the evidence is

Each verified report holds file:line evidence and a fix plan per gap. Structured items for all areas:
`/private/tmp/claude-501/-Users-ani--claude-spares-spare-ksrc6k/c0d50052-c785-4547-bacb-ff898290d44d/scratchpad/audit_verified.json`.
Reports are in `/private/tmp/claude-501/-Users-ani--claude-spares-spare-ksrc6k/c0d50052-c785-4547-bacb-ff898290d44d/scratchpad/audit/`:

| Area | Report | Covers |
| --- | --- | --- |
| Core loop | `core-loop.verified.md` | F1-F4, post, pull up, leave, end, arrive, audience line |
| Poster journey | `journey-poster.verified.md` | Posting to ending a Move, own-Move controls, far-from-seed issue |
| New user journey | `journey-new-user.verified.md` | Sign-up, onboarding, auto-friend, stale session, pull-up lockout |
| Muse day journey | `journey-muse-day.verified.md` | Reel to flare to rating to revive, end to end |
| Map and Marks | `map-marks.verified.md` | F6-F10, ghosts, Moments, Saved Marks, place search |
| Proximity | `proximity.verified.md` | F5, F11, F12, F21 (BLE part) |
| Notifications | `notifications.verified.md` | F12-F14, inbox, badge, push, tap routing |
| Muse core | `muse-core.verified.md` | Real client state, notify picker, writer, ranker, timeouts, provenance |
| Muse proactive | `muse-proactive.verified.md` | F15, F17-F21, F31, suggestions, calendar, revive, nobody bit |
| Ratings and leaderboards | `ratings-leaderboards.verified.md` | F19, F23, ranking bug, hangout writes |
| Surfaces | `surfaces.verified.md` | F34-F46, Reels, calendar flare, fill-time bug, dead tiles |
| Privacy and trust | `privacy-trust.verified.md` | F24-F31, blocks, settings, invite links, decided-against check |
| Social and account | `social-account.verified.md` | Accounts, profiles, friends, search bug, Circles, blocking |
| Shell and navigation | `shell-nav.verified.md` | F32, Home feed, Menu, dead controls, error boundary, deep links |
| Demo, seed, realtime | `demo-seed-realtime.verified.md` | Demo Control, seeds, example-Move revival, shared Postgres, scheduler |
| API contract | `api-contract.verified.md` | Every client call against every backend route |
| Web app | `web-app.verified.md` | `frontend/web` (out of scope: mobile only), Moments rule conflict |
