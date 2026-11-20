# FSE-IT — rozszerzenie produktu

Zakres zaakceptowany 2026-11-20. Zachowujemy Express/PostgreSQL, statyczny frontend i Python ML. Istniejące lokalne zmiany dokumentacji pozostają zachowane.

## Kolejność i kryteria

1. Konta: reset i potwierdzanie e-maila, serwerowe wylogowanie; tokeny jednorazowe, bez sekretów w logach, izolacja użytkowników.
2. Moderacja: zarządzanie komentarzami, paginacja, zgłoszenia, dziennik decyzji i prywatne powiadomienia.
3. Nauka: zakładki, postęp etapów, kontynuacja, notatki; wyświetlenie nie oznacza ukończenia, zmiana treści nie zalicza automatycznie nowej wersji.
4. Katalog i autorstwo: metadane, sortowanie, aktualność, odzyskiwanie szkiców, wersjonowanie, eksport własnych danych.
5. Rozwój edukacyjny: ścieżki, quizy, preferencje rekomendacji i raporty autora.
6. Weryfikacja: testy jednostkowe, dedykowana baza *_test, E2E, build; osobno wdrożenie i faktyczne dostarczenie poczty.

Poza zakresem: płatności, certyfikaty, aplikacja mobilna, czat, asystent AI, wykonywanie kodu użytkowników, hosting filmów/PDF. Nie usuwamy danych legacy ani nie publikujemy szkiców migracją. Nie tworzymy automatycznie płatnych usług.

Źródła kierunku: [Moodle completion](https://docs.moodle.org/400/en/Activity_completion), [Open edX APIs](https://docs.openedx.org/projects/edx-platform/en/latest/references/lms_apis.html), [Moodle question banks](https://docs.moodle.org/500/en/Question_banks). To inspiracje, nie zależności runtime.

## Stan wykonania i dowody — 2026-11-20

Zaimplementowano moduły `server/learning.js`, `server/recovery.js`, `server/revisions.js`, walidację, migracje007–009 i interfejsy `learning.html`, `recovery.html`, rozszerzenia materiału/edytora/dashboardu. Zakres obejmuje wszystkie sześć etapów powyżej na poziomie kodu; **nie jest to deklaracja pełnego odbioru ani wdrożenia**.

- `./_tools/devhouse test FSE-IT`: 33 testy Node PASS, 6 historycznych testów modelu PASS, składnia/build PASS. Runner został poprawiony w `_tools/devhouse` (poza repo FSE, jako element FSE-02).
- Po dodaniu regresji zainteresowań `npm run test:ml`: **7 PASS**.
- `npm ci --offline --prefix .local/clean-install --logs-dir .local/npm-logs --no-audit --no-fund`: **100 pakietów, exit0**; oddzielny ignorowany katalog z kopią manifestu/lockfile, bez nadpisywania bieżących node_modules.
- `npm run check`: **50 źródeł JS PASS**, kompilacja Python i odnośniki HTML PASS.
- `npm run build`: **PASS**. `git diff --check`: **PASS**.
- `initdb` dedykowanego klastra testowego: **BLOCKED**, macOS sandbox odrzucił `shmget: Operation not permitted`. Nowe migracje i testy integracyjne nie zostały tutaj wykonane. Nie użyto zastępczo produkcyjnej bazy.
- Dodano pięć scenariuszy PostgreSQL (nauka/izolacja, quiz, wersje, komentarze, recovery/logout) i real-stack `tests/learning_e2e.py`. Ich wynik pozostaje **NIEWERYFIKOWANY** do uruchomienia `bash scripts/test-product.sh` w zwykłym terminalu. Skrypt obejmuje także dotychczasowe E2E i restore.
- Nie wykonano nowego audytu CVE, wdrożenia, live Gmail ani oceny jakości ML na rzeczywistych użytkownikach.

## Świadome ograniczenia pierwszej implementacji

- Ścieżki są prywatne, tworzone z kolejności ID materiałów; nie są publicznym programem kompetencji. Brak drag-and-drop i edycji kolejności istniejącej ścieżki.
- Quizy są treningowe, edytor administratora obsługuje dwie opcje na pytanie (API2–6), zapis zastępuje quiz i tworzy nową wersję. To nie egzamin/certyfikacja.
- Postęp jest ręczny i zależny od wersji, bez automatycznego uznawania wyświetleń za naukę. Zmiana metadanych przez pełną podmianę także podnosi wersję.
- Kopia edytora jest prywatną kopią w tej przeglądarce, przypisaną do użytkownika i materiału, przywracaną jawnie. Nie jest synchronizacją między urządzeniami. Wylogowanie usuwa lokalne kopie.
- JSON export zachowuje własne stare zasoby; destrukcyjna konwersja legacy nie została wykonana. Brak importu plików i automatycznego publikowania starych danych.
- Ranking ma zainteresowania i wykluczenia, lecz nie ma dowodu jakości z reprezentatywnego benchmarku.
- Limity pozostają procesowe; proxy i odporność wielu instancji wymagają osobnej konfiguracji. JWT pozostaje w localStorage.
- Poczta wymaga własnej konfiguracji FSE; accepted oznacza przyjęcie przez Gmail, nie dostarczenie. Zatrzymany/uśpiony Core nie wysyła wiadomości.

Dalsza kolejność: uruchomić test-product → naprawić ewentualne regresje → odbiór widoków desktop/mobile/klawiatura → backup i jawna migracja wybranego wdrożenia → smoke test i poczta live. Nie wykonywać push/deploy jako substytutu tych kontroli.
