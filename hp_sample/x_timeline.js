document.addEventListener('DOMContentLoaded', function() {
    const tweetListEl = document.getElementById('tweet-list');
    const refreshBtn = document.getElementById('refresh-tweets-btn');

    function isSafeHttpUrl(url) {
        return typeof url === 'string' && /^https?:\/\//i.test(url);
    }

    function renderTweets(items, noticeText) {
        if (!tweetListEl) return;
        while (tweetListEl.firstChild) {
            tweetListEl.removeChild(tweetListEl.firstChild);
        }

        if (noticeText) {
            const noteDiv = document.createElement('div');
            noteDiv.className = 'xtl-notice';
            noteDiv.textContent = noticeText;
            tweetListEl.appendChild(noteDiv);
        }

        if (!Array.isArray(items) || items.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'xtl-loading';
            emptyDiv.textContent = 'まだ表示できるポストがありません。';
            tweetListEl.appendChild(emptyDiv);
            return;
        }

        items.forEach(item => {
            const card = document.createElement('article');
            card.className = 'xtl-item';

            if (item.reposted_by) {
                const repostLabel = document.createElement('div');
                repostLabel.className = 'xtl-repost-label';
                repostLabel.textContent = `🔁 ${item.reposted_by}`;
                card.appendChild(repostLabel);
            }

            const head = document.createElement('div');
            head.className = 'xtl-head';

            if (item.avatar_url) {
                const avatar = document.createElement('img');
                avatar.className = 'xtl-avatar';
                avatar.src = item.avatar_url;
                avatar.alt = item.author_name || 'avatar';
                avatar.loading = 'lazy';
                avatar.onerror = function() { this.style.display = 'none'; };
                head.appendChild(avatar);
            }

            const info = document.createElement('div');
            info.className = 'xtl-author-info';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'xtl-name';
            nameSpan.textContent = item.author_name || 'User';

            info.appendChild(nameSpan);
            if (item.author_handle) {
                const handleSpan = document.createElement('span');
                handleSpan.className = 'xtl-handle';
                handleSpan.textContent = item.author_handle;
                info.appendChild(handleSpan);
            }

            const dateSpan = document.createElement('span');
            dateSpan.className = 'xtl-date';
            dateSpan.textContent = item.date_text || '';

            head.appendChild(info);
            head.appendChild(dateSpan);
            card.appendChild(head);

            if (item.text) {
                const body = document.createElement('div');
                body.className = 'xtl-body';
                body.textContent = item.text;
                card.appendChild(body);
            }

            if (item.quote && item.quote.text) {
                const quoteBox = document.createElement('div');
                quoteBox.className = 'xtl-quote';

                const qAuthor = document.createElement('div');
                qAuthor.className = 'xtl-quote-author';
                qAuthor.textContent = `引用: ${item.quote.author_name || ''} ${item.quote.author_handle || ''}`;

                const qText = document.createElement('div');
                qText.textContent = item.quote.text;

                quoteBox.appendChild(qAuthor);
                quoteBox.appendChild(qText);
                card.appendChild(quoteBox);
            }

            if (Array.isArray(item.images) && item.images.length > 0) {
                const mediaGrid = document.createElement('div');
                mediaGrid.className = 'xtl-media-grid';

                item.images.forEach(imgUrl => {
                    if (!isSafeHttpUrl(imgUrl)) return;
                    const link = document.createElement('a');
                    link.href = imgUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';

                    const img = document.createElement('img');
                    img.className = 'xtl-media-img';
                    img.src = imgUrl;
                    img.alt = '添付画像';
                    img.loading = 'lazy';

                    link.appendChild(img);
                    mediaGrid.appendChild(link);
                });
                card.appendChild(mediaGrid);
            }

            if (isSafeHttpUrl(item.tweet_url)) {
                const extLink = document.createElement('a');
                extLink.className = 'xtl-ext-link';
                extLink.href = item.tweet_url;
                extLink.target = '_blank';
                extLink.rel = 'noopener noreferrer';
                extLink.textContent = '𝕏 元のポストを開く ↗';
                card.appendChild(extLink);
            }

            tweetListEl.appendChild(card);
        });
    }

    async function loadTweets(forceRefresh = false) {
        if (!tweetListEl) return;

        if (window.location.protocol === 'file:') {
            renderTweets([
                {
                    author_name: 'サンプルユーザー',
                    author_handle: '@sample_user',
                    date_text: 'プレビュー表示',
                    text: 'PHPが動くサーバーへアップロードすると、Discord中継チャンネルに送った最新50件のポストがここに自動展開されます！',
                    tweet_url: 'https://x.com/'
                },
                {
                    reposted_by: 'サンプルユーザーがリポストしました',
                    author_name: '別のアカウント',
                    author_handle: '@other_user',
                    date_text: 'プレビュー表示',
                    text: 'リポストした投稿を送った場合は、上にリポスト表示が自動で付きます。',
                    tweet_url: 'https://x.com/'
                }
            ], '※現在ローカルプレビュー中です（サーバーへ配置すると実データが表示されます）');
            return;
        }

        if (forceRefresh && refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ 更新中...';
        }

        try {
            const url = forceRefresh ? 'api_tweets.php?refresh=1' : 'api_tweets.php';
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (!data.ok) {
                renderTweets([], `⚠️ ${data.message || '設定を確認してください'}`);
            } else {
                renderTweets(data.items || [], '');
            }
        } catch (err) {
            renderTweets([], '⚠️ データの取得に失敗しました（しばらくしてから更新をお試しください）');
        } finally {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 更新';
            }
        }
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            loadTweets(true);
        });
    }

    loadTweets(false);
});