import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveChecks } from './scope.mjs';

const routes = {
  always: ['gitleaks', 'osv'],
  routes: [
    { glob: 'apps/web/src/app/api/', checks: ['semgrep', 'app-authz-idor', 'app-rate-limit'] },
    { glob: 'packages/db/prisma/', checks: ['app-pii-exposure'] },
    { glob: '.github/workflows/', checks: ['plat-cd-secrets'] },
  ],
};

describe('resolveChecks', () => {
  it('always includes gitleaks + osv even for an unmatched path', () => {
    const { checks } = resolveChecks(['README.md'], routes);
    assert.ok(checks.has('gitleaks') && checks.has('osv'));
  });
  it('maps an API change to its vectors', () => {
    const { checks } = resolveChecks(['apps/web/src/app/api/events/route.ts'], routes);
    assert.ok(checks.has('semgrep') && checks.has('app-authz-idor') && checks.has('app-rate-limit'));
  });
  it('unions across multiple changed paths', () => {
    const { checks } = resolveChecks(
      ['packages/db/prisma/schema.prisma', '.github/workflows/release.yml'], routes);
    assert.ok(checks.has('app-pii-exposure') && checks.has('plat-cd-secrets'));
  });
});
