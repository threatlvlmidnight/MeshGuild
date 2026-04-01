-- Grant the Founder badge to an operator.
-- 1. Run sprint14-player-badges.sql first.
-- 2. Replace YOUR_CALLSIGN_HERE with the actual callsign, then run this file.

INSERT INTO player_badges (player_id, badge_key, badge_label, note)
SELECT
  id,
  'FOUNDER',
  'Founder',
  'Original architect of the Mesh Guild.'
FROM profiles
WHERE callsign = 'YOUR_CALLSIGN_HERE'
ON CONFLICT (player_id, badge_key) DO NOTHING;
