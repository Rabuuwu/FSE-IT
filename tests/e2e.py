import json
import os
import uuid
from urllib.request import Request, urlopen
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('E2E_FRONTEND_URL', 'http://127.0.0.1:5500')
api = os.environ.get('E2E_API_URL', 'http://127.0.0.1:3000')
admin_email = os.environ['E2E_ADMIN_EMAIL']
admin_password = os.environ['E2E_ADMIN_PASSWORD']
email = f'e2e-{uuid.uuid4().hex}@example.com'
password = 'E2E-test-password-long'

os.makedirs('artifacts', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    context.tracing.start(screenshots=True, snapshots=True)
    try:
        page = context.new_page()
        page.goto(base + '/login.html')
        page.get_by_label('Email:', exact=True).fill(admin_email)
        page.get_by_label('Password:', exact=True).fill(admin_password)
        page.get_by_role('button', name='Login', exact=True).click()
        expect(page.get_by_role('heading', name='Twoja biblioteka IT')).to_be_visible()
        for title in ['Python start', 'Python następny krok']:
            page.get_by_role('button', name='Dodaj materiał', exact=True).click()
            page.get_by_label('Rodzaj', exact=True).last.select_option('article')
            page.get_by_label('Tytuł', exact=True).fill(title)
            page.get_by_label('Tagi oddzielone przecinkami').fill('python')
            page.get_by_label('Treść artykułu (Markdown)').fill('# Python\nPrzykład nauki Pythona.')
            page.get_by_label('Opublikuj w katalogu').check()
            page.get_by_role('button', name='Zapisz materiał').click()
            expect(page.locator('#editor')).not_to_be_visible()
        page.get_by_role('button', name='Wyloguj').click()
        page.goto(base + '/register.html')
        page.get_by_label('Email:', exact=True).fill(email)
        page.get_by_label('Password:', exact=True).fill(password)
        page.get_by_role('button', name='Register', exact=True).click()
        page.wait_for_url('**/login.html')
        page.get_by_label('Email:', exact=True).fill(email)
        page.get_by_label('Password:', exact=True).fill(password)
        page.get_by_role('button', name='Login', exact=True).click()
        expect(page.locator('#identity')).to_have_text(email)
        expect(page.get_by_role('button', name='Dodaj materiał', exact=True)).not_to_be_visible()
        page.get_by_label('Szukaj', exact=True).fill('Python start')
        page.get_by_role('button', name='Szukaj', exact=True).click()
        page.locator('#materials').get_by_role('button', name='Otwórz', exact=True).click()
        expect(page.locator('#viewerTitle')).to_have_text('Python start')
        page.get_by_label('Ocena', exact=True).select_option('5')
        page.get_by_role('button', name='Zapisz ocenę').click()
        expect(page.locator('#viewerMessage')).to_have_text('Ocena zapisana.')
        expect(page.locator('#recommendationMode')).to_have_text('Na podstawie Twoich zainteresowań i ocen.')
        expect(page.locator('#recommendations')).to_contain_text('Python następny krok')
        page.get_by_role('button', name='Zamknij materiał', exact=True).click()
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path='artifacts/catalog-mobile.png', full_page=True)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        # Backend authorization is checked separately from hidden UI controls.
        token = page.evaluate('localStorage.getItem("token")')
        response = context.request.post(api + '/materials', headers={'Authorization': f'Bearer {token}'}, data={'type':'article'})
        assert response.status == 403
    finally:
        os.makedirs('artifacts', exist_ok=True)
        context.tracing.stop(path='artifacts/e2e-trace.zip')
        browser.close()
