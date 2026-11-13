# Muse search (map search bar)

The search pill at the bottom of the map (`components/moves/MovesSheet.tsx`) is no longer
"Search friends and Moves". It is a prompt box for Muse. Muse only runs when the user asks
(nothing automatic); one model call plans the request, then the server acts
deterministically with the same code the MCP tools use and the rankings. Nothing posts
without a tap (rule 6), and every draft says who will see it (rule 4).

Examples:

| Prompt | Result |
|---|---|
| "tell Divy I want to go on a run" | `draft`: a Move "going on a run" only Divy sees |
| "take me and Divyash to get coffee" | `draft`: Muse picks the coffee spot from both people's rankings |
| "who wants to go on a run?" | `people`: top friends by affinity for fitness; tap to draft a Move to them |
| "where should me and Priya eat?" | `places`: top spots by both people's rankings; tap one to draft a Move there |
| "tell Div..." (two Divs) | `clarify`: "Which Div?" with a button per person |

## API (all need `X-User-Id`)

### `POST /api/v1/muse/search`

```jsonc
// request
{
  "text": "tell Divy I want to go on a run",   // 1..300 chars
  "picks": { "Div": "u_divy" },                // optional: answers to an earlier "clarify" (name -> user id)
  "mark_id": null,                             // optional: a place picked from an earlier card
  "lat": null, "lng": null                     // optional coarse location (same rules as compose)
}
```

Response `MuseSearchResult`:

```jsonc
{
  "kind": "draft" | "people" | "places" | "clarify" | "answer",
  "message": "Here's a run for you and Divy.",  // one line to show above the card
  "source": "muse" | "heuristic",               // "heuristic" when Muse was down / fell back
  "text": "going on a run",                     // the activity, reused by /search/draft
  "draft": {                                    // kind == "draft"
    "draft_id": "d_...",
    "text": "going on a run",
    "place": "Burgess Park",
    "recipients": ["Divy Shah"],                // empty = your usual audience (Muse's picks)
    "audience": "Only Divy Shah will see this", // always show this line (rule 4)
    "expires_at": "2026-11-13T20:10:00Z"
  } | null,
  "people": [                                   // kind == "people"
    { "user_id": "u_tony", "name": "Tony Stark", "first_name": "Tony",
      "avatar_url": "", "avatar_color": "#...", "reason": "ran together 3x this month" }
  ],
  "places": [                                   // kind == "places"
    { "mark_id": "mk_kumo", "name": "Kumo Matcha", "category": "coffee",
      "score": 8.4, "reason": "you loved it · Priya rated it 8.0" }
  ],
  "clarify": {                                  // kind == "clarify"
    "field": "person" | "place" | "text",   // "text": a question with no options; reply in the box
    "name": "Div",                              // the name being clarified (field == "person")
    "question": "Which Div?",
    "options": [ { "label": "Div Patel", "user_id": "u_divp", "mark_id": null } ]
  } | null
}
```

`answer` is a plain reply (e.g. "Divy isn't on Moves yet") with no card.

Follow-ups: tapping a `clarify` option re-sends the **same** `text` with
`picks[clarify.name] = option.user_id` (person) or `mark_id = option.mark_id` (place).
Typing a free-text reply to a clarify question sends `text = original + ". " + reply`.

### `POST /api/v1/muse/search/draft`

Deterministic, no Muse call. Used when the user taps a person set or a place on a
`people` / `places` card.

```jsonc
{ "text": "going on a run", "user_ids": ["u_tony", "u_priya"], "mark_id": "mk_kumo" }
```

Returns a `MuseSearchResult` (normally `kind: "draft"`, or `clarify` with `field: "place"`
when there is no place).

### `POST /api/v1/muse/search/confirm`

```jsonc
{ "draft_id": "d_..." }   ->   { "move_id": "mv_...", "text": "going on a run" }
```

Posts the held draft exactly once (a repeat returns the same Move). 409 if the draft
expired. Cancel needs no call: drafts expire on their own.
