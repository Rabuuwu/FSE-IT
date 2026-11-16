import test from 'node:test';
import assert from 'node:assert/strict';
import { demoMaterials } from '../scripts/demo-materials.js';
import { materialInput } from '../server/validation.js';

test('demo set contains fifty unique, attributed learning materials with exercises and official references', () => {
    assert.equal(demoMaterials.length, 50);
    assert.equal(new Set(demoMaterials.map(item => item.title)).size, 50);
    for (const item of demoMaterials) {
        assert.doesNotThrow(() => materialInput(item));
        assert.ok(item.owner.endsWith('@fse.test'));
        assert.ok(item.author.length > 3);
        assert.ok(item.description.length > 45);
        assert.ok(item.tags.length >= 3);
        if (item.type === 'article') {
            assert.ok(item.content.includes('## Ćwiczenie praktyczne'));
            assert.ok(item.content.includes('## Typowe pułapki'));
            assert.match(item.content, /https:\/\//);
        } else {
            assert.equal(item.type, 'course');
            assert.equal(item.stages.length, 3);
            assert.ok(item.stages.every(stage => stage.title && stage.content.length > 100));
        }
    }
});
