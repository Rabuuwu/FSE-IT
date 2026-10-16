"""Deterministic, sparse TF-IDF content model with weighted user interests.

Training is local to each request. No stale catalogue cache or external model service.
The implementation uses the standard library to keep a sleeping free service small.
"""
from collections import Counter
from math import log, sqrt
import re


def tokens(material):
    # Tags carry more weight than incidental words in titles/descriptions.
    words = re.findall(r"\w+", f"{material.get('title', '')} {material.get('description', '')}".lower())
    words.extend(f"tag:{tag.lower()}" for tag in material.get("tags", []) for _ in range(3))
    return Counter(words)


def recommend(materials, activity, limit=5):
    materials = sorted(materials, key=lambda item: item["id"])
    by_id = {item["id"]: item for item in materials}
    # UNION in Core can produce both viewed and rated records; a rating wins.
    history = {}
    for event in activity:
        key = event["material_id"]
        if key not in history or event.get("score") is not None:
            history[key] = event.get("score")
    candidates = [item for item in materials if item["id"] not in history]
    if not candidates:
        return {"mode": "popular", "items": []}
    counts = {item["id"]: tokens(item) for item in materials}
    frequencies = Counter(word for count in counts.values() for word in count)
    vectors = {}
    for key, count in counts.items():
        vector = {word: (1 + log(n)) * (1 + log((1 + len(materials)) / (1 + frequencies[word]))) for word, n in count.items()}
        norm = sqrt(sum(value * value for value in vector.values())) or 1
        vectors[key] = {word: value / norm for word, value in vector.items()}
    profile = Counter()
    for key, rating in history.items():
        if key not in by_id:
            continue
        # Viewed only: +1. Ratings: 1 -> -2, 2 -> -1, 3 -> 0, 4 -> +1, 5 -> +2.
        weight = 1 if rating is None else float(rating) - 3
        for word, value in vectors[key].items():
            profile[word] += value * weight
    norm = sqrt(sum(value * value for value in profile.values()))

    def popularity(item):
        return (float(item.get("average_rating") or 0), int(item.get("rating_count") or 0), -item["id"])

    if not norm:
        ordered = sorted(candidates, key=popularity, reverse=True)
        return {"mode": "popular", "items": [{"id": item["id"]} for item in ordered[:limit]]}
    def score(item):
        similarity = sum(profile[word] * value for word, value in vectors[item["id"]].items()) / norm
        return (similarity, *popularity(item))
    ordered = sorted(candidates, key=score, reverse=True)
    return {"mode": "personalized", "items": [{"id": item["id"]} for item in ordered[:limit]]}
