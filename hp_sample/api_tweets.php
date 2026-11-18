<?php
date_default_timezone_set('Asia/Tokyo');
error_reporting(E_ALL);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');

register_shutdown_function(function() {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) {
            http_response_code(200);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode([
            'ok' => false,
            'message' => 'PHP内部エラー: ' . $err['message'] . ' (ファイル: ' . basename($err['file']) . ' ' . $err['line'] . '行目)'
        ], JSON_UNESCAPED_UNICODE);
    }
});

$configPath = __DIR__ . '/tweet_config.php';
if (!file_exists($configPath)) {
    echo json_encode(['ok' => false, 'message' => 'tweet_config.php が見つかりません（tweet_config_sample.php をコピーして作成してください）。'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $config = require $configPath;
} catch (Throwable $e) {
    echo json_encode([
        'ok' => false,
        'message' => 'tweet_config.php の書き方にエラーがあります: ' . $e->getMessage() . ' (' . $e->getLine() . '行目)'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!is_array($config)) {
    echo json_encode(['ok' => false, 'message' => 'tweet_config.php が正しく配列を返していません。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$botToken  = trim($config['discord_bot_token'] ?? '');
$channelId = trim($config['discord_channel_id'] ?? '');
$cacheTtl  = max(15, (int)($config['cache_ttl_seconds'] ?? 60));

if (
    $botToken === '' || strpos($botToken, 'ここに') !== false ||
    $channelId === '' || strpos($channelId, 'ここに') !== false
) {
    echo json_encode(['ok' => false, 'message' => 'tweet_config.php に Botトークン と チャンネルID を設定してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$timelineCacheFile = __DIR__ . '/cache_tweets.json';
$fxCacheFile       = __DIR__ . '/cache_fx.json';
$forceRefresh      = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// 1. タイムラインキャッシュの確認
if (file_exists($timelineCacheFile)) {
    $age = time() - filemtime($timelineCacheFile);
    $effectiveTtl = $forceRefresh ? 10 : $cacheTtl;
    if ($age < $effectiveTtl) {
        $cachedData = json_decode(@file_get_contents($timelineCacheFile), true);
        if (is_array($cachedData) && !empty($cachedData['ok'])) {
            echo json_encode($cachedData, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
}

// 2. 外部通信用ヘルパー
function httpGetJson($url, $headers = []) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => $headers,
        ]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($body === false || $status < 200 || $status >= 300) {
            return ['ok' => false, 'status' => $status, 'error' => $err ?: "HTTP {$status}"];
        }
        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            return ['ok' => false, 'status' => $status, 'error' => 'JSON解析失敗'];
        }
        return ['ok' => true, 'status' => $status, 'data' => $decoded];
    }

    $headerText = implode("\r\n", $headers);
    $ctx = stream_context_create([
        'http' => [
            'method'        => 'GET',
            'header'        => $headerText,
            'timeout'       => 8,
            'ignore_errors' => true,
        ]
    ]);
    $body = @file_get_contents($url, false, $ctx);
    $status = 0;
    if (!empty($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d+)#', $http_response_header[0], $hm)) {
        $status = (int)$hm[1];
    }
    if ($body === false || $status < 200 || $status >= 300) {
        return ['ok' => false, 'status' => $status, 'error' => "HTTP {$status}"];
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'status' => $status, 'error' => 'JSON解析失敗'];
    }
    return ['ok' => true, 'status' => $status, 'data' => $decoded];
}

// 3. Discord チャンネルから最新50件を取得
$discordUrl = "https://discord.com/api/v10/channels/{$channelId}/messages?limit=50";
$discordRes = httpGetJson($discordUrl, [
    "Authorization: Bot {$botToken}",
    "User-Agent: DiscordBot (https://github.com/koukakurui0603/x-to-discord-hp, 1.0)"
]);

if (!$discordRes['ok']) {
    if (file_exists($timelineCacheFile)) {
        $old = json_decode(@file_get_contents($timelineCacheFile), true);
        if (is_array($old) && !empty($old['items'])) {
            echo json_encode($old, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    $st = $discordRes['status'] ?? 0;
    $hint = "Discordからの取得に失敗しました (HTTP {$st})。";
    if ($st === 401) $hint = 'Botトークンが無効です（tweet_config.php を確認してください）。';
    if ($st === 403) $hint = 'Botにこのチャンネルを見る権限がありません（サーバー招待・権限を確認してください）。';
    if ($st === 404) $hint = 'チャンネルIDが見つかりません（tweet_config.php を確認してください）。';
    echo json_encode(['ok' => false, 'message' => $hint], JSON_UNESCAPED_UNICODE);
    exit;
}

$messages = $discordRes['data'];

// 4. 個別ツイートキャッシュの読み込みと展開
$fxCache = [];
if (file_exists($fxCacheFile)) {
    $loadedFx = json_decode(@file_get_contents($fxCacheFile), true);
    if (is_array($loadedFx)) {
        $fxCache = $loadedFx;
    }
}
$fxCacheUpdated = false;

$items = [];
$emptyTextCount = 0;
$defaultAuthorName = $config['default_author_name'] ?? 'サイト管理人';
$defaultAvatarUrl  = $config['default_avatar_url'] ?? '';

foreach ($messages as $msg) {
    $rawContent = trim($msg['content'] ?? '');
    $attachments = $msg['attachments'] ?? [];
    $msgTimestamp = !empty($msg['timestamp']) ? strtotime($msg['timestamp']) : time();

    if ($rawContent === '' && empty($attachments)) {
        $emptyTextCount++;
        continue;
    }

    // 1行目に「🔁」または「[REPOST]」が付いていたらリポスト情報として抽出する
    $repostedBy = '';
    $normalized = str_replace(["\r\n", "\r"], "\n", $rawContent);
    $lines = explode("\n", $normalized);
    if (!empty($lines)) {
        $firstLine = trim($lines[0]);
        if (strpos($firstLine, '🔁') === 0 || stripos($firstLine, '[REPOST]') === 0) {
            $label = trim(str_replace(['🔁', '[REPOST]', '[repost]'], '', $firstLine));
            if ($label === '' || strtoupper($label) === 'REPOST') {
                $repostedBy = $defaultAuthorName . 'がリポストしました';
            } else {
                $repostedBy = $label;
            }
            array_shift($lines);
            $normalized = trim(implode("\n", $lines));
        }
    }

    // X (旧Twitter) のポストURLが含まれているかチェック
    if (preg_match('#https?://(?:www\.|mobile\.)?(?:x\.com|twitter\.com)/([A-Za-z0-9_]+)/status/(\d+)#i', $normalized, $m)) {
        $screenName = $m[1];
        $tweetId    = $m[2];
        $tweetUrl   = "https://x.com/{$screenName}/status/{$tweetId}";

        $tweetData = $fxCache[$tweetId] ?? null;

        if (!$tweetData) {
            $fxUrl = "https://api.fxtwitter.com/{$screenName}/status/{$tweetId}";
            $fxRes = httpGetJson($fxUrl, [
                "User-Agent: Mozilla/5.0 (compatible; PersonalSiteTimeline/1.0)"
            ]);
            if ($fxRes['ok'] && !empty($fxRes['data']['tweet'])) {
                $t = $fxRes['data']['tweet'];
                $images = [];

                if (!empty($t['media']['photos']) && is_array($t['media']['photos'])) {
                    foreach ($t['media']['photos'] as $p) {
                        if (!empty($p['url'])) $images[] = $p['url'];
                    }
                }
                if (!empty($t['media']['videos']) && is_array($t['media']['videos'])) {
                    foreach ($t['media']['videos'] as $v) {
                        if (!empty($v['thumbnail_url'])) $images[] = $v['thumbnail_url'];
                    }
                }

                $quote = null;
                if (!empty($t['quote']) && is_array($t['quote'])) {
                    $q = $t['quote'];
                    $quote = [
                        'author_name'   => $q['author']['name'] ?? '',
                        'author_handle' => !empty($q['author']['screen_name']) ? '@' . $q['author']['screen_name'] : '',
                        'text'          => $q['text'] ?? '',
                    ];
                }

                $createdTs = !empty($t['created_timestamp']) ? (int)$t['created_timestamp'] : $msgTimestamp;

                $tweetData = [
                    'author_name'   => $t['author']['name'] ?? $screenName,
                    'author_handle' => '@' . ($t['author']['screen_name'] ?? $screenName),
                    'avatar_url'    => $t['author']['avatar_url'] ?? $defaultAvatarUrl,
                    'date_text'     => date('Y/m/d H:i', $createdTs),
                    'text'          => $t['text'] ?? $tweetUrl,
                    'images'        => $images,
                    'quote'         => $quote,
                    'tweet_url'     => $t['url'] ?? $tweetUrl,
                ];

                $fxCache[$tweetId] = $tweetData;
                $fxCacheUpdated = true;
            }
        }

        if ($tweetData) {
            $entry = $tweetData;
            $entry['reposted_by'] = $repostedBy;
            $items[] = $entry;
        } else {
            $items[] = [
                'reposted_by'   => $repostedBy,
                'author_name'   => $defaultAuthorName,
                'author_handle' => "@{$screenName}",
                'avatar_url'    => $defaultAvatarUrl,
                'date_text'     => date('Y/m/d H:i', $msgTimestamp),
                'text'          => $normalized,
                'images'        => [],
                'quote'         => null,
                'tweet_url'     => $tweetUrl,
            ];
        }
    } else {
        // Discordチャンネルに直接書いた通常メモ投稿
        $discordImages = [];
        foreach ($attachments as $att) {
            $ctype = $att['content_type'] ?? '';
            if (strpos($ctype, 'image/') === 0 && !empty($att['url'])) {
                $discordImages[] = $att['url'];
            }
        }

        $items[] = [
            'reposted_by'   => $repostedBy,
            'author_name'   => $defaultAuthorName,
            'author_handle' => $config['default_author_handle'] ?? '',
            'avatar_url'    => $defaultAvatarUrl,
            'date_text'     => date('Y/m/d H:i', $msgTimestamp),
            'text'          => $normalized,
            'images'        => $discordImages,
            'quote'         => null,
            'tweet_url'     => '',
        ];
    }
}

if (count($items) === 0 && $emptyTextCount > 0) {
    echo json_encode([
        'ok' => false,
        'message' => 'Discordから本文を取得できませんでした。Discord Developer PortalでBotの「MESSAGE CONTENT INTENT」をONにしてください。'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($fxCacheUpdated) {
    if (count($fxCache) > 200) {
        $fxCache = array_slice($fxCache, -200, null, true);
    }
    @file_put_contents($fxCacheFile, json_encode($fxCache, JSON_UNESCAPED_UNICODE));
}

$response = [
    'ok'         => true,
    'updated_at' => date('Y/m/d H:i:s'),
    'items'      => $items,
];

@file_put_contents($timelineCacheFile, json_encode($response, JSON_UNESCAPED_UNICODE));
echo json_encode($response, JSON_UNESCAPED_UNICODE);