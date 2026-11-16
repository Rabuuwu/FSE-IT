import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from '../db.js';
import { migrate } from './migrate.js';
import { demoMaterials } from './demo-materials.js';

const demoPassword = 'FSE-Demo-2026!';
const users = [
    { email: 'admin.demo@fse.test', display: 'Demo Administrator', role: 'admin' },
    { email: 'anna.nowak@fse.test', display: 'Anna Nowak', role: 'user' },
    { email: 'piotr.zielinski@fse.test', display: 'Piotr Zieliński', role: 'user' },
    { email: 'zofia.kowalska@fse.test', display: 'Zofia Kowalska', role: 'user' },
    { email: 'maja.wojcik@fse.test', display: 'Maja Wójcik', role: 'user' },
    { email: 'jakub.lewandowski@fse.test', display: 'Jakub Lewandowski', role: 'user' },
    { email: 'natalia.kaminska@fse.test', display: 'Natalia Kamińska', role: 'user' },
    { email: 'tomasz.wisniewski@fse.test', display: 'Tomasz Wiśniewski', role: 'user' },
    { email: 'alicja.dabrowska@fse.test', display: 'Alicja Dąbrowska', role: 'user' },
    { email: 'michal.kaczmarek@fse.test', display: 'Michał Kaczmarek', role: 'user' },
];

const materials = [
    {
        owner: 'anna.nowak@fse.test', type: 'article', title: 'Git w praktyce: od commita do pull requesta',
        description: 'Krótki przewodnik po codziennej pracy z historią zmian, branchami i code review.',
        author: 'Anna Nowak', content: `# Git w praktyce

Git zapisuje historię projektu jako serię commitów. Pracę nad zmianą zacznij od osobnego brancha, aby nie mieszać jej z główną wersją aplikacji.

## Podstawowy przepływ

1. Sprawdź zmienione pliki poleceniem \`git status\`.
2. Dodaj wybrane pliki przez \`git add\`.
3. Zapisz mały, opisowy commit poleceniem \`git commit\`.
4. Wypchnij branch i otwórz pull request.

W pull requeście opisz cel zmiany, sposób jej sprawdzenia i znane ograniczenia. Przed scaleniem przejrzyj diff oraz wynik testów.`,
        tags: ['git', 'współpraca', 'podstawy'],
    },
    {
        owner: 'piotr.zielinski@fse.test', type: 'article', title: 'REST API od podstaw',
        description: 'Jak projektować czytelne zasoby, kody odpowiedzi i walidację wejścia.',
        author: 'Piotr Zieliński', content: `# REST API od podstaw

API udostępnia zasoby przez stabilne adresy URL i standardowe metody HTTP. Kolekcję materiałów można udostępnić pod \`/materials\`, a pojedynczy materiał pod \`/materials/:id\`.

## Metody i odpowiedzi

- \`GET\` odczytuje dane i nie powinien ich zmieniać.
- \`POST\` tworzy nowy zasób; typową odpowiedzią jest \`201 Created\`.
- \`PUT\` aktualizuje zasób, a \`DELETE\` go usuwa.
- \`400\` oznacza nieprawidłowe dane, \`401\` brak uwierzytelnienia, a \`404\` brak zasobu.

Waliduj typ, długość i format każdego pola po stronie serwera. Parametry SQL przekazuj oddzielnie od zapytania, nigdy przez konkatenację tekstu.`,
        tags: ['api', 'http', 'backend'],
    },
    {
        owner: 'anna.nowak@fse.test', type: 'course', title: 'Pierwsza aplikacja w Node.js',
        description: 'Trzy krótkie etapy od uruchomienia Node.js do prostego endpointu HTTP.',
        author: 'Anna Nowak', tags: ['node.js', 'backend', 'kurs'],
        stages: [
            { title: 'Uruchomienie projektu', content: 'Sprawdź wersję poleceniem `node --version`, utwórz katalog projektu i zainicjuj package.json przez `npm init`.' },
            { title: 'Moduły i skrypty', content: 'Podziel kod na moduły ES, dodaj skrypt `start` w package.json i uruchamiaj aplikację poleceniem `npm start`.' },
            { title: 'Pierwszy endpoint', content: 'Utwórz serwer HTTP, obsłuż żądanie GET i zwróć odpowiedź JSON. Dodaj test sprawdzający status oraz treść odpowiedzi.' },
        ],
    },
    {
        owner: 'piotr.zielinski@fse.test', type: 'course', title: 'Bezpieczne hasła w aplikacji webowej',
        description: 'Praktyczne podstawy przechowywania haseł i ochrony endpointów.',
        author: 'Piotr Zieliński', tags: ['bezpieczeństwo', 'uwierzytelnianie', 'kurs'],
        stages: [
            { title: 'Hash zamiast tekstu jawnego', content: 'Nie zapisuj haseł użytkowników. Użyj funkcji przeznaczonej do haseł, takiej jak bcrypt lub Argon2, z unikalnym salt.' },
            { title: 'Walidacja i logowanie', content: 'Waliduj format i długość danych na serwerze. Dla nieprawidłowego loginu zwracaj ogólny komunikat, który nie zdradza, czy konto istnieje.' },
            { title: 'Sesja i uprawnienia', content: 'Weryfikuj token przy każdym chronionym żądaniu i sprawdzaj aktualną rolę użytkownika. Sekrety trzymaj poza repozytorium.' },
        ],
    },
    {
        owner: 'zofia.kowalska@fse.test', type: 'link', title: 'MDN: Przewodnik po JavaScript',
        description: 'Dokumentacja języka JavaScript, przykładów i interfejsów Web API.',
        author: 'Zofia Kowalska', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
        tags: ['javascript', 'dokumentacja', 'frontend'],
    },
    {
        owner: 'zofia.kowalska@fse.test', type: 'link', title: 'Node.js: oficjalna dokumentacja',
        description: 'Dokumentacja runtime’u Node.js, modułów wbudowanych i narzędzi.',
        author: 'Zofia Kowalska', url: 'https://nodejs.org/docs/latest/api/',
        tags: ['node.js', 'dokumentacja', 'backend'],
    },
];

