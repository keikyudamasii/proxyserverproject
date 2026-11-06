const CONSENT_COOKIE_NAME = 'policyConsent';

// Cookieから同意状態を取得する(未同意の場合は null)
const getConsent = () => {
    const cookies = document.cookie.split('; ');
    for (const cookie of cookies) {
        const separator = cookie.indexOf('=');
        const name = cookie.slice(0, separator);
        const value = cookie.slice(separator + 1);
        if (name === CONSENT_COOKIE_NAME) return value;
    }
    return null;
};

// 未同意ならポリシーページへリダイレクトする
document.addEventListener('DOMContentLoaded', () => {
    if (getConsent() !== 'accepted') {
        location.href = '/policy.html';
    }
});
