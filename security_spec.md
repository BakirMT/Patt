# SMART PATT BOOK — Firestore Security Specification (Phase 0)

## 1. Core Data Invariants
1. **Strict Multi-Tenant Isolation**: Every document under `/users/{userId}` and its subcollections (`persons`, `personCodes`, `transactions`, `settings`) is readable and writable exclusively by the authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
2. **Parent Existence (Master Gate)**: Subcollection single-document writes require the parent `/users/{userId}` document to exist.
3. **Unique Manual Person Code Integrity**: Creating a `Person` requires an atomic reservation document at `/users/{userId}/personCodes/{codeKey}` (`existsAfter`), and creating a `PersonCodeIndex` requires the corresponding `Person` document (`existsAfter`).
4. **No Orphan Transactions**: Creating a `Transaction` requires that `/users/{userId}/persons/{personId}` exists.
5. **Amount & Type Integrity**: Transaction `type` must be one of `GIVEN`, `RECEIVED`, `PAYABLE`, `PAID`; `amount` must be a positive finite number `> 0` and `<= 9999999999.99`; `date` must match `YYYY-MM-DD`.
6. **Immutable Ownership & Timestamps**: `ownerId` and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on update.
7. **Strict Schema Enforcement**: Shadow/ghost fields are blocked on both create (`hasOnly`) and update (`affectedKeys().hasOnly(...)`).
8. **Secure List Queries**: Every `allow list` verifies `resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Cross-User Read (`get`)**: User B attempts to read `/users/userA/persons/p1`.
2. **Cross-User List (`list`)**: User B attempts to list `/users/userA/transactions` without matching `ownerId`.
3. **Identity Spoofing on Create**: User A creates `/users/userA/persons/p1` with `ownerId: "userB"`.
4. **Shadow/Ghost Field Injection**: User A creates `/users/userA/persons/p1` with extra field `isAdmin: true`.
5. **Unverified Email Write**: Authenticated user with `email_verified: false` attempts to create a transaction.
6. **ID Poisoning**: User A attempts to create `/users/userA/persons/` with a 200-character invalid ID containing spaces/symbols.
7. **Orphan Transaction**: User A creates `/users/userA/transactions/tx1` referencing a non-existent `personId: "ghost-person"`.
8. **Invalid Transaction Amount (Negative / Zero / Huge)**: User A creates a transaction with `amount: -500` or `amount: 0`.
9. **Invalid Transaction Type**: User A creates a transaction with `type: "TRANSFER"`.
10. **Client-Forged Timestamp**: User A creates a person with `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()`.
11. **Immutable Field Tampering**: User A updates `/users/userA/transactions/tx1` attempting to mutate `createdAt` or `ownerId`.
12. **Person Creation Without Unique Code Lock**: User A creates `/users/userA/persons/p1` outside a transaction without creating `/users/userA/personCodes/{codeKey}`.
