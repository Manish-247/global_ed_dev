# Check-in API

All endpoints require `Authorization: Bearer <login token>` and JSON request bodies.
They use the existing `check_in_requests` and `check_in_responses` tables; no migration is required.

## Endpoints and screens

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/faculty/check-in-requests` | Send the new request form to all current program students |
| GET | `/api/faculty/check-in-requests?status=active` | Active request cards with counts |
| GET | `/api/faculty/check-in-requests?status=past` | Past request cards with counts |
| GET | `/api/faculty/check-in-requests/:requestId` | Request metadata, author, counts and participant responses |
| GET | `/api/student/check-in-requests?status=active&response_status=pending` | Dashboard check-in cards |
| GET | `/api/student/check-in-requests/:requestId` | Request and the authenticated student's own response |
| POST | `/api/student/check-in-requests/:requestId/response` | Submit a response |

## Create request

```json
{
  "program_id": 12,
  "check_in_type": "Safety Check",
  "message": "Please confirm you have arrived safely at your housing.",
  "request_gps_location": true,
  "expiration": { "days": 0, "hours": 0, "minutes": 30 }
}
```

`check_in_type` accepts `Safety Check` or `Attendance`. Messages are required and limited to 5,000 characters. GPS defaults to false. Omit `expiration` for 24 hours; explicit durations must be 1 minute through 30 days (hours 0–23, minutes 0–59).

Returns HTTP 201 with `id`, program, type, message, GPS flag, timestamps, status and `total`, `confirmed`, `not_confirmed`, `no_response` counts. The faculty identity comes from the token. Creation and pending recipient rows commit in one transaction.

## Lists and details

Lists accept `status=active|past|all` (default active), optional `program_id`, `limit` (1–100, default 20) and `offset` (default 0). They return `{ "items": [], "limit": 20, "offset": 0 }`. An empty list is HTTP 200.

Faculty items include counts and author first/last names. Faculty detail includes `participants`, `limit` and `offset`; paginate the participant list using those query parameters. Optional `response_status=pending|confirmed|not_confirmed` filters participants without changing the overall counts.

Student lists accept the same response-status filter and include only the student's own response fields. Student detail additionally includes their submitted location fields. Students never receive other students' responses or faculty summary counts.

`pending` is displayed as **No Response**. Active requests have stored status `active` and a future expiry. Past requests include expired, closed and cancelled requests. Expired active rows are returned as `status: "expired"` without needing a background job. Timestamps written by these endpoints are UTC and returned as ISO 8601 strings; the frontend should format them in the desired display timezone. Any preexisting rows must also use UTC for consistent interpretation.

## Submit response

```json
{
  "response_status": "confirmed",
  "response_message": "All good!",
  "location_label": "Triana",
  "latitude": 37.3826,
  "longitude": -6.0072,
  "location_accuracy_meters": 15.5
}
```

`response_status` must be `confirmed` or `not_confirmed`. The message is optional (5,000 characters maximum); location label is optional (255 maximum). GPS coordinates are optional even when requested, allowing a safety response if location permission is denied. Coordinates must be supplied together and are accepted only when the faculty requested GPS. Accuracy requires coordinates and must be nonnegative.

Returns HTTP 200 with the saved response and submission timestamp. A student can submit once per request. Concurrent submissions are serialized with database row locks; duplicate submissions return HTTP 409. Expiration is checked again in the update statement.

## Access and delivery

- JWT authentication, matching role and a non-deleted account are required.
- Faculty can create/view requests only for programs in `faculty_programs`, including requests created by other faculty in the same program.
- Students must have both a recipient row and non-deleted membership in `program_student_relations` to view/respond.
- Recipients are a snapshot of non-deleted students enrolled when the request is created. Later enrollments do not receive old requests; summary counts retain the original recipients.
- Request and student identities cannot be overridden through the body. SQL uses bound values and validated pagination.
- HTTP 400: invalid input; 401: missing/invalid token; 403: wrong role/deleted account; 404: missing or inaccessible resource; 409: duplicate response or inactive request; 500: generic server error.
- Delivery is through the student dashboard API. Fetch on dashboard load and refresh/poll while open. Push, email and SMS delivery are not configured in this repository.

## Verification

Run `npm test` for HTTP-level tests with a simulated database, covering role enforcement, program isolation, validation, atomic recipient creation, rollback, summaries, response privacy, expiry and duplicate submission guards. These tests do not write to the configured database.
