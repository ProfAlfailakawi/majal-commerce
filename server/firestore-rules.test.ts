import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('firestore.rules enforces strict rules', () => {
    const rules = fs.readFileSync('firestore.rules', 'utf8');

    // Check deny writes
    assert.ok(rules.includes('allow write: if false; // Deny direct client writes; must route through server'), 'orders/contracts must deny writes');
    assert.ok(rules.includes('allow write: if false; // Server layer handles audit logging'), 'audit_logs must deny writes');

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
