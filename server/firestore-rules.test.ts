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

    // Client never writes Firestore: every collection denies client writes.
    for (const collection of ['users', 'creators', 'hosts', 'products', 'orders', 'contracts', 'audit_logs']) {
        const block = rules.slice(rules.indexOf(`match /${collection}/`));
        const body = block.slice(0, block.indexOf('\n    }'));
        assert.match(body, /allow write: if false;/, `${collection} must deny client writes`);
        assert.doesNotMatch(body, /allow (create|update|delete):/, `${collection} must not grant partial client writes`);
    }
    assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/, 'catch-all deny');
    // Privileged fields can never be client-written (status/price/launch).
    assert.doesNotMatch(rules, /request\.resource\.data/, 'no rule accepts client-supplied document data');
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
    for (const name of ['Creator', 'Host', 'Product']) assert.equal(entities[name].rules.write, 'false', `${name} denies client writes`);
    assert.equal(entities.Order.rules.write, 'false', 'orders deny direct client writes');
    assert.equal(entities.Contract.rules.write, 'false', 'contracts deny direct client writes');
    assert.ok(entities.Order.rules.read.includes('resource.data.consumerId'), 'orders read scoped to consumer');
    assert.ok(entities.Contract.rules.read.includes('resource.data.creatorId'), 'contracts read scoped to creator');
    assert.ok(entities.User.rules.write === 'false', 'user writes denied (server-only)');
});
