# FSE-IT — plan realizacji i wdrożenia

Data aktualizacji: 2026-10-19. Stan odniesienia: `main`, commit `11f652e`.
Status: główne funkcje produktu i konfiguracja testów są zaimplementowane. Testy jednostkowe Node i Python oraz kontrole statyczne przechodzą. Niepotwierdzone pozostają testy na PostgreSQL, pełne E2E, odtwarzalna instalacja zależności (brak lockfile), próba odtworzenia kopii i wdrożenie zewnętrzne.

## Stan realizacji — aktualizacja 2026-10-19

| Etap | Zaimplementowano | Co blokuje zamknięcie |
| --- | --- | --- |
| 0 | `.env.example`, konfiguracja lokalnego PostgreSQL, opis startu i inwentaryzacja środowiska | Brak npm/serwera PostgreSQL w tym środowisku; lockfile i próba backup/restore otwarte |
| 1 | Fabryka aplikacji, aktualna rola z DB, `/me`, walidacja, limity żądań, CORS, bezpieczny Markdown, brak resetu, TLS/pula, testy jednostkowe | Testy prawdziwego API/PostgreSQL niewykonane |
| 2 | Kontrakt API, wspólny katalog, migracje 001–003, szkice/publikacja, CRUD, tagi, wyszukiwanie, paginacja, kontrola równoczesnej edycji | Próba migracji i pełnego przepływu na PostgreSQL z danymi testowymi |
| 3 | Wyświetlenia/kliknięcia, deduplikacja, retencja i oceny z upsert | Izolacja i równoległe zapisy wymagają testu PostgreSQL |
| 4 | Oddzielne FastAPI, TF-IDF/cosine, profil z ocen, popularność i fallback; 6 testów modelu przechodzi | Połączenie obu usług i jakość rankingu niezweryfikowane w działającym stosie |
| 5 | Responsywny katalog/edytor/viewer, panel kont, obsługa błędów, testy Playwright i CI | E2E oraz ręczny przegląd wizualny/dostępności nieprzeprowadzone |
| 6 | Build statyczny z listą dozwolonych plików, konfiguracje Render/Netlify, Dockerfile ML i procedura wydania/odzyskiwania | Brak konfiguracji hostów i bazy, próby restore oraz wdrożenia |

Wyniki odnotowane dla bieżącego checkoutu: **8/8 testów Node, 6/6 testów modelu Python**, kontrola składni JS/Python i build frontendu. Test integracyjny nie został wykonany, bo brakuje PostgreSQL i `TEST_DATABASE_URL`; to nie jest zaliczony test. Workflow CI jest zapisany, ale brak wyniku z GitHub Actions. Szczegóły i komendy: [LOCAL_SETUP.md](LOCAL_SETUP.md).

Dalsze checkboxy pozostają otwarte tam, gdzie brakuje wymaganej weryfikacji. Samo istnienie kodu nie zamyka etapu.

Przyjęte domyślne decyzje przy realizacji polecenia użytkownika: admin publikuje treści, PDF jest odnośnikiem HTTPS, stare prywatne zasoby pozostają odrębne. Użytkownik może odczytać własne przeniesione szkice. Żadnych danych nie opublikowano automatycznie.

Zmiana wykonawcza: TF-IDF i cosine zaimplementowano w standardowej bibliotece Pythona zamiast instalować scikit-learn/Pandas. Zachowuje to cel modelu podobieństwa treści, zmniejsza zależności i umożliwiło sprawdzenie modelu offline. Nie stosujemy cache modelu: nowe dane są uwzględniane przy następnym żądaniu.

Stare widoki zastąpiono wspólnym ekranem; stare URL-e przekierowują. Archiwalne endpointy artykułów/kursów są tylko do odczytu, a zapis zwraca 410 i wskazuje `/materials`; treści i etapy przechowujemy w nowym katalogu. Edytor obsługuje podstawowy bezpieczny Markdown, bez dawnego SimpleMDE i importu/eksportu plików. To ograniczenie obecnej implementacji.


## 1. Cel i źródła wymagań

