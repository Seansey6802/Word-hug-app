-- A delivered video whose 30-day availability has ended and whose file was deleted.
-- (Separate migration: a new enum value can't be used in the transaction that adds it.)
alter type app.video_status add value if not exists 'expired';
