# Faculty program membership

All faculty program authorization uses `program_faculty_relations`, through the deduplicated active membership query in `lib/faculty-programs.js`. Relations, faculty and programs must be non-deleted; unresolved references do not grant access. Login continues using `faculty`.

- `GET /api/faculty/programs`: all assigned program details, with optional destination information. Empty membership returns an empty array.
- `GET /api/faculty/program?program_id=ID`: one assigned program; invalid IDs return 400 and inaccessible IDs return 404. Omitting the ID retains the legacy single-program response, ordered by arrival date and program ID descending.
- Calendar, participants, points of interest, attendance and check-in authorization use the same active membership source. Check-in creation locks the underlying relation and parent records.
- No database rows are migrated or modified by this change. The legacy mapping table is no longer read by these endpoints.

The Faculty Program app screen loads the assigned program data, supports switching between returned programs, hides missing fields and images, and contains no sample program content. Calendar event attendance uses the program-event ID; banner images use the event ID.
