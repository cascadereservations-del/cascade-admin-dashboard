// D_ demo fixtures (synthetic). Names are "Demo Guest One" and so on, never a real person. House times: check-out 12:00 noon,
// check-in 2:00 pm. Every date is built from the `now` that is passed in, so a test can freeze the clock. Money is invented.

export type Rows = Record<string, unknown>[];
export type DemoData = { tables: Record<string, Rows>; rpcs: Record<string, (args: Record<string, unknown>) => unknown> };

export const DEMO_PROPERTY_ID = '6ae230f4-c189-4547-84b1-cb6e0b2cc9bd';
export const DEMO_USER_ID = '00000000-0000-4000-8000-0000000000a1';
/** Demo reply window shown on the three sample threads: 6 d 4 h left, 45 min left, closed. */
export const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function buildDemoData(now: Date): DemoData {
  const ms = now.getTime();
  const iso = (offsetMs: number) => new Date(ms + offsetMs).toISOString();
  // Manila calendar date (UTC+8), offset by whole days.
  const day = (n: number) => new Date(ms + 8 * HOUR + n * DAY).toISOString().slice(0, 10);
  const month = (n: number) => { const d = new Date(ms + 8 * HOUR); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
  const today = day(0);

  const reservations: Rows = [
    { id: U(101), confirmation_code: 'HMDEMO0001', status: 'confirmed', guest_id: U(1), guest_name: 'Demo Guest One', guest_count: 2, checkin_date: day(-1), checkout_date: day(2), checkin_time: '14:00', checkout_time: '12:00', guest_paid: '12400.00', host_service_fee: '372.00', host_payout: '12028.00', payout_amount: null, payout_date: day(3), cancelled_at: null, refund_type: null, created_at: iso(-20 * DAY) },
    { id: U(102), confirmation_code: 'HMDEMO0002', status: 'confirmed', guest_id: U(2), guest_name: 'Demo Guest Two', guest_count: 3, checkin_date: day(4), checkout_date: day(7), checkin_time: '14:00', checkout_time: '12:00', guest_paid: '15800.00', host_service_fee: '474.00', host_payout: '15326.00', payout_amount: null, payout_date: day(8), cancelled_at: null, refund_type: null, created_at: iso(-9 * DAY) },
    { id: U(103), confirmation_code: 'HMDEMO0003', status: 'completed', guest_id: U(3), guest_name: 'Demo Guest Three', guest_count: 2, checkin_date: day(-12), checkout_date: day(-9), checkin_time: '14:00', checkout_time: '12:00', guest_paid: '11900.00', host_service_fee: '357.00', host_payout: '11543.00', payout_amount: '11543.00', payout_date: day(-8), cancelled_at: null, refund_type: null, created_at: iso(-40 * DAY) },
  ];
  const inquiries: Rows = [
    { id: U(111), guest_name: 'Demo Guest Four', guest_email: 'demo.four@example.invalid', guest_phone: '+63 900 000 0004', checkin_date: day(10), checkout_date: day(13), nights: 3, pax: 2, total_amount: '13200.00', deposit_amount: '6600.00', status: 'pending', source: 'direct', submitted_at: iso(-5 * HOUR), guest_id: U(4), receipt_image_path: null },
    { id: U(112), guest_name: 'Demo Guest Five', guest_email: 'demo.five@example.invalid', guest_phone: '+63 900 000 0005', checkin_date: day(20), checkout_date: day(22), nights: 2, pax: 2, total_amount: '8800.00', deposit_amount: '4400.00', status: 'confirmed', source: 'direct', submitted_at: iso(-3 * DAY), guest_id: U(5), receipt_image_path: null },
  ];
  const calendar: Rows = reservations.map((r, i) => ({ id: U(121 + i), uid: `demo-uid-${i}`, source: 'airbnb', checkin_date: r.checkin_date, checkout_date: r.checkout_date, guest_name: r.guest_name, status: 'confirmed', linked_reservation_id: r.id, synced_at: iso(-HOUR), raw_summary: 'Reserved' }))
    .concat([{ id: U(130), uid: 'demo-block', source: 'airbnb', checkin_date: day(14), checkout_date: day(16), guest_name: null, status: 'blocked', linked_reservation_id: null, synced_at: iso(-HOUR), raw_summary: 'Not available' }]);
  const guests: Rows = [1, 2, 3, 4, 5].map((n) => ({
    id: U(n), property_id: DEMO_PROPERTY_ID, name: ['Demo Guest One', 'Demo Guest Two', 'Demo Guest Three', 'Demo Guest Four', 'Demo Guest Five'][n - 1], phone: `+63 900 000 000${n}`, email: `demo.${n}@example.invalid`, source: n < 4 ? 'airbnb' : 'direct', tier: n === 3 ? 'returning' : null,
    total_stays: n === 3 ? 2 : 1, total_nights_stayed: 3, first_stay_date: day(-12 + n), last_stay_date: day(-12 + n), is_active: true, created_at: iso(-30 * DAY), updated_at: iso(-DAY), notes: null,
    guest_profile_details: { id_on_file: n < 3, birthday: n === 2 ? day(9).replace(/^\d{4}/, '1990') : null, contact_number: `+63 900 000 000${n}` },
  }));
  const details: Rows = guests.map((g, i) => ({ guest_id: g.id, display_name: g.name, preferred_channel: 'messenger', language: 'en', messenger_psid: null, messenger_link: null, stay_preferences: i === 0 ? 'Quiet room, late check-in' : null, tags: [], vip: false, vip_reason: null, contact_provenance: {}, updated_at: iso(-DAY), version: 1, contact_number: (g.guest_profile_details as { contact_number: string }).contact_number, birthday: (g.guest_profile_details as { birthday: string | null }).birthday, address: null, airbnb_profile_id: null, id_on_file: (g.guest_profile_details as { id_on_file: boolean }).id_on_file, id_type: null, id_number: null, id_drive_url: null, id_verified_at: null }));
  const followUps: Rows = [
    { id: U(201), property_id: DEMO_PROPERTY_ID, guest_id: U(1), booking_kind: 'airbnb', booking_id: U(101), purpose: 'welcome', title: 'Send the welcome note to Demo Guest One', detail: null, assignee_user_id: null, due_at: iso(2 * HOUR), priority: 'normal', status: 'open', completion_note: null, completed_at: null, created_at: iso(-DAY), version: 1 },
    { id: U(202), property_id: DEMO_PROPERTY_ID, guest_id: null, booking_kind: null, booking_id: null, purpose: 'reminder', title: 'Order a spare remote', detail: 'Living room TV', assignee_user_id: null, due_at: iso(3 * DAY), priority: 'low', status: 'open', completion_note: null, completed_at: null, created_at: iso(-2 * DAY), version: 1 },
  ];
  const workOrders: Rows = [
    { id: U(211), property_id: DEMO_PROPERTY_ID, source_kind: 'cleaner', source_ref: null, title: 'Bathroom tap drips', description: 'Slow drip, upstairs bathroom', priority: 'normal', assignee_user_id: null, due_at: iso(2 * DAY), blocks_arrival: false, status: 'open', evidence: [], resolution: null, resolved_at: null, created_at: iso(-DAY), updated_at: iso(-DAY), version: 1 },
  ];
  const notices: Rows = [
    { id: U(221), property_id: DEMO_PROPERTY_ID, notice_type: 'power', title: 'Brownout 1:00 to 4:00 pm', description: 'Planned maintenance by the power company', effective_date: day(2), effective_time: '13:00', duration_hours: '3', is_active: true, audience: 'staff', expires_at: null, posted_by_name: 'Demo Admin', created_at: iso(-DAY) },
    { id: U(222), property_id: DEMO_PROPERTY_ID, notice_type: 'water', title: 'Water interruption 9:00 am to noon', description: null, effective_date: day(5), effective_time: '09:00', duration_hours: '3', is_active: true, audience: 'staff', expires_at: null, posted_by_name: 'Demo Admin', created_at: iso(-DAY) },
  ];
  const cleaning: Rows = [
    { id: U(231), property_id: DEMO_PROPERTY_ID, submission_id: 'demo-sub-1', cleaner_name: 'Demo Cleaner', cleaned_at: iso(-9 * DAY), last_guest_name: 'Demo Guest Three', checkin_date: day(-12), checkout_date: day(-9), cleaning_type: 'turnover', completion_pct: '100', is_complete: true, incomplete_reasons: null, issue_count: 0, total_photo_count: 0, meter_photo_count: 0, fee_amount: '600.00', fee_paid_at: iso(-8 * DAY), fee_txn_id: null, employee_id: null, notes: null, checklist_details: {}, preclean_photo_count: 0, afterclean_photo_count: 0, other_photo_count: 0, drive_files: null, nights_stayed: 3 },
    { id: U(232), property_id: DEMO_PROPERTY_ID, submission_id: 'demo-sub-2', cleaner_name: 'Demo Cleaner', cleaned_at: iso(-30 * DAY), last_guest_name: 'Demo Guest Five', checkin_date: day(-34), checkout_date: day(-30), cleaning_type: 'turnover', completion_pct: '92', is_complete: false, incomplete_reasons: ['Balcony not swept'], issue_count: 1, total_photo_count: 0, meter_photo_count: 0, fee_amount: '600.00', fee_paid_at: null, fee_txn_id: null, employee_id: null, notes: null, checklist_details: {}, preclean_photo_count: 0, afterclean_photo_count: 0, other_photo_count: 0, drive_files: null, nights_stayed: 4 },
  ];
  const meters: Rows = [
    { id: U(241), property_id: DEMO_PROPERTY_ID, session_id: U(231), electric_prev: '1200.0', electric_curr: '1236.0', electric_delta: '36.0', water_prev: '310.0', water_curr: '313.0', water_delta: '3.0', kwh_per_night: '12.0', m3_per_night: '1.0', meter_flag: null, meter_override_note: null, recorded_at: iso(-9 * DAY) },
    { id: U(242), property_id: DEMO_PROPERTY_ID, session_id: U(232), electric_prev: '1150.0', electric_curr: '1200.0', electric_delta: '50.0', water_prev: '306.0', water_curr: '310.0', water_delta: '4.0', kwh_per_night: '12.5', m3_per_night: '1.0', meter_flag: null, meter_override_note: null, recorded_at: iso(-30 * DAY) },
  ];
  const txn = (n: number, d: number, type: string, category: string, amount: string, payee: string | null, status = 'confirmed', source = 'manual'): Record<string, unknown> => ({
    id: U(300 + n), property_id: DEMO_PROPERTY_ID, transaction_date: day(d), txn_type: type, category, status, source, gross_amount: amount, payee_name: payee, or_number: null, external_ref: null, booking_id: null, reservation_id: null, income_stage: null, notes: null, receipt_image_path: null, ocr_confidence: null, created_at: iso(d * DAY), hidden_at: null, archived_at: null,
  });
  const transactions: Rows = [
    txn(1, -8, 'income', 'accommodation', '11543.00', 'Airbnb payout', 'confirmed', 'airbnb_payout'),
    txn(2, -6, 'expense', 'utilities', '2150.00', 'Demo Power Company'),
    txn(3, -5, 'expense', 'cleaning', '600.00', 'Demo Cleaner'),
    txn(4, -3, 'expense', 'supplies', '1320.00', 'Demo Market', 'pending'),
    txn(5, -2, 'income', 'accommodation', '6600.00', 'Demo Guest Four', 'pending', 'direct_booking'),
    txn(6, -20, 'income', 'accommodation', '14200.00', 'Airbnb payout', 'confirmed', 'airbnb_payout'),
    txn(7, -35, 'expense', 'utilities', '1980.00', 'Demo Water District'),
  ];
  const accounts: Rows = [
    { id: U(401), code: '1000', name: 'Cash on hand', class: 'asset', subtype: 'cash', is_cash: true, active: true },
    { id: U(402), code: '4000', name: 'Accommodation income', class: 'income', subtype: 'revenue', is_cash: false, active: true },
    { id: U(403), code: '6000', name: 'Utilities', class: 'expense', subtype: 'opex', is_cash: false, active: true },
  ];
  const journals: Rows = [
    { id: U(411), property_id: DEMO_PROPERTY_ID, journal_no: 1, entry_date: day(-8), description: 'Airbnb payout, Demo Guest Three', status: 'posted', source_table: null, source_id: null, event_kind: null, channel: 'airbnb', evidence_ref: null, reversal_of: null, reversed_by: null, reversal_reason: null,
      lines: [{ line_no: 1, debit: '11543.00', credit: '0.00', memo: null, account: { code: '1000', name: 'Cash on hand' } }, { line_no: 2, debit: '0.00', credit: '11543.00', memo: null, account: { code: '4000', name: 'Accommodation income' } }] },
  ];
  const items: Rows = [
    { id: U(501), property_id: DEMO_PROPERTY_ID, name: 'Bath towels', category: 'linen', unit: 'pcs', qty_on_hand: '14', reorder_below: '8' },
    { id: U(502), property_id: DEMO_PROPERTY_ID, name: 'Coffee sachets', category: 'consumable', unit: 'pcs', qty_on_hand: '6', reorder_below: '20' },
  ];
  const purchases: Rows = [
    { id: U(511), item_id: U(502), purchased_at: day(-6), qty: '60', unit_cost: '4.00', total_cost: '240.00', supplier: 'Demo Market', notes: null, purchase_unit: 'box', units_per_purchase: 30 },
  ];
  const shopping: Rows = [
    { id: U(521), property_id: DEMO_PROPERTY_ID, item_id: U(502), item_name: 'Coffee sachets', quantity: '2', purchase_unit: 'box', estimated_cost: '240.00', reason: 'Low stock', status: 'proposed', proposed_at: iso(-DAY), approved_at: null, approval_note: null },
  ];
  const catalogue = {
    items: [
      { id: U(501), name: 'Bath towels', category: 'linen', unit: 'pcs', qty: '14', reorderBelow: '8', consumable: false, active: true, status: null, unitCost: '180.00', purchaseUnit: null, unitsPerPurchase: null, photo: null, movementControlled: true, baselineNote: null, usage30d: '0', usageDays: 30, avgDaily: '0', coverageDays: null, attention: false, estDailyUsage: null, estCoverageDays: null },
      { id: U(502), name: 'Coffee sachets', category: 'consumable', unit: 'pcs', qty: '6', reorderBelow: '20', consumable: true, active: true, status: null, unitCost: '4.00', purchaseUnit: 'box', unitsPerPurchase: '30', photo: null, movementControlled: true, baselineNote: null, usage30d: '24', usageDays: 30, avgDaily: '0.8', coverageDays: '7.5', attention: true, estDailyUsage: null, estCoverageDays: null },
    ],
    sourceAsOf: iso(-HOUR), forecastNote: 'Demo figures. Coverage is an estimate from recent use.', turnoverRatePerDay: 0.2,
  };
  const movements: Rows = [{ id: U(531), item_id: U(502), sequence_no: 1, kind: 'receipt', quantity_before: '0', quantity_after: '60', reason: 'Demo receipt', actor_user_id: null, created_at: iso(-6 * DAY) }];
  const audit: Rows = [
    { id: U(601), entity_table: 'ops_notices', entity_id: U(221), created_at: iso(-DAY), action: 'insert', actor_user_id: DEMO_USER_ID, reason: 'Demo notice' },
  ];
  const stay = (kind: string, id: string, code: string, name: string, gid: string | null, a: number, b: number) => ({ kind, id, code, guest: name, guestId: gid, checkin: day(a), checkout: day(b), nights: b - a });
  const overview = {
    today, sourceAsOf: iso(-HOUR), calendarSync: { syncedAt: iso(-HOUR), status: 'success', error: null },
    currentStays: [stay('airbnb', U(101), 'HMDEMO0001', 'Demo Guest One', U(1), -1, 2)],
    arrivals: [], departures: [],
    nextArrival: { ...stay('airbnb', U(102), 'HMDEMO0002', 'Demo Guest Two', U(2), 4, 7), daysUntil: 4 },
    readiness: { state: 'ready', lastCleaning: { id: U(231), cleanedAt: iso(-9 * DAY), cleaner: 'Demo Cleaner', complete: true, completionPct: '100', issues: 0 }, review: null, blockingWorkOrders: 0, lastCheckout: day(-9), nextCheckin: day(4), daysOverdue: null },
    blockingWorkOrders: [],
    lowStock: [{ id: U(502), name: 'Coffee sachets', qty: '6', unit: 'pcs', reorderBelow: '20', out: false }],
    followUps: [{ id: U(201), title: 'Send the welcome note to Demo Guest One', purpose: 'welcome', priority: 'normal', dueAt: iso(2 * HOUR), guestId: U(1), status: 'open' }],
    handoffs: [{ id: U(701), guest: 'Demo Guest Two', risk: 'priority', status: 'open', createdAt: iso(-3 * HOUR), excerpt: 'Can we arrive earlier than 2:00 pm?' }],
    finance: { pendingReviewCount: 2, pendingReviewAmount: '7920.00', paymentReviewCount: 1, unpaidCleanerFees: 1 },
    notices: [{ id: U(221), type: 'power', title: 'Brownout 1:00 to 4:00 pm', effectiveDate: day(2), expiresAt: null, audience: 'staff' }],
    actions: [
      { priority: 1, kind: 'handoff', title: 'Answer Demo Guest Two', reason: 'Asked about arriving before 2:00 pm', href: '/guests/conversations', dueAt: null, sourceKind: 'concierge_handoffs', sourceId: U(701) },
      { priority: 2, kind: 'inquiry', title: 'Review the inquiry from Demo Guest Four', reason: 'Waiting for a decision', href: '/bookings/inquiries', dueAt: null, sourceKind: 'booking_inquiries', sourceId: U(111) },
    ],
  };

  // Conversations: 6 d 4 h left, 45 min left, and a closed window. Guest turns are `at`; the window runs 7 days from the last one.
  const lastGuest = [iso(-(7 * DAY - (6 * DAY + 4 * HOUR))), iso(-(7 * DAY - 45 * 60_000)), iso(-8 * DAY)];
  const convRows = lastGuest.map((at, i) => ({ psid: `demo-psid-${i + 1}`, psid_short: `demo000${i + 1}`, guest_name: ['Demo Guest Two', 'Demo Guest Four', 'Demo Guest Three'][i], updated_at: at, last_role: 'guest', last_text: ['Can we arrive before 2:00 pm?', 'Is parking free?', 'Thank you for everything.'][i], last_guest_at: at, open_handoffs: i === 0 ? 1 : 0, human_until: null, last_risk: null }));
  const thread = (i: number) => {
    const c = convRows[i]!;
    return {
      psid: c.psid, psid_short: c.psid_short, guest_name: c.guest_name, updated_at: c.updated_at, human_until: null, last_risk: null,
      history: [{ role: 'guest', text: c.last_text, at: c.last_guest_at }, { role: 'bot', text: 'Thank you. The host will reply shortly.', at: new Date(Date.parse(c.last_guest_at) + 60_000).toISOString() }],
      handoffs: i === 0 ? [{ id: U(701), status: 'open', risk: 'priority', guest_text: c.last_text, sent_text: null, resolved_by: null, resolved_at: null, created_at: c.last_guest_at }] : [],
    };
  };

  const metric = (key: string, value: string, unit: string) => ({ key, value, unit, periodStart: month(0), periodEndExclusive: month(1), basis: 'stay', definitionVersion: 'demo', sourceAsOf: iso(-HOUR), coverage: 'complete', includedCount: 3, excludedCount: 0, warnings: [], drilldownToken: `demo-${key}` });
  const metrics = {
    propertyId: DEMO_PROPERTY_ID, periodStart: month(0), periodEndExclusive: month(1), sourceAsOf: iso(-HOUR), financeVisible: true, blockedNights: 2,
    metrics: Object.fromEntries([['occupancy', '62.5', 'percent'], ['adr', '4300', 'PHP'], ['revpar', '2690', 'PHP'], ['accommodation_revenue', '38600', 'PHP'], ['cash_received', '25300', 'PHP'], ['expected_payout', '15326', 'PHP'], ['sold_nights', '9', 'night'], ['future_booked_nights', '8', 'night'], ['average_length_of_stay', '3', 'night'], ['returning_guest_rate', '20', 'percent'], ['cancellation_rate', '0', 'percent'], ['booking_lead_time', '12', 'day']].map(([k, v, u]) => [k, metric(k!, v!, u!)])),
  };
  const taskList = {
    ok: true, manager: true, today,
    tasks: [
      { source: 'follow_up_tasks', id: U(201), kind: 'guest_follow_up', title: 'Send the welcome note to Demo Guest One', detail: null, priority: 'normal', status: 'open', due_at: iso(2 * HOUR), assignee_id: null, assignee_label: null, mine: false, created_at: iso(-DAY), completed_at: null, version: 1, blocks_arrival: false },
      { source: 'follow_up_tasks', id: U(202), kind: 'reminder', title: 'Order a spare remote', detail: 'Living room TV', priority: 'low', status: 'open', due_at: iso(3 * DAY), assignee_id: null, assignee_label: null, mine: false, created_at: iso(-2 * DAY), completed_at: null, version: 1, blocks_arrival: false },
      { source: 'work_orders', id: U(211), kind: 'work_order', title: 'Bathroom tap drips', detail: null, priority: 'normal', status: 'open', due_at: iso(2 * DAY), assignee_id: null, assignee_label: null, mine: false, created_at: iso(-DAY), completed_at: null, version: 1, blocks_arrival: false },
    ],
  };
  const rate = (id: string, from: string, base: number) => ({ id, effective_from: from, regular_rate: 600, general_rate: 900, transport_rate: base, note: null, created_at: iso(-60 * DAY) });
  const payRates = { ok: true, today, in_force: rate(U(801), day(-60), 100), next: null, history: [rate(U(801), day(-60), 100), rate(U(802), day(-300), 80)] };
  const statement = (kind: string) => ({
    meta: { generatedAt: iso(0), completeness: {} },
    body: kind === 'balance_sheet' ? { assets: [{ code: '1000', name: 'Cash on hand', amount: '25300.00' }], liabilities: [], equity: [] } : { income: [{ code: '4000', name: 'Accommodation income', amount: '38600.00' }], expenses: [{ code: '6000', name: 'Utilities', amount: '4130.00' }], rows: [{ code: '4000', name: 'Accommodation income', amount: '38600.00' }] },
  });
  const advisor = {
    from: month(0), to: month(3), today, history_start: day(-400), accounting_start: day(-200),
    months: [0, 1, 2].map((n) => ({ month: month(n), days: 30, held_nights: 0, ly_month: month(n - 12), ly_days_covered: 30, ly_airbnb_nights: 14, ly_direct_nights: 4, ly_held_nights: 0, ly_stays: 5, ly_payout_total: 76000, ly_paid_nights: 18 })),
    expenses: { window_start: month(-3), window_end: month(0), months_covered: 3, categories: [{ category: 'utilities', total: 12400, rows: 6, estimate_total: 0 }, { category: 'supplies', total: 5200, rows: 4, estimate_total: 0 }] },
    airbnb_fee: { rate: 0.03, stays: 12 },
  };
  const rateCard = { base: 4400, currency: 'PHP', deposit_pct: 50, tiers: [{ min_nights: 3, pct: 5 }, { min_nights: 7, pct: 10 }], version_id: U(901), effective_from: day(-90), promotions: [], upcoming: [] };

  return {
    tables: {
      airbnb_reservations: reservations, booking_inquiries: inquiries, calendar_events: calendar, calendar_sync_log: [{ id: U(141), synced_at: iso(-HOUR), status: 'success', source: 'airbnb', event_count: 4, error_msg: null }],
      guests, guest_profile_details: details, guest_companions: [], follow_up_tasks: followUps, concierge_handoffs: [{ id: U(701), psid: 'demo-psid-1', guest_name: 'Demo Guest Two', guest_text: 'Can we arrive before 2:00 pm?', risk: 'priority', status: 'open', created_at: iso(-3 * HOUR), resolved_by: null, resolved_at: null }],
      work_orders: workOrders, ops_notices: notices, cleaning_sessions: cleaning, meter_readings: meters, readiness_reviews: [], cleaning_verification_evidence: [], verifier_findings: [],
      transactions, acct_accounts: accounts, acct_journals: journals, acct_periods: [], acct_close_snapshots: [], acct_opening_balance_batches: [],
      inventory_items: items, inventory_purchases: purchases, inventory_shopping_list: shopping, inventory_stock_movements: movements,
      admin_audit_log: audit, admin_health_check_runs: [], job_heartbeats: [{ job_name: 'calendar-sync', last_succeeded_at: iso(-HOUR), last_error_code: null, consecutive_failures: 0, expected_interval_seconds: 3600, ops_risk: true }], client_errors: [], airbnb_email_events: [{ id: U(151), email_date: iso(-DAY), email_type: 'payout', processed_at: iso(-DAY) }],
      booking_rate_policy_versions: [{ id: U(901), effective_from: day(-90), effective_to: null, nightly_rate: '4400', terms: { tiers: rateCard.tiers, deposit_pct: 50 }, approved_at: iso(-90 * DAY) }], rate_promotions: [],
      booking_lifecycle_events: [], booking_decisions: [], guest_conversations: [], app_settings: [],
    },
    rpcs: {
      current_staff_access: () => ({ user_id: DEMO_USER_ID, role: 'owner', property_ids: [DEMO_PROPERTY_ID], disabled: false, session_current: true }),
      get_admin_overview_v1: () => overview,
      concierge_conversations_v1: () => convRows,
      concierge_thread_v1: (a) => { const i = convRows.findIndex((c) => c.psid === a.p_psid); return i < 0 ? null : thread(i); },
      tasks_list_v1: () => taskList,
      task_assignees_v1: () => ({ ok: true, staff: [{ user_id: DEMO_USER_ID, role: 'owner', label: 'Demo Owner' }] }),
      get_hospitality_metrics_v1: () => metrics,
      get_report_drilldown_v1: (a) => ({ key: String(a.p_token ?? ''), periodStart: month(0), periodEndExclusive: month(1), rows: [] }),
      get_financial_statement_v1: (a) => statement(String(a.p_statement ?? 'income')),
      get_rate_card_v1: () => rateCard,
      price_advisor_inputs_v1: () => advisor,
      admin_pay_rates_v1: () => payRates,
      list_staff_details_v1: () => [],
      admin_audit_feed_v1: () => ({ rows: [], financeVisible: true, staffVisible: true }),
      run_health_checks_v1: () => ({ ranAt: iso(0), checks: [] }),
      get_data_integrity_report: () => ({ ok: true, checks: [] }),
      get_inventory_catalogue_v1: () => catalogue,
      get_guest_timeline_v1: (a) => ({ guestId: String(a.p_guest_id ?? ''), financeVisible: true, events: [{ kind: 'stay', at: iso(-9 * DAY), source: 'airbnb', body: { code: 'HMDEMO0003', checkin: day(-12), checkout: day(-9), nights: 3, status: 'completed', accommodationTotal: '11900.00', stayKind: 'airbnb', id: U(103) } }] }),
      list_guest_companions_v1: () => [],
      staff_inquiry_payments_v1: () => [],
      preview_guest_merge_v1: () => ({ ok: true }),
    },
  };
}
