# Specification: RMB Billing System

Status: COMPLETE

## Feature: RMB Balance Billing for Image and Video Generation

### Overview
Replace the current recharge balance semantics with a formal RMB billing system. User balances should be presented in yuan, recharges should continue to use the existing Junlai payment flow, and image/video generation should charge against the account balance using fixed RMB pricing with success-time deduction.

### User Stories
- As a user, I want my account balance displayed in yuan so that recharge and consumption are financially clear.
- As a user, I want image and video generation to show estimated RMB charges before submission so that I understand the cost.
- As an operator, I want all recharges and charges recorded in a billing ledger so that account changes are auditable.

---

## Functional Requirements

### FR-1: RMB Account and Ledger Model
Keep `accounts.json` as the primary balance store, but standardize account currency to CNY and add a dedicated billing event ledger for all balance changes.

**Acceptance Criteria:**
- [x] Account balances are stored and processed in cents internally and exposed as CNY balance semantics.
- [x] A new billing events store exists and records recharge, image charge, video charge, and admin adjustment events with before/after balance data.
- [x] Recharge success and admin balance adjustments write matching billing ledger entries through the same accounting path used by charges.

### FR-2: Centralized Pricing and Balance Enforcement
Introduce a shared billing module that defines pricing and handles calculation, balance precheck, and atomic deduction.

**Acceptance Criteria:**
- [x] Image charge uses `0.15 CNY * outputCount`, where `outputCount` comes from request `n` and defaults to `1`.
- [x] Video charge uses `1.5 CNY * durationSeconds`, where the billed duration comes from request `duration`.
- [x] Balance precheck rejects requests whose current balance is lower than the estimated charge.
- [x] Atomic charge logic prevents negative balances and returns explicit failure when a prechecked request can no longer be charged.

### FR-3: Image Billing Flow
Charge image generations only after upstream generation succeeds, while still performing balance precheck before the upstream call.

**Acceptance Criteria:**
- [x] `POST /api/images/generations` performs a balance precheck before calling the upstream image service.
- [x] Successful image generations perform an atomic charge before history persistence and response success.
- [x] Upstream failure or billing failure does not create a successful image history item or consumption ledger entry.
- [x] Successful image responses include billing metadata for charged amount and currency.

### FR-4: Video Billing Flow
Video requests must expose estimated charge at creation time, but only deduct balance after the task reaches a success state.

**Acceptance Criteria:**
- [x] `POST /api/videos/generations` performs a balance precheck before creating a video task.
- [x] Video task records expose `estimatedCharge`, `chargedAmount`, and `billingStatus`.
- [x] Video tasks charge only when polling or callback logic transitions the task into success.
- [x] Failed, cancelled, timed-out, or billing-failed tasks do not expose a charged success result.

### FR-5: API Semantics and Frontend RMB UX
Keep current API routes, add billing event read access, and update the UI copy and pricing display to RMB terminology.

**Acceptance Criteria:**
- [x] `GET /api/account` returns `currency: CNY` and a RMB balance meaning without points-style wording.
- [x] A read-only `GET /api/billing/events` endpoint exposes recent ledger entries for the signed-in user.
- [x] Home, account, recharge, image, and video UI surfaces display balance and pricing in yuan and remove points/integral wording.
- [x] Image and video submit flows display estimated charge and show a consistent insufficient-balance prompt that routes users to `/recharge`.

---

## Success Criteria

- Users see balances, pricing, and recharge amounts consistently in yuan across the product.
- Successful recharge and generation flows leave balance and billing ledger state consistent.
- Failed generation flows do not deduct funds or create false consumption records.
- Concurrent requests cannot produce negative balances or mismatched balance-versus-ledger state.

---

## Dependencies
- Existing local JSON storage architecture in `src/store.js`
- Existing Junlai recharge order and callback flow
- Current image and video generation APIs and task persistence

## Assumptions
- Pricing is fixed at `0.15 CNY` per image and `1.5 CNY` per video second.
- Video billing uses requested duration rather than upstream-reported final duration.
- Local JSON persistence remains the storage mechanism for this phase.

---

## Completion Signal

### Implementation Checklist
- [x] Add or adapt backend storage and service logic for CNY accounting and billing ledger entries
- [x] Implement centralized billing calculations, precheck, and atomic charge helpers for image and video flows
- [x] Update image and video APIs to expose billing metadata and enforce the required charging behavior
- [x] Add `GET /api/billing/events` and wire ledger reads for the current user
- [x] Update frontend copy and estimated charge displays to RMB semantics
- [x] Add or update tests for pricing, recharge logging, charge timing, insufficient balance handling, and concurrency safety
- [x] Mark this spec `Status: COMPLETE` when all acceptance criteria and verification steps pass

### Testing Requirements

The agent MUST complete ALL before outputting the magic phrase:

#### Code Quality
- [x] Relevant automated tests pass
- [x] New tests added or updated for billing behavior
- [x] No lint or syntax errors in touched code

#### Functional Verification
- [x] `GET /api/account` returns RMB semantics with `currency: CNY`
- [x] Image success charges the correct amount and image failure does not charge
- [x] Video success charges the correct amount and non-success tasks do not charge
- [x] Recharge success increases balance and writes a recharge billing event
- [x] Concurrent charge scenarios do not produce negative balances or missing ledger entries

#### Visual Verification (if UI)
- [x] Desktop balance and pricing displays use yuan wording
- [x] Mobile balance and pricing displays use yuan wording

#### Console/Network Check (if web)
- [x] No new client-side console errors in touched flows
- [x] No unexpected 4xx or 5xx responses in normal recharge, image, or video flows

### Validation Commands

- `bash -n scripts/*.sh scripts/lib/*.sh`
- `npm run check`
- `npm run smoke`

### Iteration Instructions

If ANY check fails:
1. Identify the specific issue
2. Fix the code
3. Run tests again
4. Verify all criteria
5. Commit and push if possible
6. Check again

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
