# FSE-IT — plan realizacji i wdrożenia

Data opracowania: 2026-10-16. Stan odniesienia: `main`, commit `d1c4b1a`.
Status: implementacja lokalna przygotowana; część weryfikacji zakończona. Migracje na rzeczywistej bazie, pełne E2E, lockfile i wdrożenie zewnętrzne pozostają otwarte.

## Stan realizacji — aktualizacja 2026-10-16

| Etap | Zaimplementowano | Co blokuje zamknięcie |
| --- | --- | --- |
| 0 | `.env.example`, konfiguracja lokalnego PostgreSQL, opis startu, inwentaryzacja braku konfiguracji/sekretów i narzędzi | Brak npm/sieci, lockfile, istniejącej bazy oraz próby backup/restore |
| 1 | Fabryka aplikacji, aktualna rola z DB, naprawiony `/me`, walidacja, ograniczenia żądań, CORS, bezpieczny Markdown, brak resetu, TLS/pula, testy | Testy prawdziwego API/PostgreSQL niewykonane |
| 2 | Kontrakt API, wspólny katalog, migracje 001–003, szkice/publikacja, CRUD, tagi, wyszukiwanie, paginacja, kontrola równoczesnej edycji | Migracja rzeczywistych danych i odbiór pełnego przepływu |
| 3 | Wyświetlenia/kliknięcia, deduplikacja, retencja, oceny z upsert, demonstracyjny przepływ w E2E | Weryfikacja izolacji/równoległych zapisów na PostgreSQL |
| 4 | Oddzielne FastAPI, TF-IDF/cosine, profil z ocen, popularność i fallback; 6 testów modelu przechodzi | Test połączenia obu usług i pomiar poza zbiorem testowym |
| 5 | Wspólny responsywny katalog/edytor/viewer, panel kont, prywatne zasoby, obsługa błędów, Python Playwright i CI | Lokalny Chrome kończy uruchomienie SIGABRT; E2E i ocena wizualna niewykonane |
| 6 | Build statyczny z listą dozwolonych plików, konfiguracje Render/Netlify, Dockerfile ML, procedura wydania i odzyskiwania, analiza limitów dostawców | Brak konfiguracji kont/DB; niepotwierdzony komplet czterech darmowych platform; brak publikacji |

Wyniki: **7/7 testów Node, 6/6 testów modelu Python**, kontrola składni JS/Python i build frontendu. Test integracyjny odmówił startu bez jawnego `TEST_DATABASE_URL`; nie jest zaliczony. CI jest zapisane, ale nie było uruchomione na GitHubie. Szczegóły i komendy: [LOCAL_SETUP.md](LOCAL_SETUP.md).

Dalsze checkboxy pozostają otwarte tam, gdzie brakuje wymaganej weryfikacji. Samo istnienie kodu nie zamyka etapu.

Przyjęte domyślne decyzje przy realizacji polecenia użytkownika: admin publikuje treści, PDF jest odnośnikiem HTTPS, stare prywatne zasoby pozostają odrębne. Użytkownik może odczytać własne przeniesione szkice. Żadnych danych nie opublikowano automatycznie.

Zmiana wykonawcza: TF-IDF i cosine zaimplementowano w standardowej bibliotece Pythona zamiast instalować scikit-learn/Pandas. Zachowuje to cel modelu podobieństwa treści, zmniejsza zależności i umożliwiło sprawdzenie modelu offline. Nie stosujemy cache modelu: nowe dane są uwzględniane przy następnym żądaniu.

Stare widoki zastąpiono wspólnym ekranem; stare URL-e przekierowują. Archiwalne endpointy artykułów/kursów są tylko do odczytu, a zapis zwraca 410 i wskazuje `/materials`; treści i etapy przechowujemy w nowym katalogu. Edytor obsługuje podstawowy bezpieczny Markdown, bez dawnego SimpleMDE i importu/eksportu plików. To ograniczenie obecnej implementacji.


## 1. Cel i źródła wymagań

