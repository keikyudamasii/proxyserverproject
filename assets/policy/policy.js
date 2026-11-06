const CONSENT_COOKIE_NAME = 'policyConsent';
const CONSENT_EXPIRY_DAYS = 21; // プライバシーポリシーのログ保管期間(3週間)に合わせている

// Cookieに同意済みの状態を保存する
const saveConsent = () => {
    const expires = new Date(Date.now() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${CONSENT_COOKIE_NAME}=accepted; expires=${expires}; path=/`;
};

// 「了解した」ボタン: 同意を保存してトップページへ戻る
const acceptPolicy = () => {
    saveConsent();
    location.href = '/';
};

// 「拒否する」ボタン: 同意いただけない場合はGoogleへ誘導する
const declinePolicy = () => {
    alert('同意いただけない場合、本サービスはご利用いただけません。Googleへ移動します。');
    location.href = 'https://www.google.com';
};

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

// 未同意の場合はポリシーページへリダイレクトする
const checkPolicyConsent = () => {
    if (getConsent() !== 'accepted') {
        location.href = '/policy.html';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const acceptButton = document.getElementById('accept-button');
    const declineButton = document.getElementById('decline-button');
    if (acceptButton && declineButton) {
        acceptButton.addEventListener('click', acceptPolicy);
        declineButton.addEventListener('click', declinePolicy);
    }
});
