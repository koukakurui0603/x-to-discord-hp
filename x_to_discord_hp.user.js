// ==UserScript==
// @name         Xポスト → Discord転送ボタン (個人サイトHP連携用)
// @namespace    https://github.com/koukakurui0603/
// @version      1.0
// @description  X(旧Twitter)の各ポスト下部に「📌」ボタンを追加し、1クリックで指定したDiscordチャンネル(Webhook)へポストURLを送信します。
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

    const STORAGE_WEBHOOK_KEY = 'x_hp_webhook_url_v1';
    const STORAGE_ICON_KEY = 'x_hp_button_icon_v1';

    function getWebhookUrl() {
        return GM_getValue(STORAGE_WEBHOOK_KEY, '');
    }

    function getButtonIcon() {
        return GM_getValue(STORAGE_ICON_KEY, '📌') || '📌';
    }

    // ==========================================
    // ⚙️ 送信先Webhook設定モーダル（Trusted Types対応）
    // ==========================================
    function openSettingsModal() {
        const existing = document.getElementById('x-hp-settings-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'x-hp-settings-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:2147483647; display:flex; justify-content:center; align-items:center; padding:16px;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#ffffff; color:#222222; border-radius:16px; padding:20px; width:100%; max-width:460px; box-shadow:0 10px 30px rgba(0,0,0,0.35); font-family:sans-serif; font-size:14px; line-height:1.5; box-sizing:border-box;';

        const title = document.createElement('div');
        title.textContent = '⚙️ HP用 Discord中継チャンネル設定';
        title.style.cssText = 'font-weight:bold; font-size:16px; margin-bottom:10px; color:#111111;';

        const desc = document.createElement('div');
        desc.textContent = 'Xの各ポストに追加されるボタンを押した時に、URLを送信するDiscordチャンネルのWebhook URLを入力してください。';
        desc.style.cssText = 'font-size:12px; color:#555555; margin-bottom:14px;';

        const labelUrl = document.createElement('div');
        labelUrl.textContent = 'Discord Webhook URL';
        labelUrl.style.cssText = 'font-size:12px; font-weight:bold; margin-bottom:4px;';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = 'https://discord.com/api/webhooks/...';
        urlInput.value = getWebhookUrl();
        urlInput.style.cssText = 'width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid #cccccc; border-radius:8px; font-family:monospace; font-size:12px; margin-bottom:12px;';

        const labelIcon = document.createElement('div');
        labelIcon.textContent = 'ボタンに表示する絵文字（初期値: 📌）';
        labelIcon.style.cssText = 'font-size:12px; font-weight:bold; margin-bottom:4px;';

        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.placeholder = '📌 や 🦀 など';
        iconInput.value = getButtonIcon();
        iconInput.style.cssText = 'width:120px; box-sizing:border-box; padding:6px 10px; border:1px solid #cccccc; border-radius:8px; font-size:16px; text-align:center; margin-bottom:12px;';

        const statusArea = document.createElement('div');
        statusArea.style.cssText = 'font-size:12px; min-height:18px; margin-bottom:12px; font-weight:bold;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;';

        const testBtn = document.createElement('button');
        testBtn.type = 'button';
        testBtn.textContent = '🔍 接続確認';
        testBtn.style.cssText = 'padding:8px 12px; border:1px solid #cccccc; background:#f5f5f5; color:#333333; border-radius:8px; cursor:pointer; font-size:13px;';
        testBtn.onclick = function() {
            const u = urlInput.value.trim();
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
        cancelBtn.onclick = function() {
            overlay.remove();
        };

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '💾 保存する';
        saveBtn.style.cssText = 'padding:8px 16px; border:none; background:#5865F2; color:#ffffff; font-weight:bold; border-radius:8px; cursor:pointer; font-size:13px;';
        saveBtn.onclick = function() {
            const newUrl = urlInput.value.trim();
            const newIcon = iconInput.value.trim() || '📌';
            GM_setValue(STORAGE_WEBHOOK_KEY, newUrl);
            GM_setValue(STORAGE_ICON_KEY, newIcon);

            // すでに画面に出ているボタンのアイコンも即時更新
            document.querySelectorAll('.x-hp-send-btn').forEach(b => {
                if (b.dataset.sending !== '1') {
                    b.textContent = newIcon;
                }
            });
            overlay.remove();
        };

        btnRow.appendChild(testBtn);
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);

        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(labelUrl);
        card.appendChild(urlInput);
        card.appendChild(labelIcon);
        card.appendChild(iconInput);
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
    // 🔍 各ポストから正確なツイートURLを抽出する
    // ==========================================
    function extractTweetUrl(article) {
        if (!article) return null;

        // 1. 親ツイートのユーザー名ヘッダー内にある時間リンクを優先（引用RT誤爆を防止）
        const userNameBlock = article.querySelector('div[data-testid="User-Name"]');
        if (userNameBlock) {
            const headerLinks = userNameBlock.querySelectorAll('a[href*="/status/"]');
            for (const a of headerLinks) {
                const href = a.getAttribute('href');
                const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
                if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
            }
        }

        // 2. 個別ポスト詳細ページ（メインツイートは日時が下にある）の場合
        const pageMatch = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
        if (pageMatch) {
            const detailLink = article.querySelector(`a[href*="/status/${pageMatch[2]}"]`);
            if (detailLink) {
                return `https://x.com/${pageMatch[1]}/status/${pageMatch[2]}`;
            }
        }

        // 3. フォールバック：最初に見つかった <time> 付きステータスリンク
        const anyLinks = article.querySelectorAll('a[href*="/status/"]');
        for (const a of anyLinks) {
            if (a.querySelector('time')) {
                const href = a.getAttribute('href');
                const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
                if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
            }
        }
        return null;
    }

    // ==========================================
    // 📌 ポスト下部にボタンを差し込む
    // ==========================================
    function attachButtons() {
        const actionBars = document.querySelectorAll('article[data-testid="tweet"] div[role="group"]');
        const iconChar = getButtonIcon();

        actionBars.forEach(bar => {
            // 「返信」や「いいね」ボタンが入っているメインのアクションバーだけを対象にする
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
                // クリックでツイート詳細画面へ遷移するのを防ぐ
                e.preventDefault();
                e.stopPropagation();

                const webhookUrl = getWebhookUrl();
                if (!webhookUrl) {
                    openSettingsModal();
                    return;
                }

                if (btn.dataset.sending === '1') return;

                const tweetUrl = extractTweetUrl(article);
                if (!tweetUrl) {
                    alert('このポストのURLを取得できませんでした。');
                    return;
                }

                const currentIcon = getButtonIcon();
                btn.dataset.sending = '1';
                btn.textContent = '⏳';
                btn.style.opacity = '1';

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: webhookUrl,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ content: tweetUrl }),
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

    // 画面スクロールで増えるポストにも対応
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