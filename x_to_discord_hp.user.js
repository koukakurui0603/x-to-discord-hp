// ==UserScript==
// @name         Xポスト → Discord転送ボタン (個人サイトHP連携・リポスト対応版)
// @namespace    https://github.com/koukakurui0603/
// @version      1.1
// @description  X(旧Twitter)の各ポスト下部に「📌」ボタンを追加し、1クリックで指定したDiscordチャンネルへ送信します。リポストの自動判定にも対応。
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      discord.com
// @connect      discordapp.com
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_WEBHOOK_KEY     = 'x_hp_webhook_url_v1';
    const STORAGE_ICON_KEY        = 'x_hp_button_icon_v1';
    const STORAGE_MY_ID_KEY       = 'x_hp_my_screen_name_v1';
    const STORAGE_REPOST_NAME_KEY = 'x_hp_repost_display_name_v1';

    function getWebhookUrl()   { return GM_getValue(STORAGE_WEBHOOK_KEY, ''); }
    function getButtonIcon()   { return GM_getValue(STORAGE_ICON_KEY, '📌') || '📌'; }
    function getMyScreenName() { return GM_getValue(STORAGE_MY_ID_KEY, '').replace(/^@+/, '').trim(); }
    function getRepostName()   { return GM_getValue(STORAGE_REPOST_NAME_KEY, '').trim(); }

    // ==========================================
    // ⚙️ 送信先Webhook＆リポスト設定モーダル
    // ==========================================
    function openSettingsModal() {
        const existing = document.getElementById('x-hp-settings-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'x-hp-settings-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:2147483647; display:flex; justify-content:center; align-items:center; padding:16px;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#ffffff; color:#222222; border-radius:16px; padding:20px; width:100%; max-width:480px; box-shadow:0 10px 30px rgba(0,0,0,0.35); font-family:sans-serif; font-size:14px; line-height:1.5; box-sizing:border-box;';

        const title = document.createElement('div');
        title.textContent = '⚙️ HP用 Discord中継チャンネル設定';
        title.style.cssText = 'font-weight:bold; font-size:16px; margin-bottom:10px; color:#111111;';

        const desc = document.createElement('div');
        desc.textContent = 'Xの各ポストに追加されるボタンを押した時に、URLを送信するDiscordチャンネルのWebhook URLなどを設定します。';
        desc.style.cssText = 'font-size:12px; color:#555555; margin-bottom:14px;';

        function createField(labelText, placeholderText, initialValue, isMono = false) {
            const label = document.createElement('div');
            label.textContent = labelText;
            label.style.cssText = 'font-size:12px; font-weight:bold; margin-bottom:4px; color:#333333;';

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = placeholderText;
            input.value = initialValue;
            input.style.cssText = `width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cccccc; border-radius:8px; font-size:13px; margin-bottom:12px; ${isMono ? 'font-family:monospace; font-size:12px;' : ''}`;
            return { label, input };
        }

        const fUrl   = createField('Discord Webhook URL（必須）', 'https://discord.com/api/webhooks/...', getWebhookUrl(), true);
        const fIcon  = createField('ボタンに表示する絵文字（初期値: 📌）', '📌 や 🦀 など', getButtonIcon());
        fIcon.input.style.width = '120px';
        fIcon.input.style.textAlign = 'center';
        fIcon.input.style.fontSize = '16px';

        const fMyId  = createField('あなたのXのID（任意：@なし。他人のポストを送った時もリポスト扱いになります）', '例: koukaku_rui0307', getMyScreenName(), true);
        const fRName = createField('リポスト時の表示名（任意：空欄ならサイト側の初期名を使用）', '例: 高殻るい', getRepostName());

        const statusArea = document.createElement('div');
        statusArea.style.cssText = 'font-size:12px; min-height:18px; margin-bottom:12px; font-weight:bold;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;';

        const testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.textContent = '🔍 接続確認';
        testBtn.style.cssText = 'padding:8px 12px; border:1px solid #cccccc; background:#f5f5f5; color:#333333; border-radius:8px; cursor:pointer; font-size:13px;';
        testBtn.onclick = function() {
            const u = fUrl.input.value.trim();
            if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/.test(u)) {
                statusArea.style.color = '#d32f2f';
                statusArea.textContent = '❌ Webhook URLの形式が正しくありません。';
                return;
            }
            statusArea.style.color = '#333333';
            statusArea.textContent = '⏳ 確認中...';
            GM_xmlhttpRequest({
                method: 'GET',
                url: u,
                onload: function(res) {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const data = JSON.parse(res.responseText);
                            statusArea.style.color = '#2e7d32';
                            statusArea.textContent = `✅ 接続OK！（Webhook名: ${data.name || '名称なし'}）`;
                        } catch (e) {
                            statusArea.style.color = '#2e7d32';
                            statusArea.textContent = '✅ 接続OK！';
                        }
                    } else {
                        statusArea.style.color = '#d32f2f';
                        statusArea.textContent = `❌ 接続エラー (${res.status})`;
                    }
                },
                onerror: function() {
                    statusArea.style.color = '#d32f2f';
                    statusArea.textContent = '❌ 通信に失敗しました。';
                }
            });
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '閉じる';
        cancelBtn.style.cssText = 'padding:8px 14px; border:1px solid #cccccc; background:#ffffff; color:#333333; border-radius:8px; cursor:pointer; font-size:13px;';
        cancelBtn.onclick = function() { overlay.remove(); };

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '💾 保存する';
        saveBtn.style.cssText = 'padding:8px 16px; border:none; background:#5865F2; color:#ffffff; font-weight:bold; border-radius:8px; cursor:pointer; font-size:13px;';
        saveBtn.onclick = function() {
            const newUrl   = fUrl.input.value.trim();
            const newIcon  = fIcon.input.value.trim() || '📌';
            const newMyId  = fMyId.input.value.replace(/^@+/, '').trim();
            const newRName = fRName.input.value.trim();

            GM_setValue(STORAGE_WEBHOOK_KEY, newUrl);
            GM_setValue(STORAGE_ICON_KEY, newIcon);
            GM_setValue(STORAGE_MY_ID_KEY, newMyId);
            GM_setValue(STORAGE_REPOST_NAME_KEY, newRName);

            document.querySelectorAll('.x-hp-send-btn').forEach(b => {
                if (b.dataset.sending !== '1') b.textContent = newIcon;
            });
            overlay.remove();
        };

        btnRow.appendChild(testBtn);
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);

        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(fUrl.label);
        card.appendChild(fUrl.input);
        card.appendChild(fIcon.label);
        card.appendChild(fIcon.input);
        card.appendChild(fMyId.label);
        card.appendChild(fMyId.input);
        card.appendChild(fRName.label);
        card.appendChild(fRName.input);
        card.appendChild(statusArea);
        card.appendChild(btnRow);
        overlay.appendChild(card);

        overlay.onclick = function(e) {
            if (e.target === overlay) overlay.remove();
        };
        document.body.appendChild(overlay);
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ HP転送先Webhook設定を開く', openSettingsModal);
    }

    // ==========================================
    // 🔍 正確なツイートURL＆リポスト判定を抽出
    // ==========================================
    function extractTweetInfo(article) {
        if (!article) return null;

        let tweetUrl = null;
        let tweetAuthorId = '';

        // 1. 親ツイートのユーザー名ヘッダー内にある時間リンクを優先
        const userNameBlock = article.querySelector('div[data-testid="User-Name"]');
        if (userNameBlock) {
            const headerLinks = userNameBlock.querySelectorAll('a[href*="/status/"]');
            for (const a of headerLinks) {
                const href = a.getAttribute('href');
                const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
                if (m) {
                    tweetAuthorId = m[1];
                    tweetUrl = `https://x.com/${m[1]}/status/${m[2]}`;
                    break;
                }
            }
        }

        // 2. 個別ポスト詳細ページ（メインツイートは日時が下にある）の場合
        if (!tweetUrl) {
            const pageMatch = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
            if (pageMatch) {
                const detailLink = article.querySelector(`a[href*="/status/${pageMatch[2]}"]`);
                if (detailLink) {
                    tweetAuthorId = pageMatch[1];
                    tweetUrl = `https://x.com/${pageMatch[1]}/status/${pageMatch[2]}`;
                }
            }
        }

        // 3. フォールバック
        if (!tweetUrl) {
            const anyLinks = article.querySelectorAll('a[href*="/status/"]');
            for (const a of anyLinks) {
                if (a.querySelector('time')) {
                    const href = a.getAttribute('href');
                    const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
                    if (m) {
                        tweetAuthorId = m[1];
                        tweetUrl = `https://x.com/${m[1]}/status/${m[2]}`;
                        break;
                    }
                }
            }
        }

        if (!tweetUrl) return null;

        // --- リポスト判定 ---
        const customRepostName = getRepostName();
        const myId = getMyScreenName();
        let repostHeader = '';

        // X画面上の「〇〇さんがリポストしました」「リポスト済み」をチェック
        const socialCtx = article.querySelector('[data-testid="socialContext"]');
        if (socialCtx) {
            const ctxText = (socialCtx.textContent || '').trim();
            const isPinned = /固定|Pinned/i.test(ctxText);
            const isRepost = /リポスト|repost|retweet/i.test(ctxText);

            if (!isPinned && isRepost) {
                // 「リポスト済み」「あなたがリポストしました」「You reposted」等の自分表記か判定
                if (/^(リポスト済み|あなたがリポスト|You reposted|You retweeted)/i.test(ctxText)) {
                    repostHeader = customRepostName ? `🔁 ${customRepostName}がリポストしました` : '🔁 REPOST';
                } else {
                    // 「〇〇さんがリポストしました」の文言をそのまま活用
                    repostHeader = `🔁 ${ctxText}`;
                }
            }
        }

        // 自分のID設定があり、投稿者が自分以外だった場合もリポスト扱い
        if (!repostHeader && myId && tweetAuthorId && tweetAuthorId.toLowerCase() !== myId.toLowerCase()) {
            repostHeader = customRepostName ? `🔁 ${customRepostName}がリポストしました` : '🔁 REPOST';
        }

        return { tweetUrl, repostHeader };
    }

    // ==========================================
    // 📌 ポスト下部にボタンを差し込む
    // ==========================================
    function attachButtons() {
        const actionBars = document.querySelectorAll('article[data-testid="tweet"] div[role="group"]');
        const iconChar = getButtonIcon();

        actionBars.forEach(bar => {
            if (!bar.querySelector('[data-testid="reply"], [data-testid="like"], [data-testid="unlike"]')) {
                return;
            }
            if (bar.querySelector('.x-hp-send-wrap')) return;

            const article = bar.closest('article[data-testid="tweet"]');
            if (!article) return;

            const wrap = document.createElement('div');
            wrap.className = 'x-hp-send-wrap';
            wrap.style.cssText = 'display:flex; align-items:center; margin-left:4px;';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'x-hp-send-btn';
            btn.textContent = iconChar;
            btn.title = 'このポストをDiscord経由でHPに送る';
            btn.style.cssText = [
                'background:transparent',
                'border:none',
                'border-radius:9999px',
                'width:34px',
                'height:34px',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                'font-size:16px',
                'cursor:pointer',
                'padding:0',
                'transition:background-color 0.2s, transform 0.15s',
                'opacity:0.75'
            ].join(';');

            btn.onmouseenter = function() {
                btn.style.backgroundColor = 'rgba(255, 133, 179, 0.22)';
                btn.style.opacity = '1';
            };
            btn.onmouseleave = function() {
                btn.style.backgroundColor = 'transparent';
                if (btn.dataset.sending !== '1') btn.style.opacity = '0.75';
            };

            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();

                const webhookUrl = getWebhookUrl();
                if (!webhookUrl) {
                    openSettingsModal();
                    return;
                }

                if (btn.dataset.sending === '1') return;

                const info = extractTweetInfo(article);
                if (!info || !info.tweetUrl) {
                    alert('このポストのURLを取得できませんでした。');
                    return;
                }

                const payloadText = info.repostHeader
                    ? `${info.repostHeader}\n${info.tweetUrl}`
                    : info.tweetUrl;

                const currentIcon = getButtonIcon();
                btn.dataset.sending = '1';
                btn.textContent = '⏳';
                btn.style.opacity = '1';

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: webhookUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ content: payloadText }),
                    onload: function(res) {
                        btn.textContent = (res.status >= 200 && res.status < 300) ? '✅' : '❌';
                        setTimeout(() => {
                            btn.textContent = currentIcon;
                            btn.dataset.sending = '0';
                            btn.style.opacity = '0.75';
                        }, 1800);
                    },
                    onerror: function() {
                        btn.textContent = '❌';
                        setTimeout(() => {
                            btn.textContent = currentIcon;
                            btn.dataset.sending = '0';
                            btn.style.opacity = '0.75';
                        }, 1800);
                    }
                });
            };

            wrap.appendChild(btn);
            bar.appendChild(wrap);
        });
    }

    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            attachButtons();
        }, 250);
    });

    attachButtons();
    observer.observe(document.body, { childList: true, subtree: true });
})();