/*******************************************************************************

    Aegis — friendly names for the stock filter lists

*******************************************************************************/

// Friendly names and descriptions for the stock rulesets
export const LIST_META = {
    'ublock-filters': { name: 'uBlock filters', icon: 'shield-check', desc: 'The core uBlock Origin list: ads, trackers, anti-adblock walls and site fixes.' },
    'easylist': { name: 'EasyList', icon: 'ban', desc: 'The most widely used list of ad filters.' },
    'easyprivacy': { name: 'EasyPrivacy', icon: 'eye-off', desc: 'Blocks tracking scripts, pixels and analytics.' },
    'pgl': { name: 'Peter Lowe’s blocklist', icon: 'globe', desc: 'Blocks known ad and tracking servers.' },
    'ublock-badware': { name: 'Badware risks', icon: 'shield-alert', desc: 'Sites known to push scams, fake updates and unwanted software.' },
    'urlhaus-full': { name: 'Malicious URL blocklist', icon: 'bug', desc: 'Sites spreading malware, from the URLhaus database.' },
    'adguard-mobile': { name: 'Mobile ads', icon: 'phone', desc: 'Ads specific to mobile versions of websites.' },
    'block-lan': { name: 'Block local network access', icon: 'router', desc: 'Stops websites from probing devices on your home network.' },
    'adguard-spyware-url': { name: 'URL tracking protection', icon: 'link', desc: 'Removes tracking parameters (like utm_source) from links you open.' },
    'annoyances-cookies': { name: 'Cookie notices', icon: 'cookie', desc: 'Hides cookie consent banners and pop-ups.' },
    'annoyances-overlays': { name: 'Overlays & pop-ups', icon: 'overlay', desc: 'Removes newsletter pop-ups, sign-in nags and page overlays.' },
    'annoyances-social': { name: 'Social widgets', icon: 'share', desc: 'Hides share buttons and embedded social media widgets.' },
    'annoyances-widgets': { name: 'Chat widgets', icon: 'message', desc: 'Hides customer support chat bubbles.' },
    'annoyances-notifications': { name: 'Notification prompts', icon: 'bell', desc: 'Hides “allow notifications” requests and banners.' },
    'annoyances-ai': { name: 'AI widgets', icon: 'bot', desc: 'Hides AI assistants and chatbots added to websites.' },
    'annoyances-others': { name: 'Other annoyances', icon: 'sparkles', desc: 'Everything else that gets in the way of reading.' },
    'ublock-experimental': { name: 'Experimental filters', icon: 'flask', desc: 'Filters being tested by the uBlock Origin team. May cause issues.' },
    'ubol-tests': { name: 'Engine test filters', icon: 'flask', desc: 'Used to test the blocking engine. Not useful for everyday browsing.' },
};

const reFlags = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

// Short display name for any ruleset (stock, regional or imported)
export function shortListName(ruleset) {
    if ( ruleset === undefined ) { return ''; }
    const meta = LIST_META[ruleset.id];
    if ( meta ) { return meta.name; }
    const name = ruleset.name ?? ruleset.id;
    const pos = name.indexOf(': ');
    return (pos !== -1 ? name.slice(pos + 2) : name.replace(reFlags, '')).trim();
}