Zbudować system zarządzania materiałami edukacyjnymi IT: katalog, wyszukiwanie i tagi, role użytkownika i administratora, oceny oraz rekomendacje dopasowane do aktywności. Projekt ma demonstrować pełny przepływ frontend → API → PostgreSQL → Python ML, automatyczne testy i rozdzielony hosting w ramach darmowych limitów.

Źródłem celu jest `README.md`, szczególnie Functional Requirements & Operational Mechanics i Zero-Cost Technical Architecture. `TECHNICAL_DOCUMENTATION.md` oraz `RENDER_DEPLOYMENT.md` opisują dotychczasową realizację. Plan powstał także na podstawie odczytu API, middleware, konfiguracji i frontendów. W repozytorium nie znaleziono oddzielnego wcześniejszego planu. Deklaracje dokumentacji nie są dowodem działania aplikacji.

Zachowujemy istniejące artykuły, kursy i etapy kursów. Uzupełniają pierwotny katalog odnośników i PDF-ów. Nie przepisujemy aplikacji na inny framework bez konkretnej potrzeby.

## 2. Stan obecny i luki

| Obszar | Potwierdzony stan kodu | Potrzebne prace |
| --- | --- | --- |
| Uwierzytelnianie | Express, bcrypt, JWT, rejestracja i logowanie | Walidacja, limity prób, bezpieczna konfiguracja i testy |
| Role | `users.role_id` i tabela `roles` | Naprawić `/me`, który odczytuje nieistniejące w deklarowanym schemacie `users.role`; spójna kontrola uprawnień |
| Zasoby | Prywatne rekordy `resources.data` JSONB, tworzenie i usuwanie | Katalog dla użytkowników, jawne metadane, szczegóły, edycja, tagi, wyszukiwanie, paginacja |
| Artykuły i kursy | Tworzenie, listy, szczegóły, usuwanie, edytor Markdown | Edycja i publikacja; `published` jest odbierane, ale niezapisywane; transakcje zapisu kursów |
| Frontend | Logowanie, dashboard, kreator, przeglądarka, panel admina | Spójna nawigacja, kontrakty, katalog, oceny, rekomendacje, obsługa błędów |
| Bezpieczeństwo treści | Wiele implementacji Markdown i użyć `innerHTML` | Sanitizacja Markdown, danych i URL; dokumentacja obecnie przecenia kompletność zabezpieczeń |
| Aktywność i oceny | Brak odpowiednich endpointów i modelu | Zapis wyświetleń, ocen i historii dla ML |
| ML | Brak modułu Python | Osobna usługa, ranking, fallback i testy jakości |
| Baza | Tworzenie tabel podczas startu API | Wersjonowane migracje, bezpieczne przeniesienie danych, indeksy, kopia i odtworzenie |
| Testy i CI | `npm test` jest atrapą kończącą się błędem | Testy jednostkowe, integracyjne, E2E oraz CI |
| Hosting | Wpisane adresy Netlify i Render; instrukcja zawiera błędną ścieżkę `js/config.js` | Zweryfikować rzeczywiste wdrożenia, domeny, limity i konfigurację |

Ocena jest statyczna. Nie uruchomiono aplikacji, testów ani połączenia z bazą; nie zweryfikowano środowiska produkcyjnego i ofert hostingu.

## 3. Przyjęty kierunek i decyzje do potwierdzenia

Domyślny zakres realizacji wynikający z README:

- Frontend HTML/CSS/JS, Core API Node.js/Express, PostgreSQL, osobne API ML Python/FastAPI ze scikit-learn.
- Zwykły użytkownik przegląda opublikowany katalog, wyszukuje, filtruje i ocenia. Administrator zarządza katalogiem i użytkownikami. Na pierwszą wersję tworzenie i publikowanie treści jest dostępne administratorowi. Obecne autorstwo i treści użytkowników zostają zachowane w migracji; nie nadajemy im automatycznie publicznej widoczności.
- Jeden katalog obejmuje materiały zewnętrzne, artykuły lokalne i kursy. PDF jest odnośnikiem HTTPS; upload i składowanie plików nie wchodzą do pierwszej wersji.
- Oceny: jedna aktualna ocena 1–5 użytkownika na materiał, z możliwością zmiany i usunięcia. Historia wyświetleń nie jest publiczna.
- Pięć rekomendacji, gdy istnieje co najmniej pięć odpowiednich nowych materiałów; przy mniejszym katalogu zwracamy mniej, bez duplikatów i sztucznego uzupełniania.

