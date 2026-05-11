import {
  migrationRepositories,
  migrationMemberships,
  migrationPermissionGrants,
  REPOSITORY_VISIBILITY_VALUES,
  MEMBERSHIP_ROLE_VALUES,
  migrations,
} from './schema';

describe('repository / membership / permission-grant schema migrations', () => {
  describe('migration SQL structure', () => {
    it('creates repository table with idempotent DDL', () => {
      expect(migrationRepositories).toContain(
        'CREATE TABLE IF NOT EXISTS repository',
      );
      expect(migrationRepositories).toContain('id TEXT PRIMARY KEY');
      expect(migrationRepositories).toContain('name TEXT NOT NULL');
      expect(migrationRepositories).toContain("DEFAULT 'private'");
    });

    it('creates membership table with idempotent DDL', () => {
      expect(migrationMemberships).toContain(
        'CREATE TABLE IF NOT EXISTS membership',
      );
      expect(migrationMemberships).toContain('id TEXT PRIMARY KEY');
      expect(migrationMemberships).toContain(
        'REFERENCES repository(id)',
      );
      expect(migrationMemberships).toContain('UNIQUE(repository_id, user_id)');
    });

    it('creates permission_grant table with idempotent DDL', () => {
      expect(migrationPermissionGrants).toContain(
        'CREATE TABLE IF NOT EXISTS permission_grant',
      );
      expect(migrationPermissionGrants).toContain('id TEXT PRIMARY KEY');
      expect(migrationPermissionGrants).toContain(
        'REFERENCES repository(id)',
      );
      expect(migrationPermissionGrants).toContain(
        'UNIQUE(repository_id, grantee_user_id, resource_type, resource_id, action)',
      );
    });
  });

  describe('schema constraints', () => {
    it('enforces repository visibility values at schema level', () => {
      for (const v of REPOSITORY_VISIBILITY_VALUES) {
        expect(migrationRepositories).toContain(`'${v}'`);
      }
    });

    it('enforces membership role values at schema level', () => {
      for (const r of MEMBERSHIP_ROLE_VALUES) {
        expect(migrationMemberships).toContain(`'${r}'`);
      }
    });
  });

  describe('unified migration registration', () => {
    it('registers repository migration in unified migrations array', () => {
      expect(migrations).toContain(migrationRepositories);
    });

    it('registers membership migration in unified migrations array', () => {
      expect(migrations).toContain(migrationMemberships);
    });

    it('registers permission_grant migration in unified migrations array', () => {
      expect(migrations).toContain(migrationPermissionGrants);
    });

    it('orders repository migration before membership and permission_grant', () => {
      const repoIdx = migrations.indexOf(migrationRepositories);
      const memberIdx = migrations.indexOf(migrationMemberships);
      const grantIdx = migrations.indexOf(migrationPermissionGrants);
      expect(repoIdx).toBeLessThan(memberIdx);
      expect(repoIdx).toBeLessThan(grantIdx);
    });
  });
});
