# FSE-IT — poczta i odzyskiwanie kont

Wysyłka używa Gmail API przez HTTPS (OAuth), nie SMTP. Sekrety ustaw wyłącznie w środowisku backendu. Nie przekazuj ich do frontendu/Git.

- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`: spójny zestaw OAuth z uprawnieniem Gmail do wysyłania wiadomości.
- `MAIL_FROM`: adres konta autoryzowanego w Google.
- `PUBLIC_APP_URL`: publiczny adres katalogu frontendu, np. `https://example.com/fse/`. Link prowadzi do `recovery.html` w tym katalogu.
- `JWT_SECRET`: istniejący stabilny sekret aplikacji; służy także do wyprowadzenia osobnego klucza AES-GCM kolejki. Nie zmieniaj go przy każdym deployu. Rotacja unieważnia sesje i uniemożliwia wysłanie starych oczekujących linków — po rotacji użytkownicy żądają nowych.

Worker uruchamia się razem z `npm start`, sprawdza kolejkę co 5 sekund i wysyła jeden list na iterację. Token w tabeli akcji jest SHA-256; do wysłania potrzebna jest krótkotrwała zaszyfrowana kopia, usuwana po próbie. Linki wygasają po 30 minutach i są jednorazowe. Ponowne żądanie nie tworzy kolejnego linku częściej niż raz na minutę. Nie kopiujemy sekretów z API Sentinel.

## Sprawdzenie na Renderze

1. Najpierw testy lokalne, backup i jawne migracje 007–009, następnie wdrożenie Core i nowego frontendu.
2. Dodaj powyższe zmienne w ustawieniach środowiska Core, zachowując obecny JWT_SECRET.
3. W menu konta otwórz „E-mail i odzyskiwanie”, wyślij potwierdzenie i odbierz wiadomość.
4. Odśwież stronę, aby zobaczyć stan kolejki: queued/sending/accepted/failed. `accepted` oznacza przyjęcie przez Gmail, nie dowód dotarcia do skrzynki.
5. Potwierdź adres, wyloguj się i poproś o reset. Sprawdź nowe hasło, odrzucenie starego tokenu sesji i ponownego użycia linku.

Reset jest dostępny tylko dla wcześniej potwierdzonego adresu. Zmiana adresu w profilu usuwa potwierdzenie. Odpowiedź żądania resetu nie ujawnia, czy konto istnieje. Potwierdzenie wymaga przycisku — samo otwarcie linku nie zużywa tokenu.

Błędy: `GMAIL_AUTH_FAILED`, `GMAIL_SEND_FAILED`, `MAIL_CONFIG_INVALID`, `MAIL_DELIVERY_FAILED`. Po poprawieniu konfiguracji poproś o nowy link. Nie ma automatycznego ponawiania, które mogłoby dublować wiadomości. Po przerwaniu procesu podczas wysyłki stan może zostać `sending`; nowy link po minucie zastępuje poprzedni. Worker nie działa podczas uśpienia hosta. Nie potwierdzono live delivery w tej sesji.
