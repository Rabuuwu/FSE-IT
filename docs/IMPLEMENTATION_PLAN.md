# FSE-IT — bieżący plan

Aktualizacja: 2026-11-18. Express/PostgreSQL, statyczny frontend, osobne FastAPI ML. Implementacja obejmuje konta, moderację materiałów, role, revocation sesji, katalog i rekomendacje. Migracje 001–006. TF-IDF/cosine działa w standardowej bibliotece Pythona.

## Weryfikacja

Audyt lokalny: 26 testów JS, 6 Python, kontrola składni i build PASS. Historyczne testy PostgreSQL, Chrome i backup/restore opisano w [career-engineering-audit.md](career-engineering-audit.md) i [LOCAL_SETUP.md](LOCAL_SETUP.md). Nie powtórzono ich w audycie 2026-11-18.

## Otwarte zadania

- [x] package-lock.json jest zapisany w repozytorium; nie trzeba tworzyć go od nowa.
- [x] FSE-01: czyste npm ci offline zweryfikowane; CI i Render przełączone na npm ci (2026-11-20).
- [x] FSE-02: wspólny runner deleguje do npm test; pełny zestaw uruchomiony (2026-11-20).
- [ ] FSE-03: zweryfikować proxy/IP i limity prób na docelowym hostingu; przy wielu instancjach współdzielić budżety.
- [ ] Powtórzyć integracje i pełny przepływ Core + ML + frontend na izolowanej bazie testowej.
- [ ] Potwierdzić wynik CI dokładnego commita, dostępność klawiaturą i widok mobilny.
- [ ] Przed wdrożeniem: backup/restore, konfiguracja hostów i smoke test/rollback.

Migracje nie publikują automatycznie prywatnych treści. Testy nigdy nie korzystają z produkcyjnej bazy.

[Plan historyczny z października](IMPLEMENTATION_PLAN_2026-10-19.md) zachowuje decyzje i przebieg prac, ale nie jest bieżącą listą braków.


## Rozszerzenie produktu — 2026-11-20

Zakres i wyniki: [PRODUCT_EXPANSION.md](PRODUCT_EXPANSION.md). Implementacja nowych funkcji jest w drzewie roboczym, bez wdrożenia. Nie zamyka to bramek integracji i odbioru.

- [x] Czysta instalacja offline npm ci w osobnym katalogu; CI i Render korzystają z lockfile.
- [x] Runner FSE deleguje pełny zestaw JS do npm test.
- [x] Kod kont/recovery, nauki, quizów, ścieżek, komentarzy, powiadomień, wersji publikacji i eksportu.
- [x] Testy Node, Python, składnia i build lokalnie.
- [ ] Testy PostgreSQL, restore i browser E2E rozszerzenia — uruchomić scripts/test-product.sh poza sandboxem.
- [ ] Konfiguracja Gmail FSE i faktyczne odebranie linku; brak wysyłki w tej sesji.
- [ ] Odbiór wizualny i dostępności nowych ekranów.
- [ ] Hosting, proxy, monitoring i recovery na docelowym środowisku.