Przed realizacją etapu 2 potwierdzić tylko decyzje, które zmieniają produkt: czy użytkownicy mają również tworzyć własne treści, czy istniejące prywatne zasoby mają pozostać osobną funkcją, oraz czy PDF ma wymagać uploadu. Są to propozycje planu, nie wcześniejsze decyzje użytkownika. Przy braku decyzji można realizować niezależne naprawy i testy etapu 1, ale nie podejmować nieodwracalnych decyzji o publikacji danych.

## 4. Docelowe granice komponentów

Przeglądarka komunikuje się z Core API. Core API odpowiada za tożsamość, uprawnienia, katalog, zdarzenia i oceny oraz przekazuje żądanie rekomendacji do Python ML. Przeglądarka nie łączy się z bazą ani bezpośrednio z usługą ML.

Python zachowuje wymagany `GET /recommendations/{user_id}`, dostępny przez uwierzytelnione połączenie między usługami. Publiczny Core endpoint `GET /recommendations/me` ustala identyfikator z bieżącej sesji. Usługa ML uzyskuje ograniczony odczyt niezbędnych danych; nie otrzymuje haseł ani uprawnień do modyfikacji bazy. Core ponownie sprawdza widoczność rekomendowanych zasobów.

Proponowany model: wspólny rekord katalogowy z typem, tytułem, opisem, autorem, URL dla treści zewnętrznych, statusem publikacji i datami. Treść artykułu oraz kurs z etapami są powiązane z rekordem katalogowym. Tagi i przypisania tagów są wspólne, podobnie oceny i aktywność. Szczegółowy schemat i kontrakt API powstają w etapie 2 przed zmianą bazy. Zachować rozróżnienie autora treści od konta, które dodało odnośnik.

## 5. Etapy wykonania

### Etap 0 — odtwarzalne środowisko i ustalenie punktu startu

- [ ] Zinwentaryzować środowiska, domeny i istniejącą bazę bez wypisywania sekretów.
- [ ] Sprawdzić wersje Node/Python, utworzyć lockfile oraz `.env.example` z opisem konfiguracji.
- [ ] Opisać lokalne uruchomienie frontendu, API i osobnej testowej bazy PostgreSQL.
- [ ] Przed migracją uzyskać kopię danych i sprawdzić możliwość jej odtworzenia.
- [ ] Zapisać scenariusze rejestracji, logowania, użytkownika i administratora oraz aktualne błędy.

Warunek ukończenia: projekt można odtworzyć z czystego checkoutu, a testy nie korzystają z produkcyjnej bazy. Dla prac wyłącznie lokalnych bez istniejącej bazy odnotować brak danych do migracji.

### Etap 1 — poprawny i bezpieczny rdzeń

Zależność: etap 0.

- [x] Oddzielić tworzenie aplikacji od uruchomienia serwera, aby API dało się testować. Wydzielać moduły stopniowo, bez pełnego przepisywania.
- [ ] Naprawić `/me` przez poprawne pobranie roli; ujednolicić identyfikator użytkownika i odpowiedzi wszystkich ekranów.
- [ ] Ujednolicić middleware administratora; usunięte konto i odebrane uprawnienia nie mogą nadal działać na starym tokenie.
- [ ] Odrzucać brak bezpiecznego `JWT_SECRET` na produkcji; walidować email, hasła, typy i długości danych oraz identyfikatory.
- [ ] Dodać limitowanie prób logowania/rejestracji, limity żądań i treści, spójne błędy bez sekretów oraz CORS z konfiguracji.
- [ ] Wprowadzić jedną bezpieczną ścieżkę renderowania Markdown i walidację schematów URL; sprawdzić kreator, viewer, dashboard i panel admina.
- [ ] Zapisywać kurs i etapy atomowo. Usunąć reset bazy z produkcyjnego interfejsu i wyłączyć jego endpoint na produkcji.
- [ ] Sprawdzić TLS bazy z weryfikacją certyfikatu i ograniczyć pulę połączeń do budżetu środowiska.
- [ ] Dodać testy rejestracji, hashy haseł, logowania, `/me`, 401/403, usuniętego konta, XSS i rollbacku kursu. Uruchamiać je w CI od tego etapu.

