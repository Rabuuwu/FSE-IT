import unittest
from ml.model import recommend


def item(key, tag, rating=0):
    return {"id": key, "title": f"Lesson {key}", "description": "", "tags": [tag], "average_rating": rating, "rating_count": int(rating > 0)}


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.materials = [item(1, "python"), item(2, "python"), item(3, "security", 5), item(4, "cloud"), item(5, "python"), item(6, "python"), item(7, "cloud")]

    def test_matching_interest_beats_popularity(self):
        result = recommend(self.materials, [{"material_id": 1}])
        self.assertEqual(result["mode"], "personalized")
        self.assertIn(result["items"][0]["id"], [2, 5, 6])
        self.assertNotIn(1, [i["id"] for i in result["items"]])
        self.assertEqual(len(result["items"]), 5)
        self.assertEqual(recommend(self.materials, [])["items"][0]["id"], 3)

    def test_low_rating_reduces_similarity(self):
        result = recommend(self.materials, [{"material_id": 1, "score": 1}])
        self.assertNotIn(result["items"][0]["id"], [2, 5, 6])

    def test_rating_overrides_duplicate_view(self):
        a = recommend(self.materials, [{"material_id": 1}, {"material_id": 1, "score": 5}])
        b = recommend(self.materials, [{"material_id": 1, "score": 5}])
        self.assertEqual(a, b)

    def test_empty_small_and_all_seen(self):
        self.assertEqual(recommend([], [])["items"], [])
        self.assertEqual(len(recommend(self.materials[:2], [])["items"]), 2)
        self.assertEqual(recommend(self.materials, [{"material_id": x["id"]} for x in self.materials])["items"], [])

    def test_neutral_history_uses_popularity_and_stable_order(self):
        self.assertEqual(recommend(self.materials, [{"material_id": 1, "score": 3}])["mode"], "popular")
        self.assertEqual(recommend(self.materials, []), recommend(list(reversed(self.materials)), []))

    def test_removed_material_does_not_affect_profile(self):
        self.assertEqual(recommend(self.materials, [{"material_id": 99, "score": 5}]), recommend(self.materials, []))


if __name__ == "__main__":
    unittest.main()
