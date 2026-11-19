# Security Specification

## 1. Data Invariants
- **Authentication**: All read and write operations require a valid, authenticated user (`request.auth != null`).
- **Device Shape**:
  - `status` must be one of `["available", "loaned", "maintenance", "retired"]`.
  - `condition` must be one of `["Excellent", "Good", "Fair", "Needs Service"]`.
  - ID and key fields must be strings with lengths within bounds (e.g., name size <= 100, serialNumber size <= 100).
- **StaffMember Shape**:
  - `email` must be a valid email format string and size <= 100.
  - `name` must be a string and size <= 100.
- **Category Shape**:
  - `name` must be a string and size <= 50.
- **Temporal Integrity**:
  - When checking out/updating device, any updated/created timestamps must align with `request.time`.

## 2. The "Dirty Dozen" Payloads
The following payloads are designed to test the boundaries of our rules and must be rejected:

1. **Unauthenticated Read**: Attempting to read `/devices/dev1` without being logged in.
2. **Unauthenticated Write**: Attempting to create `/devices/dev1` without being logged in.
3. **Malicious Ghost Field**: Creating a device document with an extra unapproved field (`isAdminDevice: true`).
4. **Invalid Status String**: Creating a device with status `"destroyed"` instead of `"available"` or `"loaned"`.
5. **Invalid Condition String**: Creating a device with condition `"Trash"` instead of approved enums.
6. **Device ID Poisoning**: Trying to create a device with a huge document ID of 5KB.
7. **Staff Email Spoofing**: Registering a staff member whose email format is invalid or too large.
8. **Negative/Huge Array Injection**: Injecting a massive array into the `history` of a device.
9. **Category Name Overflow**: Registering a category with a 10,000 character name.
10. **Device Overwrite with Nulls**: Attempting to set required fields to `null` on an existing device.
11. **Spoofed Creation Timestamp**: Trying to specify a future `createdAt` timestamp instead of the server time.
12. **Tampering with immutable ID**: Modifying the `id` property of a device during an update.

## 3. Conceptual Test Runner
```typescript
// firestore.rules.test.ts (Conceptual Test Cases)
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// Test that unauthenticated actions fail
test('unauthenticated user cannot read devices', async () => {
  const db = getUnauthenticatedDb();
  await assertFails(db.doc('devices/dev1').get());
});

test('authenticated user can read devices', async () => {
  const db = getAuthenticatedDb({ uid: 'user123' });
  await assertSucceeds(db.doc('devices/dev1').get());
});

test('cannot inject ghost field to device', async () => {
  const db = getAuthenticatedDb({ uid: 'user123' });
  await assertFails(db.doc('devices/dev1').set({
    id: 'dev1',
    name: 'MacBook Pro',
    model: 'M3 Max',
    serialNumber: 'SN123',
    category: 'Laptops',
    status: 'available',
    condition: 'Excellent',
    purchaseDate: '2026-01-01',
    location: 'Office',
    image: 'laptop',
    history: [],
    ghostField: 'malicious'
  }));
});
```