Warunek ukończenia: logowanie i role działają od UI do bazy; testy krytyczne przechodzą; podstawowe ataki treścią i ominięcie roli są blokowane.

### Etap 2 — katalog, kontrakt i migracja danych

Zależność: etap 1 i decyzje produktowe z sekcji 3.

- [ ] Spisać kontrakt endpointów, odpowiedzi, kodów błędów, paginacji, filtrów, publikacji i macierz uprawnień.
- [ ] Zaprojektować wspólny model katalogu; spisać mapowanie starych `resources.data`, artykułów i kursów. Niepoprawne JSON-y raportować do ręcznej decyzji zamiast gubić dane.
- [ ] Wprowadzić wersjonowane migracje zamiast DDL przy każdym starcie serwera; przewidzieć ponowne wykonanie procedury i zgodność wdrażanych wersji.
- [ ] Dodać metadane zasobu, typy, tagi, relacje, status publikacji i indeksy uzasadnione zapytaniami.
- [ ] Przenieść dane na kopii bazy, zachowując autorstwo, kolejność etapów i mapowanie identyfikatorów; porównać liczby i przykładową treść przed i po.
- [ ] Zaimplementować pełny CRUD admina, szczegóły i wspólny katalog dla użytkownika; filtrowanie po tagach, wyszukiwanie i paginację po stronie API.
- [ ] Dodać edycję istniejących artykułów i kursów oraz rzeczywistą obsługę szkiców/publikacji. Szkice nie mogą wyciekać przez listy, szczegóły i wyszukiwanie.
- [ ] Zastąpić dotychczasowe wywołania stopniowo; adapter starych endpointów zachować tylko na okres przejściowy.
- [ ] Przetestować migrację, unikalność tagów, CRUD, widoczność, uprawnienia i brak częściowych zapisów.

Warunek ukończenia: administrator tworzy i edytuje odnośnik/PDF, artykuł i kurs, a użytkownik odnajduje opublikowane materiały po frazie i tagu. Dane sprzed migracji są rozliczone.

### Etap 3 — aktywność i oceny

Zależność: etap 2.

- [ ] Dodać zapis zdarzenia wyświetlenia po świadomym otwarciu materiału; wyświetlenie kafelka nie jest wyświetleniem treści. Dla odnośnika zewnętrznego rejestrować kliknięcie, bez twierdzenia, że materiał został przeczytany.
- [ ] Ustalić deduplikację odświeżeń, retencję historii i usuwanie danych przy usunięciu konta.
- [ ] Dodać wystawianie, zmianę i usuwanie oceny 1–5 oraz średnią i liczbę ocen.
- [ ] Identyfikator oceniającego zawsze brać z sesji; sprawdzać dostępność materiału i zakres oceny.
- [ ] Przygotować powtarzalny zestaw demonstracyjny o różnych tagach i historiach użytkowników.
- [ ] Przetestować równoległą zmianę ocen, unikalność oceny, deduplikację i izolację historii.

Warunek ukończenia: otwarcie materiału i ocena zapisują właściwego użytkownika i zasób; dane mogą zasilać ranking bez ujawniania cudzej historii.

### Etap 4 — rekomendacje Python ML

Zależność: etap 3.

