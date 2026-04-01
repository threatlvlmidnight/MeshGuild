-- Sprint 15: Milestone Badge Auto-Award System
-- Commendation-type badges (RELIABILITY, FIELDCRAFT, etc.) are now granted
-- automatically when a player hits a verifiable milestone.
-- Special badges (FOUNDER, PIONEER, seasonal) are still awarded manually via the admin UI.

-- Fix missing INSERT grant from Sprint 14 (RLS already restricts to is_admin())
GRANT INSERT ON player_badges TO authenticated;

-- ─── Core milestone-check function ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION award_milestone_badges(p_id UUID)
RETURNS void AS $$
DECLARE
  _streak          INTEGER;
  _node_count      INTEGER;
  _unique_commenders INTEGER;
  _commends_given  INTEGER;
  _role            TEXT;
BEGIN
  SELECT role INTO _role FROM profiles WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Best longest_streak_days across all owned nodes
  SELECT COALESCE(MAX(n.longest_streak_days), 0) INTO _streak
  FROM node_ownership no2
  JOIN nodes n ON n.id = no2.node_id
  WHERE no2.player_id = p_id;

  -- Total owned nodes
  SELECT COUNT(*) INTO _node_count
  FROM node_ownership WHERE player_id = p_id;

  -- Unique operators who have commended this player
  SELECT COUNT(DISTINCT from_player_id) INTO _unique_commenders
  FROM player_commendations WHERE to_player_id = p_id;

  -- Total commendations this player has given to others
  SELECT COUNT(*) INTO _commends_given
  FROM player_commendations WHERE from_player_id = p_id;

  -- ── RELIABILITY: any owned node with a 14-day continuous uptime streak ─────
  IF _streak >= 14 THEN
    INSERT INTO player_badges (player_id, badge_key, badge_label, note)
    VALUES (p_id, 'RELIABILITY', 'Reliability',
            'Milestone: 14-day continuous uptime streak achieved.')
    ON CONFLICT (player_id, badge_key) DO NOTHING;
  END IF;

  -- ── FIELDCRAFT: 3 or more nodes deployed and operating ─────────────────────
  IF _node_count >= 3 THEN
    INSERT INTO player_badges (player_id, badge_key, badge_label, note)
    VALUES (p_id, 'FIELDCRAFT', 'Fieldcraft',
            'Milestone: 3 nodes deployed and operating.')
    ON CONFLICT (player_id, badge_key) DO NOTHING;
  END IF;

  -- ── SIGNAL_BOOST: has issued 5+ commendations to fellow operators ───────────
  IF _commends_given >= 5 THEN
    INSERT INTO player_badges (player_id, badge_key, badge_label, note)
    VALUES (p_id, 'SIGNAL_BOOST', 'Signal Boost',
            'Milestone: commended 5 fellow operators.')
    ON CONFLICT (player_id, badge_key) DO NOTHING;
  END IF;

  -- ── MENTORSHIP: recognized by 3+ unique guild members ──────────────────────
  IF _unique_commenders >= 3 THEN
    INSERT INTO player_badges (player_id, badge_key, badge_label, note)
    VALUES (p_id, 'MENTORSHIP', 'Mentorship',
            'Milestone: recognized by 3 or more unique operators.')
    ON CONFLICT (player_id, badge_key) DO NOTHING;
  END IF;

  -- ── LEADERSHIP: attained elder or leader standing ──────────────────────────
  IF _role IN ('elder', 'leader') THEN
    INSERT INTO player_badges (player_id, badge_key, badge_label, note)
    VALUES (p_id, 'LEADERSHIP', 'Leadership',
            'Milestone: elder or leader standing attained.')
    ON CONFLICT (player_id, badge_key) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: profiles role / renown update ─────────────────────────────────

CREATE OR REPLACE FUNCTION trg_profile_milestone_badges()
RETURNS trigger AS $$
BEGIN
  PERFORM award_milestone_badges(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profiles_award_badges ON profiles;
CREATE TRIGGER trg_profiles_award_badges
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_profile_milestone_badges();

-- ─── Trigger: node_ownership insert ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_node_ownership_milestone_badges()
RETURNS trigger AS $$
BEGIN
  PERFORM award_milestone_badges(NEW.player_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_node_ownership_award_badges ON node_ownership;
CREATE TRIGGER trg_node_ownership_award_badges
  AFTER INSERT ON node_ownership
  FOR EACH ROW EXECUTE FUNCTION trg_node_ownership_milestone_badges();

-- ─── Trigger: player_commendations insert ────────────────────────────────────
-- Checks SIGNAL_BOOST for the giver, MENTORSHIP for the recipient.

CREATE OR REPLACE FUNCTION trg_commendation_milestone_badges()
RETURNS trigger AS $$
BEGIN
  PERFORM award_milestone_badges(NEW.from_player_id);
  PERFORM award_milestone_badges(NEW.to_player_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_commendations_award_badges ON player_commendations;
CREATE TRIGGER trg_commendations_award_badges
  AFTER INSERT ON player_commendations
  FOR EACH ROW EXECUTE FUNCTION trg_commendation_milestone_badges();

-- ─── Seed existing players ────────────────────────────────────────────────────
-- Run this once after migration to check all approved operators for milestone eligibility:
--   SELECT award_milestone_badges(id) FROM profiles WHERE approved = true;
