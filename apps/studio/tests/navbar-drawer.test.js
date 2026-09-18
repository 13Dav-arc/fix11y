import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('Phase 4: Navbar Mobile Drawer WCAG 2.2 AA Accessibility', () => {
  const navbarPath = fileURLToPath(new URL('../src/components/Navbar.jsx', import.meta.url));

  it('verifies Navbar component file exists', () => {
    assert.ok(fs.existsSync(navbarPath), 'Navbar.jsx must exist');
  });

  const content = fs.readFileSync(navbarPath, 'utf8');

  describe('ARIA Contract & Landmark Linkage', () => {
    it('links toggle button and drawer with aria-controls and matching id', () => {
      assert.match(
        content,
        /aria-controls="mobile-navigation-drawer"/,
        'Toggle button must link to drawer via aria-controls="mobile-navigation-drawer"'
      );
      assert.match(
        content,
        /id="mobile-navigation-drawer"/,
        'Drawer container must declare id="mobile-navigation-drawer"'
      );
    });

    it('declares modal dialog landmarks on the drawer container', () => {
      assert.match(
        content,
        /role="dialog"/,
        'Drawer container must declare role="dialog"'
      );
      assert.match(
        content,
        /aria-modal="true"/,
        'Drawer container must declare aria-modal="true" for assistive tech'
      );
      assert.match(
        content,
        /aria-label="Mobile Navigation"/,
        'Drawer container must have accessible label "Mobile Navigation"'
      );
    });

    it('binds dynamic aria-expanded attribute on toggle button', () => {
      assert.match(
        content,
        /aria-expanded=\{mobileMenuOpen\}/,
        'Toggle button must reflect state via aria-expanded'
      );
    });
  });

  describe('Focus Management & Keyboard Operability (WCAG 2.1.1, 2.1.2, 2.4.3)', () => {
    it('manages component refs for toggle button and drawer container', () => {
      assert.match(content, /toggleButtonRef\s*=\s*useRef\(null\)/, 'Must maintain toggleButtonRef');
      assert.match(content, /drawerRef\s*=\s*useRef\(null\)/, 'Must maintain drawerRef');
      assert.match(content, /ref=\{toggleButtonRef\}/, 'Must attach toggleButtonRef to toggle button');
      assert.match(content, /ref=\{drawerRef\}/, 'Must attach drawerRef to drawer container');
    });

    it('implements initial focus shift into drawer when opened', () => {
      assert.match(
        content,
        /drawerRef\.current\?\.querySelectorAll/,
        'Must query focusable elements inside drawer'
      );
      assert.match(
        content,
        /focusableElements\[0\]\.focus\(\)/,
        'Must shift focus to first focusable element when opened'
      );
    });

    it('implements return-of-focus restoration to toggle button when closed', () => {
      assert.match(
        content,
        /toggleButtonRef\.current\.focus\(\)/,
        'Must programmatically return focus to toggle button upon drawer close'
      );
    });

    it('implements Escape keydown handler to dismiss drawer', () => {
      assert.match(
        content,
        /if\s*\(\s*e\.key\s*===\s*['"]Escape['"]\s*\)/,
        'Must listen for Escape key to close drawer'
      );
      assert.match(
        content,
        /closeDrawer\(\)/,
        'Escape handler must trigger drawer close'
      );
    });

    it('implements Tab key focus trapping across boundary elements', () => {
      // Must check Tab key
      assert.match(
        content,
        /if\s*\(\s*e\.key\s*===\s*['"]Tab['"]\s*\)/,
        'Must trap Tab navigation while drawer is open'
      );

      // Must wrap Shift + Tab on first element to last element
      assert.match(
        content,
        /if\s*\(\s*e\.shiftKey\s*\)[\s\S]*?lastElement\.focus\(\)/,
        'Shift+Tab on first element must wrap to last focusable element'
      );

      // Must wrap Tab on last element to first element
      assert.match(
        content,
        /firstElement\.focus\(\)/,
        'Tab on last element must wrap to first focusable element'
      );
    });

    it('cleans up keydown event listener on unmount / state change', () => {
      assert.match(
        content,
        /window\.removeEventListener\(['"]keydown['"],\s*handleKeyDown\)/,
        'Must cleanly remove keydown event listener'
      );
    });
  });
});