- [ ] Utworzyć `ml/` z FastAPI, przypiętymi zależnościami, konfiguracją i endpointem zdrowia.
- [ ] Zaimplementować bazowy model podobieństwa treści: wektory tagów/tekstu, profil zainteresowań z wyświetleń i ocen oraz cosine similarity w scikit-learn. Wysokie oceny wzmacniają profil, niskie osłabiają preferencję; ustalić wagi w konfiguracji i testach.
- [ ] Wykluczyć materiały nieopublikowane, usunięte i już obejrzane; ustalić deterministyczne rozstrzyganie remisów.
- [ ] Dla nowego użytkownika używać dostępnych popularnych/wysoko ocenianych materiałów, a przy braku ocen deterministycznego wyboru z katalogu.
- [ ] Dodać uwierzytelnienie między usługami, ograniczony odczyt danych, timeout i kontrolowany cache z odświeżaniem po zmianie katalogu.
- [ ] Dodać Core `GET /recommendations/me`; gdy ML śpi lub nie odpowiada, zwracać bezpieczny ranking zastępczy. Logowanie i katalog mają działać niezależnie od ML.
- [ ] Dodać sekcję „Polecane dla Ciebie” z wyjaśnieniem dopasowania oraz oznaczeniem rankingu ogólnego, gdy brak personalizacji.
- [ ] Testować ranking na stałym zbiorze: zgodność tagów, wpływ ocen, wykluczenia, nowy użytkownik, pusta baza, mniej niż pięć kandydatów i awaria usługi. Porównać wynik z prostą popularnością; nie deklarować skuteczności bez pomiaru.

Warunek ukończenia: po aktywności rekomendacje zmieniają się zgodnie z zainteresowaniami, zwracają do pięciu nowych materiałów, a niedostępność ML nie blokuje aplikacji.

### Etap 5 — domknięcie interfejsu i E2E

Zależność: etapy 1–4. Zmiany ekranów potrzebne do wcześniejszych etapów realizować na bieżąco.

- [ ] Ujednolicić katalog i nawigację dashboard → szczegóły → powrót; zachować filtry i wyszukiwanie.
- [ ] Dostosować panel administratora do pełnego CRUD, tagów i publikacji; ukryć akcje bez uprawnień i egzekwować je również w API.
- [ ] Ujednolicić wspólną obsługę zapytań, wygaśnięcia sesji i błędów. Obsłużyć ładowanie, brak wyników, częściowe błędy i rozruch uśpionej usługi bez ponawiania zapisów powodującego duplikaty.
- [ ] Sprawdzić telefon, klawiaturę, etykiety, fokus, komunikaty i czytelność ekranów.
- [ ] Dodać Playwright w Pythonie zgodnie z zakresem README: rejestracja/logowanie, utworzenie zasobu przez admina, filtrowanie, wyświetlenie i ocena, rekomendacje po aktywności oraz odmowa operacji admina zwykłemu użytkownikowi.
- [ ] Pełne E2E uruchamiać z rzeczywistymi API, usługą ML i izolowaną bazą, bez mockowania głównego przepływu. Wyniki i ślady błędów zachowywać jako artefakty CI.

Warunek ukończenia: wszystkie wymagane przepływy przechodzą automatycznie na czystych danych; ręczny przegląd mobilny i dostępności nie wykazuje blokad.

### Etap 6 — hosting i wydanie

Zależność: etap 5; weryfikację wykonalności hostingu wykonać już w etapie 0.

