"""Real browser moderation regression: author, administrator and anonymous reader."""
import os
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('E2E_FRONTEND_URL', 'http://127.0.0.1:5500')
api = os.environ.get('E2E_API_URL', 'http://127.0.0.1:3000')
admin_email = os.environ['E2E_ADMIN_EMAIL']
admin_password = os.environ['E2E_ADMIN_PASSWORD']
email = f'e2e-{uuid.uuid4().hex}@example.com'
password = 'E2E-test-password-long'
title = f'Moderation browser {uuid.uuid4().hex}'
os.makedirs('artifacts', exist_ok=True)

def login(page, email, password):
    page.goto(base + '/login.html')
    page.get_by_label('Email:', exact=True).fill(email)
    page.get_by_label('Password:', exact=True).fill(password)
    page.get_by_role('button', name='Login', exact=True).click()
    expect(page.locator('#identity')).to_have_text(email)
    page.wait_for_url('**/dashboard.html')
    expect(page.get_by_role('heading', name='Mój pulpit', exact=True)).to_be_visible()

with sync_playwright() as p:
    chrome = os.environ.get('E2E_CHROME_EXECUTABLE')
    local_chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if not chrome and Path(local_chrome).is_file():
        chrome = local_chrome
    browser = p.chromium.launch(headless=True, **({'executable_path': chrome} if chrome else {}))
    author = browser.new_context(viewport={'width': 390, 'height': 844})
    administrator = browser.new_context()
    guest = browser.new_context()
    author.tracing.start(screenshots=True, snapshots=True)
    try:
        page = author.new_page()
        page.goto(base + '/register.html')
        page.get_by_label('Email:', exact=True).fill(email)
        page.get_by_label('Password:', exact=True).fill(password)
        page.get_by_role('button', name='Register', exact=True).click()
        page.wait_for_url('**/login.html')
        login(page, email, password)
        page.goto(base + '/material-editor.html')
        page.get_by_label('Rodzaj', exact=True).select_option('article')
        page.get_by_label('Tytuł', exact=True).fill(title)
        page.get_by_label('Opis', exact=True).fill('Browser moderation regression, synthetic material.')
        page.get_by_role('button', name='Dalej', exact=True).click()
        page.get_by_label('Treść artykułu (Markdown)').fill('# Test\nSynthetic example with references.')
        page.get_by_role('button', name='Dalej', exact=True).click()
        page.get_by_label('Tagi oddzielone przecinkami').fill('moderation-browser')
        page.get_by_role('button', name='Dalej', exact=True).click()
        page.get_by_role('button', name='Zapisz prywatnie', exact=True).click()
        expect(page.locator('#editorMessage')).to_contain_text('Zapisano prywatnie')
        material_id = page.url.split('id=')[1]
        assert guest.request.get(api + '/materials/' + material_id).status == 404
        page.get_by_role('button', name='Przekaż do weryfikacji', exact=True).click()
        expect(page.locator('#workflowStatus')).to_contain_text('Oczekuje')
        assert guest.request.get(api + '/materials/' + material_id).status == 404
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/moderation-author-mobile.png', full_page=True)

        # Admin interaction is intentionally exercised through the real review panel.
        admin_page = administrator.new_page()
        login(admin_page, admin_email, admin_password)
        expect(admin_page.locator('#countTotal')).to_have_text('0')
        expect(admin_page.locator('#adminLink')).to_be_visible()
        admin_page.goto(base + '/admin.html')
        admin_page.wait_for_load_state('networkidle')
        card = admin_page.locator('[data-material-id="' + material_id + '"]')
        expect(card).to_contain_text(title)
        card.get_by_role('button', name='Sprawdź materiał', exact=True).click()
        dialog = admin_page.locator('#reviewDialog')
        dialog.get_by_label('Uwagi do autora', exact=True).fill('Dodaj przykład użycia.')
        dialog.get_by_role('button', name='Odrzuć do poprawy', exact=True).click()
        expect(dialog).not_to_be_visible()
        page.reload()
        expect(page.locator('#workflowStatus')).to_contain_text('Do poprawy')
        expect(page.locator('#reviewNote')).to_contain_text('Dodaj przykład użycia.')
        page.get_by_role('button', name='Przekaż do weryfikacji', exact=True).click()
        expect(page.locator('#workflowStatus')).to_contain_text('Oczekuje')
        expect(page.locator('#reviewNote')).to_be_empty()
        admin_page.reload()
        card = admin_page.locator('[data-material-id="' + material_id + '"]')
        card.get_by_role('button', name='Sprawdź materiał', exact=True).click()
        dialog.get_by_role('button', name='Zatwierdź i opublikuj', exact=True).click()
        expect(dialog).not_to_be_visible()
        admin_page.get_by_role('button', name='Wszystkie materiały', exact=True).click()
        expect(admin_page.locator('#queueItems')).to_contain_text(title)
        expect(admin_page.locator('#queueRetry')).to_be_hidden()
        admin_page.get_by_label('Stan materiału', exact=True).select_option('published')
        expect(admin_page.locator('#queueItems')).to_contain_text(title)
        admin_page.get_by_role('button', name='Użytkownicy', exact=True).click()
        expect(admin_page.locator('#userItems')).to_contain_text(email)
        reader = guest.new_page()
        reader.goto(base + '/material.html?id=' + material_id)
        expect(reader.get_by_role('heading', name=title, exact=True)).to_be_visible()
        assert guest.request.get(api + '/materials/' + material_id).status == 200
        assert reader.evaluate('document.documentElement.scrollWidth <= innerWidth')
        token = page.evaluate('localStorage.getItem("token")')
        admin_token = admin_page.evaluate('localStorage.getItem("token")')
        author_headers = {'Authorization': f'Bearer {token}'}
        admin_headers = {'Authorization': f'Bearer {admin_token}'}
        # Preserve the recommendation/rating regression alongside the new moderation flow.
        candidate = author.request.post(api + '/materials', headers=author_headers, data={
            'type': 'article', 'title': title + ' next', 'tags': ['moderation-browser'],
            'description': 'Related synthetic browser example.', 'content': '# Related example',
        })
        assert candidate.status == 201
        candidate = candidate.json()
        pending = author.request.post(api + f'/materials/{candidate["id"]}/submit', headers=author_headers, data={'revision': candidate['revision']})
        assert pending.status == 200
        approved = administrator.request.post(api + f'/admin/materials/{candidate["id"]}/review', headers=admin_headers, data={'revision': pending.json()['revision'], 'decision': 'approve'})
        assert approved.status == 200
        page.goto(base + '/material.html?id=' + material_id)
        page.get_by_role('button', name='Oceń na 5 z 5', exact=True).click()
        expect(page.locator('#ratingMessage')).to_contain_text('Zapisano ocenę 5/5')
        page.goto(base + '/catalog.html')
        expect(page.locator('#recommendationMode')).to_have_text('Na podstawie Twoich zainteresowań i ocen.')
        expect(page.locator('#recommendations')).to_contain_text(title + ' next')
        page.get_by_label('Szukaj materiałów', exact=True).fill(title)
        page.get_by_role('button', name='Szukaj', exact=True).click()
        expect(page.locator('#materials')).to_contain_text(title)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/moderation-catalog-mobile.png', full_page=True)
        page.get_by_role('link', name='Moje materiały', exact=True).click()
        page.wait_for_url('**/my-materials.html')
        expect(page.get_by_role('heading', name='Moje materiały', exact=True)).to_be_visible()
        expect(page.locator('#mineItems')).to_contain_text(title)
        expect(page.locator('#mineItems')).to_contain_text(title + ' next')
        page.get_by_label('Stan materiału', exact=True).select_option('private')
        expect(page.locator('#mineMessage')).to_contain_text('Brak materiałów')
        page.get_by_label('Stan materiału', exact=True).select_option('published')
        expect(page.locator('#mineItems')).to_contain_text(title)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/my-materials-mobile.png', full_page=True)
        page.goto(base + '/dashboard.html')
        expect(page.locator('#countTotal')).to_have_text('2')
        expect(page.locator('#countPublished')).to_have_text('2')
        expect(page.locator('#countPrivate')).to_have_text('0')
        expect(page.locator('#adminLink')).to_be_hidden()
        expect(page.locator('#recentMaterials')).to_contain_text(title)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/dashboard-mobile.png', full_page=True)
        page.locator('.dashboard-stats').get_by_role('link', name='Publiczne', exact=True).click()
        expect(page.get_by_label('Stan materiału', exact=True)).to_have_value('published')
        expect(page.locator('#mineItems')).to_contain_text(title)
        assert author.request.get(api + '/admin/materials', headers={'Authorization': f'Bearer {token}'}).status == 403
        page.goto(base + '/admin.html')
        expect(page.locator('#adminMessage')).to_contain_text('administrator')
        page.goto(base + '/dashboard.html')
        expect(page.locator('#accountToggle')).to_be_visible()
        assert page.locator('.site-header > nav > a[href="dashboard.html"]').count() == 0
        page.locator('#accountToggle').click()
        expect(page.locator('#accountDropdown')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#accountDropdown')).to_be_hidden()
        expect(page.locator('#accountToggle')).to_be_focused()
        page.locator('#accountToggle').click()
        page.get_by_role('link', name='Ustawienia konta', exact=True).click()
        page.wait_for_url('**/account.html')
        expect(page.locator('#accountContent')).to_be_visible()
        updated_email = 'updated-' + email
        page.get_by_label('Nazwa wyświetlana', exact=True).fill('Browser learner')
        page.get_by_label('Adres e-mail', exact=True).fill(updated_email)
        page.get_by_label('Obecne hasło przy zmianie e-maila', exact=True).fill('wrong-password')
        page.get_by_role('button', name='Zapisz profil', exact=True).click()
        expect(page.locator('#profileMessage')).to_contain_text('incorrect')
        page.get_by_label('Obecne hasło przy zmianie e-maila', exact=True).fill(password)
        page.get_by_role('button', name='Zapisz profil', exact=True).click()
        expect(page.locator('#profileMessage')).to_have_text('Profil zapisany.')
        page.locator('#accountToggle').click()
        expect(page.locator('#accountLabel')).to_have_text('Browser learner')
        page.keyboard.press('Escape')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/account-mobile.png', full_page=True)
        new_password = 'Browser-new-password-long'
        page.locator('#currentPassword').fill(password)
        page.locator('#newPassword').fill(new_password)
        page.locator('#repeatPassword').fill(new_password)
        page.get_by_role('button', name='Zmień hasło', exact=True).click()
        page.wait_for_url('**/login.html?changed=password')
        assert author.request.get(api + '/me', headers=author_headers).status == 401
        login(page, updated_email, new_password)
        page.goto(base + '/account.html')
        page.get_by_role('button', name='Przejdź do usunięcia konta', exact=True).click()
        page.get_by_role('button', name='Anuluj', exact=True).click()
        expect(page.locator('#deleteDialog')).to_be_hidden()
        page.get_by_role('button', name='Przejdź do usunięcia konta', exact=True).click()
        page.get_by_label('Obecne hasło', exact=True).last.fill(new_password)
        page.get_by_label('Wpisz USUŃ KONTO', exact=True).fill('nie')
        page.get_by_role('button', name='Usuń moje konto', exact=True).click()
        expect(page.locator('#deleteMessage')).to_contain_text('USUŃ KONTO')
        page.get_by_label('Wpisz USUŃ KONTO', exact=True).fill('USUŃ KONTO')
        page.get_by_role('button', name='Usuń moje konto', exact=True).click()
        page.wait_for_url('**/login.html?deleted=1')
        assert page.evaluate('localStorage.getItem("token")') is None
        retained = guest.request.get(api + '/materials/' + material_id)
        assert retained.status == 200 and retained.json()['created_by'] is None
    finally:
        author.tracing.stop(path='artifacts/moderation-e2e-trace.zip')
        author.close()
        administrator.close()
        guest.close()
        browser.close()
