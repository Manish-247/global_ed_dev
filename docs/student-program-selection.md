# Mobile app handoff: student program selection

Update the student app to support multiple enrolled programs. The API now uses
`program_student_relations` instead of `student_programs`. All requests continue
to use `Authorization: Bearer <token>`; student identity comes from the token.

## Load the selector

Call `GET /api/student/programs` after login. It returns an array (including `[]`
when there are no enrollments), with one entry per non-deleted enrolled program:

```json
[
  {
    "program_id": 12,
    "program_zoho_id": "crm-program-id",
    "program_student_relation_id": 34,
    "program_code": "EXAMPLE",
    "program_title": "Example Program",
    "program_banner_image_url": null,
    "arrival_date": "2027-01-10",
    "departure_date": "2027-05-15",
    "term": "Spring",
    "year": "2027",
    "program_status": "Active"
  }
]
```

This is an illustrative response, not live student data. Titles, dates, term,
and year use enrollment JSON values when populated, otherwise program values.
Dates are `YYYY-MM-DD` or null. Keep Zoho IDs as strings.

Use `program_title` as the dropdown label, adding term/year or program code to
distinguish similar names. Use **program_id**, the local program ID, as its value;
do not send the relation ID or Zoho ID. Restore the saved selection only when it
still appears in the returned list. Otherwise select the first returned program.
For one program, select it automatically. For an empty list, show “No programs
assigned” and do not request program screens.

## Scope requests

The following endpoints now require `?program_id=<selectedProgramId>`:

- `GET /api/student/profile`
- `GET /api/student/program`
- `GET /api/student/academics`
- `GET /api/student/staff`
- `GET /api/student/housing`
- `GET /api/student/internship`
- `GET /api/student/events`
- `GET /api/student/point_of_interests`

Example: `GET /api/student/events?program_id=12`.

Each event also includes `staff_id` (number or null), `staff_name` (string or null,
resolved from the assigned staff record), `staff_comments` (string or
null), and `additional_comments` (string or null) from `program_events`. Pass
these fields to the single-event screen's information section and hide empty
comment fields. Use `id` to identify the program event; `event_id` identifies the
underlying event template.

Existing response shapes remain: staff/events/points of interest return arrays;
the other detail endpoints return objects. Program details also include the
selector fields above. Profile includes `program_id` and the selected title.

Also pass `program_id` to `GET /api/student/check-in-requests`, alongside existing
status/pagination filters. Its response remains `{ items, limit, offset }`.
Omitting this filter still intentionally lists check-ins across enrolled programs.
Check-in detail and response endpoints continue using the request ID and validate
membership in that request's program; their payloads are unchanged.

`/documents`, `/health`, and `/emergency_details` remain student-level endpoints
and do not require a program selection. The current document-status table has no
program key, so document status must not be presented as program-specific.

## Switching and errors

Store selection per logged-in account and clear it on logout. When it changes,
clear old program data, cancel or ignore stale requests, and refetch all relevant
screens, including profile and check-ins. Include both student identity and
program ID in cache keys. Never display a previous program's data while loading.

- `400`: required program ID is missing or invalid; fix the request.
- `401`: use the existing authentication flow.
- `403`: the authenticated role is not allowed.
- `404` with `message: "Program not found"`: selection is inaccessible/deleted;
  refresh the program list and reset selection if necessary.
- Other detail `404` responses: show that section's empty state. Existing list
  screens may also return `404` when they have no rows.

## Placement limitation

The inspected relation JSON has `Program_Housing`, but all current values are
null and no populated placement structure or internship mapping is available.
Housing/company links currently live on `students`. The API only returns these
legacy placements when `students.program_lookup_id` matches the selected program.
For other programs, profile placement fields are null and housing/internship
details return `404`. Show “Not assigned”; never reuse another program's placement.
Supporting separate placements requires a populated, defined per-enrollment
mapping and a corresponding backend update.

## Backend verification and rollout

The schema and read-only endpoints were checked against the host currently in
`.env`: `globaled-db-clone.ckl4w6egi728.us-east-1.rds.amazonaws.com`.
`db.js` already reads `DB_HOST` and `DB_PORT`; no host is hardcoded or changed.
Restart the API process after changing environment values, and update any hosted
environment configuration separately. Deploy the backend and mobile changes
together: older clients that omit program_id on scoped screens receive `400`.
No database data or schema was modified by this change.
