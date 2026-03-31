"""Card Drop Engine — awards collectible cards based on node performance.

Drop mechanics:
  - Top 25% nodes by weekly XP: 15% chance of card drop
  - Top 10% nodes by weekly XP: 40% chance, boosted rare/mythic odds
  - Achievement earned: guaranteed common card

Rarity tiers (normal / boosted):
  COMMON    60% / 40%
  UNCOMMON  25% / 30%
  RARE      12% / 20%
  MYTHIC     3% / 10%
"""

import random

CARD_POOL = {
    "COMMON": [
        "Signal Spark",
        "Mesh Runner",
        "Packet Mule",
        "Relay Rookie",
        "Beacon Keeper",
    ],
    "UNCOMMON": [
        "Grid Walker",
        "Night Relay",
        "Storm Rider",
        "Warden's Watch",
        "Signal Sage",
    ],
    "RARE": [
        "Backbone Node",
        "Chain Lightning",
        "Ghost Relay",
        "Archon's Grace",
    ],
    "MYTHIC": [
        "Off The Grid",
        "Eye of the Storm",
        "The Archnode",
        "Meshweaver",
    ],
}

NORMAL_WEIGHTS = {"COMMON": 60, "UNCOMMON": 25, "RARE": 12, "MYTHIC": 3}
BOOSTED_WEIGHTS = {"COMMON": 40, "UNCOMMON": 30, "RARE": 20, "MYTHIC": 10}


def _pick_card(boosted: bool = False) -> tuple[str, str]:
    """Return (card_name, rarity) using weighted random selection."""
    weights = BOOSTED_WEIGHTS if boosted else NORMAL_WEIGHTS
    rarities = list(weights.keys())
    rarity = random.choices(rarities, weights=[weights[r] for r in rarities], k=1)[0]
    card_name = random.choice(CARD_POOL[rarity])
    return card_name, rarity


class CardEngine:
    def __init__(self, writer, network_id: str):
        self.writer = writer
        self.network_id = network_id

    def drop_for_achievement(self, node_id: str, achievement_key: str):
        """Guaranteed common card drop when an achievement is earned."""
        card_name = random.choice(CARD_POOL["COMMON"])
        self.writer.insert_card(
            node_id,
            self.network_id,
            card_name,
            "COMMON",
            f"Achievement: {achievement_key}",
        )
        print(f"[card] {node_id}: dropped {card_name} (COMMON) for {achievement_key}")

    def evaluate_weekly_drops(self):
        """Evaluate card drops for all nodes based on weekly XP. Run weekly."""
        nodes = self.writer.get_all_nodes(self.network_id)
        if not nodes:
            return

        # Get weekly XP for each node
        weekly_xp = []
        for node in nodes:
            node_id = node["id"]
            xp = self.writer.get_weekly_xp(node_id)
            weekly_xp.append({"node_id": node_id, "xp": xp})

        # Sort by XP descending
        weekly_xp.sort(key=lambda x: x["xp"], reverse=True)
        total = len(weekly_xp)
        if total == 0:
            return

        top_10_cutoff = max(1, total // 10)
        top_25_cutoff = max(1, total // 4)

        for i, entry in enumerate(weekly_xp):
            if entry["xp"] == 0:
                continue

            if i < top_10_cutoff:
                # Top 10%: 40% chance, boosted rarity
                if random.random() < 0.40:
                    card_name, rarity = _pick_card(boosted=True)
                    self.writer.insert_card(
                        entry["node_id"],
                        self.network_id,
                        card_name,
                        rarity,
                        "Weekly top 10% performance",
                    )
                    print(f"[card] {entry['node_id']}: dropped {card_name} ({rarity}) — top 10%")
            elif i < top_25_cutoff:
                # Top 25%: 15% chance, normal rarity
                if random.random() < 0.15:
                    card_name, rarity = _pick_card(boosted=False)
                    self.writer.insert_card(
                        entry["node_id"],
                        self.network_id,
                        card_name,
                        rarity,
                        "Weekly top 25% performance",
                    )
                    print(f"[card] {entry['node_id']}: dropped {card_name} ({rarity}) — top 25%")
