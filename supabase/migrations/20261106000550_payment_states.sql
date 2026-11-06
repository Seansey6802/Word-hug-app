-- New enum values for the M3 payment lifecycle (own migration: new enum values
-- can't be used in the transaction that adds them).
alter type app.payment_provider add value if not exists 'fake';      -- local/test gateway, no network
alter type app.payment_status add value if not exists 'method_saved';   -- card saved (SetupIntent succeeded); nothing charged
alter type app.payment_status add value if not exists 'action_required';-- off-session auth failed / needs customer
alter type app.payment_status add value if not exists 'capture_failed';
alter type app.payment_status add value if not exists 'disputed';