Zbudować system zarządzania materiałami edukacyjnymi IT: katalog, wyszukiwanie i tagi, role użytkownika i administratora, oceny oraz rekomendacje dopasowane do aktywności. Projekt ma demonstrować pełny przepływ frontend → API → PostgreSQL → Python ML, automatyczne testy i rozdzielony hosting w ramach darmowych limitów.

Źródłem celu jest `README.md`, szczególnie Functional Requirements & Operational Mechanics i Zero-Cost Technical Architecture. `TECHNICAL_DOCUMENTATION.md` oraz `RENDER_DEPLOYMENT.md` opisują dotychczasową realizację. Plan powstał także na podstawie odczytu API, middleware, konfiguracji i frontendów. W repozytorium nie znaleziono oddzielnego wcześniejszego planu. Deklaracje dokumentacji nie są dowodem działania aplikacji.

Zachowujemy istniejące artykuły, kursy i etapy kursów. Uzupełniają pierwotny katalog odnośników i PDF-ów. Nie przepisujemy aplikacji na inny framework bez konkretnej potrzeby.

## 2. Stan obecny i luki (aktualizacja 2026-10-19)

| Obszar | Stan kodu | Pozostała weryfikacja/praca |
| --- | --- | --- |
| Uwierzytelnianie i role | Express, bcrypt, JWT, rejestracja/logowanie, odświeżana rola z bazy, limity, CORS i `/me` | Pełny test integracyjny na PostgreSQL |
| Katalog i treści | Wspólny katalog, CRUD administracyjny, tagi, wyszukiwanie, paginacja, szkice/publikacja oraz adapter odczytu artykułów/kursów | Pełny przepływ i migracja na testowej kopii bazy |
| Frontend | Katalog, edytor/viewer, konta, oceny i rekomendacje; build statyczny publikuje dozwoloną listę plików | Browser E2E, przegląd mobilny i dostępności |
| Bezpieczeństwo treści | Walidacja danych/URL i bezpieczne formatowanie Markdown | Weryfikacja w E2E oraz niezależny przegląd bezpieczeństwa |
| Aktywność i oceny | Endpointy aktywności, deduplikacja i oceny 1–5 | Test współbieżności i izolacji na PostgreSQL |
| ML | Osobne API Python, deterministyczny TF-IDF/cosine, fallback i testy jednostkowe | Test połączenia w pełnym stosie i ocena jakości na danych reprezentatywnych |
| Baza | Migracje wersjonowane i raportowanie | Próba migracji na kopii, backup/restore oraz test integracyjny |
| Testy i CI | Testy Node/Python, integracyjne i E2E oraz workflow CI | Wynik pełnego CI; lockfile i instalacja z `npm ci` |
| Hosting | Konfiguracje builda/usług i procedura wdrożenia opisana w dokumentacji | Wybrać i skonfigurować rzeczywiste usługi/domeny; wykonać smoke test i rollback |

Weryfikacja kodu i testów jednostkowych nie potwierdza działania połączeń między usługami, migracji ani wdrożenia produkcyjnego. Nie wykonano tu operacji na istniejącej bazie ani zewnętrznym hostingu.

## 3. Przyjęty kierunek i decyzje produktowe

Domyślny zakres realizacji wynikający z README:

- Frontend HTML/CSS/JS, Core API Node.js/Express, PostgreSQL, osobne API ML Python/FastAPI ze scikit-learn.
- Zwykły użytkownik przegląda opublikowany katalog, wyszukuje, filtruje i ocenia. Administrator zarządza katalogiem i użytkownikami. Na pierwszą wersję tworzenie i publikowanie treści jest dostępne administratorowi. Obecne autorstwo i treści użytkowników zostają zachowane w migracji; nie nadajemy im automatycznie publicznej widoczności.
- Jeden katalog obejmuje materiały zewnętrzne, artykuły lokalne i kursy. PDF jest odnośnikiem HTTPS; upload i składowanie plików nie wchodzą do pierwszej wersji.
- Oceny: jedna aktualna ocena 1–5 użytkownika na materiał, z możliwością zmiany i usunięcia. Historia wyświetleń nie jest publiczna.
- Pięć rekomendacji, gdy istnieje co najmniej pięć odpowiednich nowych materiałów; przy mniejszym katalogu zwracamy mniej, bez duplikatów i sztucznego uzupełniania.