- [ ] Sprawdzić aktualne oficjalne warunki dostawców: koszt, usypianie, limity godzin, CPU/RAM, połączeń, transferu, retencję bazy i zasady nieaktywności. Lista z README nie stanowi potwierdzenia, że dana oferta nadal jest darmowa.
- [ ] Wybrać statyczny hosting frontendu, hosting Node, osobny hosting Python oraz zarządzany PostgreSQL. Sprawdzić łączny budżet dwóch usług, nie tylko limit każdej osobno. Jeśli wymóg różnych platform dla wszystkich komponentów jest niewykonalny bez kosztów, przed wyborem odstępstwa uzgodnić zmianę wymagania.
- [ ] Zapisać zweryfikowane limity i datę sprawdzenia. Nie włączać płatnych planów ani sztucznego utrzymywania usług w aktywności w celu obchodzenia ograniczeń.
- [ ] Przygotować powtarzalne konfiguracje budowy/uruchamiania, migracji, sekretów, domen, CORS, healthchecków i ograniczeń połączeń.
- [ ] Sprawdzić przygotowane wydanie na oddzielnym środowisku; jeśli brak bezpłatnego stagingu, użyć lokalnego środowiska odpowiadającego produkcji i jawnie odnotować ten limit.
- [ ] Wykonać kopię i próbę odtworzenia; migracje uruchamiać jako kontrolowany krok wydania, unikając równoległych migracji przy starcie instancji.
- [ ] Wdrożyć DB/migracje → ML → Core → frontend, pilnując zgodności wersji. Wykonać smoke test logowania, CRUD, tagów, ocen i rekomendacji na docelowych domenach oraz test po uśpieniu usług.
- [ ] Udokumentować rollback kodu, zgodność schematu, odtworzenie kopii i ewentualną utratę zapisów po przywróceniu danych; przećwiczyć procedurę przed wydaniem.
- [ ] Uzupełnić README i dokumentację prawdziwymi adresami, komendami, architekturą, ograniczeniami i wynikami testów; poprawić odwołanie do `config.js`.

Warunek ukończenia: wymagane przepływy działają na docelowych adresach, brak płatnych zależności w uzgodnionych limitach, a odtworzenie i rollback mają sprawdzoną procedurę.

## 6. Kryterium zakończenia całego projektu

- [ ] Użytkownik rejestruje się, loguje, przeszukuje katalog po frazie i tagach, otwiera materiały i je ocenia.
- [ ] Administrator wykonuje pełny CRUD materiałów i zarządza użytkownikami; zwykły użytkownik nie ma tych uprawnień.
- [ ] Artykuły, kursy i etapy pozostają dostępne; publikacja i szkice działają zgodnie z macierzą uprawnień.
- [ ] Aktywność zasila osobną usługę Python; personalizowane rekomendacje i scenariusze awarii są zweryfikowane.
- [ ] Testy API, bazy, ML i E2E przechodzą w CI, a uruchomienie jest odtwarzalne.
- [ ] Rozdzielone wdrożenie mieści się w sprawdzonych darmowych limitach; opisano zimny start, kopie i odzyskiwanie.

## 7. Jak kontynuować pracę według tego planu

Przy kolejnym zadaniu odczytać ten plik, `README.md`, aktualny stan Git oraz instrukcje repozytorium. Zacząć od pierwszego nieskończonego etapu i sprawdzić, czy kod od czasu planowania się zmienił. Przed zmianami bazy, sieci, testów lub UI odczytać odpowiednie dostępne instrukcje/skills.

Po każdej ukończonej części aktualizować checkboxy i dziennik poniżej. Checkbox zamykać dopiero po sprawdzeniu kryterium; zapisywać konkretne polecenia i wynik walidacji, migracje oraz pozostałe blokady. Nie wpisywać sekretów, danych osobowych ani treści `.env`. Zmiany zakresu zapisywać z datą i uzasadnieniem.

Ten dokument jest planem, nie zgodą na usunięcie danych, publiczne udostępnienie prywatnych materiałów ani uruchomienie płatnych usług. Kolejna implementacja powinna wynikać z polecenia użytkownika; samo sporządzenie planu nie rozpoczyna wdrożenia.

### Dziennik realizacji

| Data | Zakres | Weryfikacja | Następny krok |
| --- | --- | --- | --- |
| 2026-10-16 | Implementacja katalogu, ocen, ML, podstaw bezpieczeństwa, migracji, interfejsu, testów i konfiguracji wydania | 7 testów Node i 6 Python przeszło; build/składnia poprawne; pełny stos i hosting niezweryfikowane | Uruchomić PostgreSQL, instalację npm i E2E; wykonać próbę migracji/odtworzenia na kopii |
| 2026-10-16 | Odczyt README, dokumentacji i kodu; zapis planu | Analiza statyczna względem `d1c4b1a`; bez uruchamiania usług i bez zmian kodu aplikacji | Etap 0: środowisko, dane i odtwarzalny start |
