"""Real-stack learning smoke test; only run against the isolated test harness."""
import os
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

if not os.environ.get('TEST_DATABASE_URL', '').split('?')[0].endswith('_test'):
    raise SystemExit('Requires explicit TEST_DATABASE_URL ending in _test')
base = os.environ['E2E_FRONTEND_URL']
api = os.environ['E2E_API_URL']
with sync_playwright() as p:
    chrome = os.environ.get('E2E_CHROME_EXECUTABLE')
    local = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if not chrome and Path(local).is_file():
        chrome = local
    browser = p.chromium.launch(headless=True, **({'executable_path': chrome} if chrome else {}))
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    context.tracing.start(screenshots=True, snapshots=True)
    try:
        request = context.request
        admin = request.post(api + '/login', data={'email': os.environ['E2E_ADMIN_EMAIL'], 'password': os.environ['E2E_ADMIN_PASSWORD']}).json()['token']
        headers = {'Authorization': 'Bearer ' + admin}
        title = 'Learning E2E ' + uuid.uuid4().hex
        created = request.post(api + '/materials', headers=headers, data={'type': 'course', 'title': title, 'tags': ['python'], 'stages': [{'title': 'First lesson', 'content': 'Exercise'}]})
        assert created.status == 201
        mid = created.json()['id']
        submitted = request.post(f'{api}/materials/{mid}/submit', headers=headers, data={'revision': created.json()['revision']})
        assert submitted.status == 200
        assert request.post(f'{api}/admin/materials/{mid}/review', headers=headers, data={'revision': submitted.json()['revision'], 'decision': 'approve'}).status == 200
        assert request.put(f'{api}/materials/{mid}/quiz', headers=headers, data={'questions': [{'text': '2 + 2?', 'options': ['3', '4'], 'answer': 1, 'explanation': 'Addition'}]}).status == 204
        email = 'learning-' + uuid.uuid4().hex + '@example.com'
        password = 'Learning-test-password-long'
        assert request.post(api + '/register', data={'email': email, 'password': password}).status == 201
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(base + '/login.html')
        page.get_by_label('Email:', exact=True).fill(email)
        page.get_by_label('Password:', exact=True).fill(password)
        page.get_by_role('button', name='Login', exact=True).click()
        page.wait_for_url('**/dashboard.html')
        token = page.evaluate('localStorage.getItem("token")')
        page.goto(f'{base}/material.html?id={mid}')
        page.get_by_role('button', name='Zapisz na później', exact=True).click()
        expect(page.get_by_role('button', name='Usuń zakładkę', exact=True)).to_be_visible()
        page.get_by_label('Prywatna notatka', exact=True).fill('Private browser note')
        page.get_by_role('button', name='Zapisz notatkę', exact=True).click()
        page.get_by_label('Etap 1: First lesson', exact=True).check()
        expect(page.locator('#learningTools')).to_contain_text('Postęp zapisany.')
        page.get_by_label('4', exact=True).check()
        page.get_by_role('button', name='Sprawdź odpowiedzi', exact=True).click()
        expect(page.locator('#learningTools')).to_contain_text('Wynik: 1/1')
        page.reload()
        expect(page.get_by_label('Prywatna notatka', exact=True)).to_have_value('Private browser note')
        expect(page.get_by_label('Etap 1: First lesson', exact=True)).to_be_checked()
        page.goto(base + '/learning.html')
        expect(page.locator('#learningList')).to_contain_text(title)
        expect(page.locator('#learningList')).to_contain_text('1/1')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path='artifacts/learning-mobile.png', full_page=True)
        assert not errors, errors
        page.locator('#accountToggle').click()
        page.get_by_role('button', name='Wyloguj', exact=True).click()
        page.wait_for_url('**/login.html')
        assert request.get(api + '/me', headers={'Authorization': 'Bearer ' + token}).status == 401
        assert request.delete(f'{api}/materials/{mid}', headers=headers).status == 204
    finally:
        context.tracing.stop(path='artifacts/learning-e2e-trace.zip')
        context.close()
        browser.close()
print('PASS: bookmarks, private notes, persisted progress, quiz, mobile layout, server logout')