Implementacja przyjęła powyższe ustawienia jako domyślny zakres MVP: treści publikuje administrator, prywatne zasoby użytkowników są zachowane oddzielnie, a PDF jest odnośnikiem HTTPS. To założenia produktu zapisane w kodzie, nie wynik odbioru przez użytkownika. Migracje nie publikują automatycznie dawnych prywatnych rekordów. Zmiana tych założeń wymaga osobnego zakresu prac.

## 4. Granice architektury

Przeglądarka komunikuje się z Core API. Core API odpowiada za tożsamość, uprawnienia, katalog, aktywność i oceny oraz pobiera rekomendacje z osobnego API Python. Przeglądarka nie łączy się z bazą ani bezpośrednio z usługą ML. Core ustala użytkownika z sesji i ponownie sprawdza widoczność zwracanych materiałów.

PostgreSQL przechowuje wspólny katalog, treści artykułów i kursów z etapami, tagi, oceny i aktywność. Migracje są jawne i wersjonowane. Usługa ML ma ograniczone poświadczenie do odczytu potrzebnych danych. Szczegóły tras i formatów są w [API.md](API.md).

## 5. Pozostałe kryteria zamknięcia

To są otwarte bramki weryfikacyjne i wydaniowe, a nie twierdzenie, że implementacja tych funkcji nie istnieje:

- [ ] Dodać i przejrzeć `package-lock.json`; potwierdzić czystą instalację `npm ci`.
- [ ] Uruchomić `npm run test:integration` na odizolowanej bazie PostgreSQL `_test`; potwierdzić migracje, uprawnienia, widoczność szkiców i transakcje.
- [ ] Uruchomić pełny przepływ E2E (Core + ML + frontend + testowa baza) i ocenić mobilny widok oraz dostępność klawiaturą.
- [ ] Uruchomić zapisane GitHub Actions na aktualnym commicie i sprawdzić artefakty błędów/ślady.
- [ ] Wykonać kopię bazy testowej i próbę jej odtworzenia, a następnie ponownie sprawdzić migracje.
- [ ] Przed wydaniem wybrać i skonfigurować hosty, domeny, sekrety oraz bazę; wykonać smoke test i sprawdzony rollback. Nie wdrażać produkcyjnie bez konfiguracji i zgody na konkretną usługę.

Warunek zamknięcia projektu: wszystkie bramki powyżej mają wynik i dowód w dokumentacji, a użytkownik potwierdził odbiór produktu. Do tego czasu status brzmi „implementacja gotowa do pełnej weryfikacji”, nie „wydanie produkcyjne”.

## 6. Dziennik realizacji

| Data | Zakres | Weryfikacja | Pozostałe |
| --- | --- | --- | --- |
| 2026-10-16 | Katalog, oceny, ML, bezpieczeństwo, migracje, interfejs, testy i konfiguracja wydania | 7 testów Node, 6 testów Python, składnia i build | Pełny stos, lockfile, kopia/restore, wdrożenie |
| 2026-10-19 | Porównanie dokumentacji z aktualnym repozytorium; aktualizacja README i statusu planu | Odczyt `main` / `11f652e`; zachowano zakres funkcji i rozdzielono implementację od dowodów działania | Uruchomić testy lokalne dostępne w tym środowisku; pełna baza/E2E wymagają Node/npm i PostgreSQL |
| 2026-10-19 | Walidacja `TRUST_PROXY_HOPS`; błędna konfiguracja nie przechodzi już do Express jako `NaN` lub ujemna liczba | 8 testów Node, 6 Python, kontrola składni, build frontendu i `git diff --check` przechodzą | Lockfile oraz testy DB/E2E nadal wymagają brakujących narzędzi/środowiska |

Nie wpisywać do dokumentacji sekretów, danych osobowych ani zawartości `.env`. Nie uruchamiać testów na produkcyjnej bazie. Migracje i publikacja treści pozostają jawnie kontrolowane.
