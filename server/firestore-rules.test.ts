import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('firestore.rules enforces strict rules', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    // Check deny writes
    assert.ok(rules.includes('allow write: if false; // Deny direct client writes; must route through server'), 'orders/contracts must deny writes');
    assert.ok(rules.includes('allow write: if false; // Server layer handles audit logging'), 'audit_logs must deny writes');

    // SECURITY regression: user documents must never be readable by every signed-in account.
    assert.ok(!/match \/users\/\{userId\} \{\s*allow read: if isAuthenticated\(\);/.test(rules), 'users read must not be open to any authenticated account');
    assert.ok(rules.includes('allow read: if isOwner(userId) || isAdmin();'), 'users read restricted to owner or admin');

    // Check read access restrictions for orders
    assert.ok(rules.includes('request.auth.uid == resource.data.consumerId'), 'orders read restricted to consumer');
    assert.ok(rules.includes('request.auth.uid == resource.data.hostId'), 'orders read restricted to host');

    // Check read access restrictions for contracts
    assert.ok(rules.includes('request.auth.uid == resource.data.creatorId'), 'contracts read restricted to creator');
    assert.ok(rules.includes('request.auth.uid == resource.data.hostId'), 'contracts read restricted to host');

    // Check deny deletes
    assert.ok(rules.includes('allow delete: if false; // Delete operations route through server'), 'creators/products must deny deletes');

    // Check create rules
    assert.ok(rules.includes('allow create: if isAuthenticated() && request.auth.uid == request.resource.data.userId;'), 'creators create restricted');
    assert.ok(rules.includes('allow create: if isAuthenticated() && request.auth.uid == request.resource.data.creatorId;'), 'products create restricted');

    // Check update rules prevents transfer
    assert.ok(rules.includes('request.auth.uid == resource.data.userId &&') && rules.includes('request.auth.uid == request.resource.data.userId;'), 'creators update prevents transfer');
    assert.ok(rules.includes('request.auth.uid == resource.data.creatorId &&') && rules.includes('request.auth.uid == request.resource.data.creatorId;'), 'products update prevents transfer');
});

test('firebase-blueprint.json never carries weaker rules than firestore.rules', () => {
    const blueprint = JSON.parse(fs.readFileSync('firebase-blueprint.json', 'utf8'));
    const entities = blueprint.entities as Record<string, { rules: Record<string, string> }>;

    // SECURITY regression: the blueprint used to grant `write: request.auth != null` on
    // creators/hosts/products (any signed-in account rewrites any document, prices included)
    // and `read/write: request.auth != null` on orders/contracts (full order/contract IDOR).
    // If this file is ever deployed as a rules source, it must be at least as strict as
    // firestore.rules.
    for (const [name, entity] of Object.entries(entities)) {
        for (const [op, rule] of Object.entries(entity.rules)) {
            assert.notEqual(rule.trim(), 'request.auth != null',
                `${name}.${op} must not be a bare authenticated-only rule`);
        }
    }
    assert.equal(entities.Order.rules.write, 'false', 'orders deny direct client writes');
    assert.equal(entities.Contract.rules.write, 'false', 'contracts deny direct client writes');
    assert.ok(entities.Order.rules.read.includes('resource.data.consumerId'), 'orders read scoped to consumer');
    assert.ok(entities.Contract.rules.read.includes('resource.data.creatorId'), 'contracts read scoped to creator');
    assert.ok(entities.User.rules.write.includes('request.auth.uid == resource.id'), 'user write owner-scoped');
});