// Expand the original sample set with practical steps and limits while retaining its identities.
materials[0].content += `

## Przygotowanie zmian do review

Przed stagingiem sprawdź \`git status\`, a po dodaniu plików przejrzyj \`git diff --staged\`. Jeśli w jednym pliku są niezależne zmiany, użyj \`git add -p\`. W opisie pull requesta podaj problem, rozwiązanie, komendy testów i ryzyko regresji.

## Cofanie bez utraty historii

\`git revert\` dopisuje commit odwracający wskazaną zmianę, dlatego zwykle pasuje do już współdzielonej gałęzi. \`git reset\` przesuwa lokalny wskaźnik i może odłączyć commity; przed jego użyciem sprawdź status i zachowaj potrzebne zmiany. Rebase odtwarza commity z nowymi hashami, więc nie przepisuj wspólnej historii.

## Zadanie

Na kopii repo utwórz branch, dodaj dwa pliki osobno, obejrzyj staged diff, utwórz commity, a następnie odwróć jeden przez \`git revert\`. Porównaj \`git log --graph --oneline\` przed i po. Źródło: [Pro Git](https://git-scm.com/book/en/v2/Git-Branching-Rebasing).`;
materials[1].content += `

## Kontrakt zasobu

Używaj rzeczowników w ścieżkach, np. \`/materials\` i \`/materials/42\`. Filtrowanie i paginację opisuj parametrami query; parametry waliduj i ograniczaj. Zwracaj powtarzalny kształt błędu, np. kod i bezpieczny komunikat, bez tracebacka.

## Autoryzacja i aktualizacje

Rozdziel uwierzytelnienie od sprawdzenia uprawnienia do konkretnego materiału. Dla konfliktu aktualizacji możesz użyć wersji rekordu lub ETag i zwrócić 409/412, zamiast cicho nadpisać cudzą zmianę. Zapytania SQL zawsze parametryzuj.

## Ćwiczenie

Opisz kontrakt \`GET /materials?page=1&limit=20\` i \`PUT /materials/:id\`. Dodaj scenariusze braku sesji, dostępu do cudzego rekordu, niepoprawnego limitu i konfliktu wersji. Źródło: [MDN — metody HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods).`;
materials[2].stages = [
    { title: 'Środowisko i moduły', content: 'Sprawdź `node --version` i `npm --version`; utwórz package.json przez `npm init -y`. Dodaj `.gitignore` dla node_modules, `.env` i lokalnych artefaktów. Wybierz CommonJS lub ES modules świadomie; moduł powinien eksportować małe, jawne API. Dodaj skrypt start i uruchomienie przez `npm start`.' },
    { title: 'Serwer HTTP i kontrakt', content: 'Zbuduj serwer z trasą GET `/health`, odpowiedzią JSON i statusami 200 oraz 404. Waliduj port z env i przerwij start z czytelnym komunikatem, gdy wartość jest poza zakresem. Nie wstawiaj konfiguracji sekretów do kodu ani logów. Dokumentacja: https://nodejs.org/docs/latest/api/.' },
    { title: 'Test i zamknięcie zasobów', content: 'Przetestuj status, content-type i body odpowiedzi. Użyj node:test; serwer testowy zamknij w teardown, także po nieudanej asercji. Dodaj test błędnej ścieżki i sprawdź, że suite może być uruchomiony dwa razy bez konfliktu portu.' },
];
materials[3].stages = [
    { title: 'Hashowanie i rejestracja', content: 'Hasła przechowuj wyłącznie jako wynik adaptacyjnego hashera przeznaczonego do haseł, np. Argon2id, scrypt lub bcrypt, z unikalną solą. Używaj API biblioteki do weryfikacji. Szybki SHA-256 nie jest właściwy do przechowywania haseł. OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' },
    { title: 'Sesja i kontrola dostępu', content: 'Po zalogowaniu wydaj chronioną sesję, ogranicz jej czas życia i unieważnij ją przy wylogowaniu. Sprawdzaj aktualne uprawnienia dla każdego zasobu; nie ufaj identyfikatorowi podanemu przez klienta ani ukrytym przyciskom. Przy cookie uwzględnij HTTPS, Secure, HttpOnly, SameSite i ochronę CSRF.' },
    { title: 'Testy i operacje', content: 'Przetestuj poprawne i błędne hasło, duplikat rejestracji, wygaśnięcie sesji, wylogowanie i dostęp między dwoma kontami. Ogranicz próby logowania i nie zapisuj poświadczeń w logach. Przejrzyj plan rotacji sekretu oraz procedurę unieważnienia sesji.' },
];
materials[4].description += ' Zawiera przewodniki po składni, funkcjach, obiektach i Web API; poszczególne sekcje są dokumentacją referencyjną, więc warto otwierać je według konkretnego problemu.';
materials[5].description += ' Dokumentacja referencyjna modułów wbudowanych, API uruchomieniowego i narzędzi. Sprawdź wersję Node używaną w projekcie, ponieważ dostępne API zmienia się między wydaniami.';

