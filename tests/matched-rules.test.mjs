import test from 'node:test';
import assert from 'node:assert/strict';
import { countMatchedRulesForTab } from '../src/js/aegis/lib/matched-rules.js';

const kindFor = async (rulesetId, ruleId) => ({
    1: 'block',
    2: 'redirect',
    3: 'clean',
    4: 'allow',
    5: 'strictblock',
    6: 'modifyHeaders',
})[ruleId];
const categoryFor = kind => kind === 'strictblock' ? 'malware' : 'ads';

test('counts only blocking actions and tracks cleaned links separately', async () => {
    let calledWith;
    const result = await countMatchedRulesForTab(
        123,
        async filter => {
            calledWith = filter;
            return {
                rulesMatchedInfo: [ 1, 2, 3, 4, 5, 6 ]
                    .map(ruleId => ({ rule: { rulesetId: 'main', ruleId } })),
            };
        },
        kindFor,
        categoryFor
    );
    assert.deepEqual(calledWith, { tabId: 123 });
    assert.equal(result.blocked, 3);
    assert.equal(result.cleaned, 1);
    assert.deepEqual(result.cats, { ads: 2, trackers: 0, malware: 1, annoyances: 0 });
    assert.deepEqual(result.domains, {});
});

test('a genuinely empty match response is an available count of zero', async () => {
    const result = await countMatchedRulesForTab(
        123, async () => ({ rulesMatchedInfo: [] }), kindFor, categoryFor
    );
    assert.equal(result.blocked, 0);
});

test('quota and permission failures are not silently converted to zero', async () => {
    for ( const message of [ 'MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL', 'Missing activeTab permission' ] ) {
        await assert.rejects(
            countMatchedRulesForTab(123, async () => { throw Error(message); }, kindFor, categoryFor),
            error => error.message === message
        );
    }
});

test('missing API, invalid response and invalid tab are reported as errors', async () => {
    await assert.rejects(countMatchedRulesForTab(123, null, kindFor, categoryFor), /not available/);
    await assert.rejects(countMatchedRulesForTab(123, async () => ({}), kindFor, categoryFor), /Invalid matched-rule response/);
    await assert.rejects(countMatchedRulesForTab(-1, async () => ({}), kindFor, categoryFor), /Invalid tab id/);
});
