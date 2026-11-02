import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

function hexToRgb(hex: string): [number, number, number] {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test('Certificate gold tokens, stage badge, and concentric seal suite', async (t) => {
  const cssPath = path.join(process.cwd(), 'src', 'styles', 'Certificate.module.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  const certScreenPath = path.join(process.cwd(), 'src', 'components', 'CertificateScreen.tsx');
  const certScreenContent = fs.readFileSync(certScreenPath, 'utf8');

  const reviewScreenPath = path.join(process.cwd(), 'src', 'components', 'ReviewControlsScreen.tsx');
  const reviewScreenContent = fs.readFileSync(reviewScreenPath, 'utf8');

  await t.test('1. Certificate CSS defines gold tokens and achieves > 7:1 contrast ratio against pill background', () => {
    assert.ok(cssContent.includes('--cert-gold: #E2C27A'), 'CSS must define --cert-gold: #E2C27A');
    assert.ok(cssContent.includes('--cert-gold-strong: #F0D59A'), 'CSS must define --cert-gold-strong: #F0D59A');
    assert.ok(cssContent.includes('--cert-gold-deep: #B8903F'), 'CSS must define --cert-gold-deep: #B8903F');

    const ratio = contrastRatio('#F0D59A', '#1A1735');
    assert.ok(ratio >= 7.0, `Measured contrast ratio (${ratio.toFixed(2)}:1) must be at least 7:1`);
  });

  await t.test('2. Stage badge pill uses dark fill #1A1735, 1.5px solid var(--cert-gold), var(--cert-gold-strong) text, font-weight 700, and nowrap', () => {
    assert.ok(cssContent.includes('.stageBadge'), 'CSS must define .stageBadge');
    assert.ok(cssContent.includes('#1A1735'), 'stageBadge must use #1A1735 fill');
    assert.ok(cssContent.includes('border: 1.5px solid var(--cert-gold)'), 'stageBadge must use 1.5px solid var(--cert-gold)');
    assert.ok(cssContent.includes('color: var(--cert-gold-strong)'), 'stageBadge must use var(--cert-gold-strong)');
    assert.ok(cssContent.includes('font-weight: 700'), 'stageBadge must use font-weight: 700');
    assert.ok(cssContent.includes('white-space: nowrap'), 'stageBadge must use white-space: nowrap');
  });

  await t.test('3. Concentric seal uses gold double-ring, var(--cert-gold-strong) shield & text, and 24px subtle glow', () => {
    assert.ok(cssContent.includes('border: 1.5px solid var(--cert-gold)'), 'concentricSeal must use var(--cert-gold) outer ring');
    assert.ok(cssContent.includes('var(--cert-gold-deep)'), 'concentricSeal must use var(--cert-gold-deep) for inner ring');
    assert.ok(cssContent.includes('0 0 24px rgba(226, 194, 122, 0.25)') || cssContent.includes('rgba(226,194,122,0.25)'), 'concentricSeal must use 24px gold glow');
    assert.ok(cssContent.includes('var(--cert-gold-strong)'), 'concentricSeal must use var(--cert-gold-strong)');
  });

  await t.test('4. CertificateScreen and ReviewControlsScreen render stageBadge and gold seal', () => {
    assert.ok(certScreenContent.includes('styles.stageBadge'), 'CertificateScreen must use styles.stageBadge');
    assert.ok(certScreenContent.includes('var(--cert-gold-strong)'), 'CertificateScreen seal must use var(--cert-gold-strong)');

    assert.ok(reviewScreenContent.includes('styles.stageBadge'), 'ReviewControlsScreen must use styles.stageBadge');
    assert.ok(reviewScreenContent.includes('var(--cert-gold-strong)'), 'ReviewControlsScreen seal must use var(--cert-gold-strong)');
  });
});
