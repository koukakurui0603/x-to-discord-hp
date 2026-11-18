<?php
// ブラウザから直接このURLを開かれた場合は何も出さずに拒否するガード
if (realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    http_response_code(403);
    exit('Access Denied');
}

return [
    // 1. Discord Developer Portal で取得した Bot トークン
    'discord_bot_token'   => 'ここにDiscordのBOTトークン',

    // 2. 中継用チャンネルのチャンネルID
    'discord_channel_id'  => 'ここに中継用チャンネルのID',

    // キャッシュ保持時間（秒）: 通常60秒（更新ボタンを押した時も最低10秒間隔は保護）
    'cache_ttl_seconds'   => 60,

    // XのURLではなくDiscordへ直接メモを書いた時や、リポスト表記が省略された時の管理人名
    'default_author_name'   => 'サイト管理人',
    'default_author_handle' => '@your_account_id',
    'default_avatar_url'    => '',
];