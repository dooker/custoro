// node --test "scripts/*.test.mjs"   (npm run test:scripts; CI runs it in the version job)
//
// The Release workflow tags and publishes whatever commit it runs on. A push only starts it on
// main, but a manual run (workflow_dispatch) can be started on any branch, so the job itself must
// refuse every other ref before it does anything. Copilot review of PR 24, round 2 (high).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const steps = workflow.slice(workflow.indexOf('steps:')).split(/\n\s+- name: /).slice(1);

test('the Release workflow stops first when it does not run on main', () => {
    const guard = steps[0];

    assert.match(guard, /^Only from main/, 'the first step is the guard');
    assert.match(guard, /if: github\.ref != 'refs\/heads\/main'/);
    assert.match(guard, /exit 1/);
});

test('nothing is checked out, built, pushed or tagged before the guard', () => {
    const before = workflow.slice(0, workflow.indexOf('- name: Only from main'));

    for (const action of ['actions/checkout', 'docker-build.sh', 'docker push', 'gh release create']) {
        assert.equal(before.includes(action), false, action);
    }
});
