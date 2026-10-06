import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUPPORTED_PLATFORMS,
  getPlatformConfig,
  getPlatformName,
  isSafeSocialHandleOrUrl,
  sanitizeSocialAccount,
  sanitizeSocialAccounts,
  formatSocialHandleDisplay,
  getDisplaySocialAccounts
} from '../src/utils/social';

test('Social accounts suite: platform configurations and validation', async (t) => {
  await t.test('1. Supported platforms list includes all 6 required platforms with bilingual names', () => {
    const platformIds = SUPPORTED_PLATFORMS.map((p) => p.id);
    assert.deepEqual(platformIds, ['instagram', 'tiktok', 'x', 'facebook', 'snapchat', 'youtube']);

    for (const p of SUPPORTED_PLATFORMS) {
      assert.ok(p.nameEn && p.nameEn.length > 0, `English name missing for ${p.id}`);
      assert.ok(p.nameAr && p.nameAr.length > 0, `Arabic name missing for ${p.id}`);
      assert.ok(p.placeholder && p.placeholder.length > 0, `Placeholder missing for ${p.id}`);
    }

    assert.equal(getPlatformConfig('instagram')?.nameEn, 'Instagram');
    assert.equal(getPlatformConfig('TIKTOK')?.nameAr, 'تيك توك');
    assert.equal(getPlatformConfig('unknown_platform'), undefined);

    assert.equal(getPlatformName('instagram', 'en'), 'Instagram');
    assert.equal(getPlatformName('instagram', 'ar'), 'إنستغرام');
    assert.equal(getPlatformName('custom', 'en'), 'custom');
    assert.equal(getPlatformName('', 'ar'), 'أخرى');
  });

  await t.test('2. isSafeSocialHandleOrUrl blocks dangerous/executable inputs and allows safe handles/URLs', () => {
    // Safe values
    assert.equal(isSafeSocialHandleOrUrl('username'), true);
    assert.equal(isSafeSocialHandleOrUrl('@my_handle'), true);
    assert.equal(isSafeSocialHandleOrUrl('https://instagram.com/user_123'), true);
    assert.equal(isSafeSocialHandleOrUrl('http://x.com/profile'), true);
    assert.equal(isSafeSocialHandleOrUrl('channel/UC12345'), true);

    // Unsafe / executable schemes and XSS payloads
    assert.equal(isSafeSocialHandleOrUrl('javascript:alert(1)'), false);
    assert.equal(isSafeSocialHandleOrUrl('JAVASCRIPT:void(0)'), false);
    assert.equal(isSafeSocialHandleOrUrl('data:text/html,<html>'), false);
    assert.equal(isSafeSocialHandleOrUrl('vbscript:msgbox'), false);
    assert.equal(isSafeSocialHandleOrUrl('file:///etc/passwd'), false);
    assert.equal(isSafeSocialHandleOrUrl('<script>alert(1)</script>'), false);
    assert.equal(isSafeSocialHandleOrUrl('user" onload="alert(1)'), false);
    assert.equal(isSafeSocialHandleOrUrl('ftp://example.com/user'), false);
    assert.equal(isSafeSocialHandleOrUrl(''), false);
    assert.equal(isSafeSocialHandleOrUrl('   '), false);
    assert.equal(isSafeSocialHandleOrUrl(null), false);
    assert.equal(isSafeSocialHandleOrUrl(undefined), false);
    assert.equal(isSafeSocialHandleOrUrl('a'.repeat(201)), false);
  });

  await t.test('3. sanitizeSocialAccount and sanitizeSocialAccounts clean and limit account lists', () => {
    const valid = sanitizeSocialAccount({ platform: 'TIKTOK', handle: 'dance_pro' });
    assert.deepEqual(valid, { platform: 'tiktok', handle: 'dance_pro' });

    const unsafe = sanitizeSocialAccount({ platform: 'x', handle: 'javascript:alert(1)' });
    assert.equal(unsafe, null);

    const empty = sanitizeSocialAccount({ platform: 'instagram', handle: '   ' });
    assert.equal(empty, null);

    const rawList = [
      { platform: 'instagram', handle: 'insta_user' },
      { platform: 'x', handle: 'x_user' },
      { platform: 'facebook', handle: 'javascript:bad()' },
      null,
      { platform: 'snapchat', handle: 'snap_user' }
    ];

    const sanitized = sanitizeSocialAccounts(rawList);
    assert.equal(sanitized.length, 3);
    assert.deepEqual(sanitized[0], { platform: 'instagram', handle: 'insta_user' });
    assert.deepEqual(sanitized[1], { platform: 'x', handle: 'x_user' });
    assert.deepEqual(sanitized[2], { platform: 'snapchat', handle: 'snap_user' });
  });

  await t.test('4. formatSocialHandleDisplay formats handles and profile URLs correctly', () => {
    assert.equal(formatSocialHandleDisplay({ platform: 'instagram', handle: 'john_doe' }), '@john_doe');
    assert.equal(formatSocialHandleDisplay({ platform: 'x', handle: '@john_doe' }), '@john_doe');
    assert.equal(formatSocialHandleDisplay({ platform: 'youtube', handle: 'https://youtube.com/@techchannel' }), '@techchannel');
  });

  await t.test('5. getDisplaySocialAccounts preserves multiple accounts and backwards-compatible legacy socialHandle', () => {
    // Multi-account case
    const partnerWithAccounts = {
      socialAccounts: [
        { platform: 'instagram', handle: 'user_ig' },
        { platform: 'x', handle: 'user_x' }
      ],
      socialHandle: 'legacy_ignored_when_accounts_exist'
    };
    const displayList1 = getDisplaySocialAccounts(partnerWithAccounts);
    assert.equal(displayList1.length, 2);
    assert.equal(displayList1[0].platform, 'instagram');
    assert.equal(displayList1[0].display, '@user_ig');
    assert.equal(displayList1[1].platform, 'x');
    assert.equal(displayList1[1].display, '@user_x');

    // Legacy fallback case (only socialHandle is present)
    const legacyPartner = {
      socialHandle: 'classic_handle'
    };
    const displayList2 = getDisplaySocialAccounts(legacyPartner);
    assert.equal(displayList2.length, 1);
    assert.equal(displayList2[0].platform, 'other');
    assert.equal(displayList2[0].handle, 'classic_handle');
    assert.equal(displayList2[0].display, '@classic_handle');

    // Empty case
    const emptyPartner = {};
    const displayList3 = getDisplaySocialAccounts(emptyPartner);
    assert.equal(displayList3.length, 0);
  });
});
