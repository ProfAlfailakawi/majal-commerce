import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('firestore.rules enforces least-privilege rules', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    // No collection may be publicly readable.
    assert.ok(!/allow read:\s*if\s+true/.test(rules), 'no collection may allow public (if true) reads');

    // Users are PII: read is restricted to the owner or an admin, never any authed user.
    assert.ok(/match \/users\/\{userId\}[\s\S]*?allow read: if isOwner\(userId\) \|\| isAdmin\(\);/.test(rules),
      'users read restricted to owner or admin');

    // Client writes are denied everywhere (server Admin SDK owns writes).
    assert.ok(!/allow write:\s*if\s+isAuthenticated/.test(rules), 'no client write may be granted by auth alone');
    assert.ok(rules.includes('allow write: if false;'), 'writes denied to clients');

    // Orders / contracts reads remain owner/tenant/admin scoped.
    assert.ok(rules.includes('request.auth.uid == resource.data.consumerId'), 'orders read restricted to consumer');
    assert.ok(rules.includes('request.auth.uid == resource.data.hostId'), 'orders/contracts read restricted to host');
    assert.ok(rules.includes('request.auth.uid == resource.data.creatorId'), 'contracts read restricted to creator');

    // Admin helper checks the custom role claim as a string against the allowlist.
    assert.ok(/request\.auth\.token\.role is string/.test(rules), 'admin role claim is type-checked');
    assert.ok(/in \['ADMIN', 'SUPER_ADMIN'\]/.test(rules), 'admin role allowlist present');

    // A catch-all default-deny must terminate the ruleset.
    assert.ok(/match \/\{document=\*\*\}[\s\S]*?allow read, write: if false;/.test(rules),
      'default-deny catch-all present');
});
