// Canonical, deduplicated faculty memberships. Unresolved or deleted records grant no access.
const activeFacultyPrograms = `SELECT DISTINCT relation.faculty_id, relation.program_id
  FROM program_faculty_relations relation
  INNER JOIN faculty member ON member.id = relation.faculty_id AND member.is_deleted = 0
  INNER JOIN programs assigned_program ON assigned_program.id = relation.program_id AND assigned_program.is_deleted = 0
  WHERE relation.is_deleted = 0`;
module.exports = { activeFacultyPrograms };