function requireLocalDevelopmentDatabase() {
    if (process.env.NODE_ENV !== 'development') throw new Error('Seeder działa wyłącznie przy NODE_ENV=development.');
    const database = new URL(process.env.DATABASE_URL || '');
    const name = decodeURIComponent(database.pathname.replace(/^\//, ''));
    if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || name !== 'fse') {
        throw new Error('Seeder wymaga lokalnej bazy o nazwie fse; niczego nie zapisano.');
    }
}

async function seed() {
    requireLocalDevelopmentDatabase();
    await migrate();
    const allMaterials = [...materials, ...demoMaterials];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userIds = new Map();
        for (const user of users) {
            const hash = await bcrypt.hash(demoPassword, 12);
            const result = await client.query(
                `INSERT INTO users(email,password_hash,role_id,display_name)
                 VALUES($1,$2,(SELECT id FROM roles WHERE name=$3),$4)
                 ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role_id=EXCLUDED.role_id,display_name=EXCLUDED.display_name
                 RETURNING id`,
                [user.email, hash, user.role, user.display],
            );
            userIds.set(user.email, result.rows[0].id);
        }

        let inserted = 0, updated = 0;
        const materialIds = new Map();
        for (const item of allMaterials) {
            const creatorId = userIds.get(item.owner);
            const existing = await client.query(
                'SELECT id FROM materials WHERE created_by=$1 AND title=$2',
                [creatorId, item.title],
            );
            let materialId;
            if (existing.rowCount) {
                materialId = existing.rows[0].id;
                await client.query(`UPDATE materials SET type=$2,description=$3,author=$4,url=$5,content=$6,published=true,publication_status='published',review_note=NULL,submitted_at=NULL,reviewed_at=NULL,reviewed_by=NULL,revision=revision+1,updated_at=now()
                    WHERE id=$1`, [materialId,item.type,item.description,item.author,item.url||null,item.content||null]);
                await client.query('DELETE FROM material_tags WHERE material_id=$1',[materialId]);
                await client.query('DELETE FROM material_stages WHERE material_id=$1',[materialId]);
                updated += 1;
            } else {
                const result = await client.query(
                    `INSERT INTO materials(created_by,type,title,description,author,url,content,published,publication_status)
                     VALUES($1,$2,$3,$4,$5,$6,$7,true,'published') RETURNING id`,
                    [creatorId, item.type, item.title, item.description, item.author, item.url || null, item.content || null],
                );
                materialId = result.rows[0].id;
                inserted += 1;
            }
            materialIds.set(item.title, materialId);
            for (const tagName of item.tags) {
                const tag = await client.query(
                    'INSERT INTO tags(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
                    [tagName.toLowerCase()],
                );
                await client.query('INSERT INTO material_tags(material_id,tag_id) VALUES($1,$2)', [materialId, tag.rows[0].id]);
            }
            for (const [position, stage] of (item.stages || []).entries()) {
                await client.query(
                    'INSERT INTO material_stages(material_id,position,title,content) VALUES($1,$2,$3,$4)',
                    [materialId, position, stage.title, stage.content],
                );
            }
        }
        const seededComments = [
            ['Git w praktyce: od commita do pull requesta','piotr.zielinski@fse.test','Przydatne rozróżnienie między revert i reset. Ćwiczenie na lokalnym repo dobrze pokazuje skutki obu poleceń.'],
            ['REST API od podstaw','anna.nowak@fse.test','Sekcja o sprawdzaniu uprawnień po stronie serwera jest ważna. Samo ukrycie przycisku faktycznie nie chroni endpointu.'],
            ['Pierwsza aplikacja w Node.js','zofia.kowalska@fse.test','Dodałam test dla ścieżki 404 i zamykanie serwera w teardown — dzięki temu test nie zostawia otwartego portu.'],
            ['Bezpieczne hasła w aplikacji webowej','maja.wojcik@fse.test','Warto pamiętać, że koszt haszowania trzeba dobrać i mierzyć na docelowym środowisku.'],
            ['JavaScript: domknięcia i zakres leksykalny','jakub.lewandowski@fse.test','Dwa niezależne liczniki dobrze pokazują, że funkcje zachowują osobny stan.'],
            ['JavaScript: obietnice i obsługa błędów','natalia.kaminska@fse.test','Sprawdzenie response.ok rozwiązało mój błąd z traktowaniem 404 jak sukcesu.'],
            ['PostgreSQL: transakcje i rollback','tomasz.wisniewski@fse.test','Test awarii drugiego inserta potwierdził, że oba zapisy są atomowe.'],
            ['Bezpieczeństwo: przechowywanie haseł','alicja.dabrowska@fse.test','Dobra lista kontrolna. Przy wyborze algorytmu sprawdziłam aktualne zalecenia OWASP.'],
            ['CSS: Flexbox dla układów jednowymiarowych','michal.kaczmarek@fse.test','Wskazówka o min-width: 0 pomogła naprawić zawijanie długiego tytułu.'],
            ['Git: rebase a merge w zespole','anna.nowak@fse.test','Ćwiczenie warto robić wyłącznie na kopii repozytorium, zanim użyje się rebase w zespole.'],
        ];
        for (const [title,email,body] of seededComments) {
            const materialId=materialIds.get(title), userId=userIds.get(email);
            if (!materialId || !userId) continue;
            await client.query(`INSERT INTO material_comments(material_id,user_id,body)
                SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM material_comments WHERE material_id=$1 AND user_id=$2 AND body=$3)`,[materialId,userId,body]);
        }
        await client.query('COMMIT');
        console.log(`Demo seed gotowy: ${users.length} kont demo, ${inserted} nowych i ${updated} odświeżonych materiałów (łącznie ${allMaterials.length} w zestawie).`);
        console.log(`Konta demo: ${users.map(user => user.email).join(', ')}`);
        console.log(`Hasło do kont demo: ${demoPassword}`);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(error => {
    console.error(`Seed demo przerwany: ${error.code || error.message}`);
    process.exitCode = 1;
    pool.end();
});
