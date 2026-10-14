/*******************************************************************************

    Aegis — store-safe blocked-request snapshot

    Pure helper for declarativeNetRequest.getMatchedRules(). Errors are
    intentionally propagated: an unavailable count is not the number zero.

*******************************************************************************/

export async function countMatchedRulesForTab(tabId, getMatchedRules, ruleKind, categorize) {
    if ( Number.isInteger(tabId) === false || tabId < 0 ) {
        throw new Error('Invalid tab id for blocked-request count');
    }
    if ( typeof getMatchedRules !== 'function' ) {
        throw new Error('Matched-rule feedback is not available');
    }
    const result = await getMatchedRules({ tabId });
    if ( Array.isArray(result?.rulesMatchedInfo) === false ) {
        throw new Error('Invalid matched-rule response');
    }

    const out = {
        blocked: 0,
        cleaned: 0,
        cats: { ads: 0, trackers: 0, malware: 0, annoyances: 0 },
        domains: {},
    };
    for ( const { rule } of result.rulesMatchedInfo ) {
        if ( rule === undefined ) { continue; }
        const kind = await ruleKind(rule.rulesetId, rule.ruleId);
        if ( kind === 'clean' ) {
            out.cleaned += 1;
            continue;
        }
        if ( kind !== 'block' && kind !== 'redirect' && kind !== 'strictblock' ) {
            continue;
        }
        out.blocked += 1;
        out.cats[categorize(kind, rule.rulesetId, '')] += 1;
    }
    return out;
}
